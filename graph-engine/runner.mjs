/**
 * runner.mjs — Graph execution engine
 *
 * GraphRunner executes a graph definition, maintaining state in Circus SQLite DB.
 * Supports all node types: task, worker, parallel, merge, human, conditional, passthrough.
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME_DIR = process.env.HOME || '/root';
const CIRCUS_DB = process.env.CIRCUS_DB || join(HOME_DIR, '.circus/circus.db');
const CIRCUS_URL = process.env.CIRCUS_URL || 'http://localhost:6200';
const BOT_CIRCUS_DIR = process.env.BOT_CIRCUS_DIR || join(__dirname, '..', 'bot-circus');

/**
 * Database connection singleton
 */
let _db = null;
function getDb() {
  if (!_db) {
    _db = new DatabaseSync(CIRCUS_DB);
    _db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000;');
  }
  return _db;
}

/**
 * Write to DB using parameterized queries (prevents SQL injection)
 */
async function dbExec(sql, params = []) {
  try {
    const db = getDb();
    const stmt = db.prepare(sql);
    stmt.run(...params);
  } catch (err) {
    console.error('[GraphRunner] dbExec failed:', err.message);
    throw err;
  }
}

/**
 * Query DB and return rows using parameterized queries (prevents SQL injection)
 */
async function dbQuery(sql, params = []) {
  try {
    const db = getDb();
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  } catch (err) {
    console.error('[GraphRunner] dbQuery failed:', err.message);
    return [];
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe eval using vm module (replaces dangerous eval())
 * HARDENED: No constructor access, no Array/Object/JSON, no prototype chain exploitation
 * Restricts context to state data only, no system access
 */
function safeEval(code, context = {}, timeoutMs = 500) {
  // Strip constructors and prototype chains from objects
  function stripConstructors(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    const clean = Object.create(null);
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      clean[key] = typeof val === 'object' && val !== null ? stripConstructors(val) : val;
    }
    return clean;
  }

  // Create completely isolated context
  const cleanContext = stripConstructors(JSON.parse(JSON.stringify(context)));

  const sandbox = vm.createContext(Object.create(null));
  sandbox.state = cleanContext;
  sandbox.output = cleanContext;

  // Explicitly block dangerous globals that VM might expose
  sandbox.Array = undefined;
  sandbox.Object = undefined;
  sandbox.Function = undefined;
  sandbox.eval = undefined;
  sandbox.globalThis = undefined;
  sandbox.global = undefined;
  sandbox.process = undefined;
  sandbox.require = undefined;
  sandbox.this = undefined;

  // Define safe helpers WITHOUT constructor access
  const makeSafe = (fn) => {
    const safe = function(...args) { return fn(...args); };
    Object.defineProperty(safe, 'constructor', { value: undefined, writable: false, enumerable: false });
    return safe;
  };

  sandbox.parseInt = makeSafe(parseInt);
  sandbox.parseFloat = makeSafe(parseFloat);
  sandbox.isNaN = makeSafe(isNaN);
  sandbox.isFinite = makeSafe(isFinite);
  sandbox.String = makeSafe(String);
  sandbox.Number = makeSafe(Number);
  sandbox.Boolean = makeSafe(Boolean);

  // Math object with stripped constructor
  const safeMath = Object.create(null);
  safeMath.abs = Math.abs;
  safeMath.ceil = Math.ceil;
  safeMath.floor = Math.floor;
  safeMath.round = Math.round;
  safeMath.max = Math.max;
  safeMath.min = Math.min;
  safeMath.pow = Math.pow;
  safeMath.sqrt = Math.sqrt;
  safeMath.log = Math.log;
  safeMath.random = Math.random;
  safeMath.PI = Math.PI;
  sandbox.Math = safeMath;

  try {
    return vm.runInContext(code, sandbox, { timeout: timeoutMs });
  } catch (err) {
    throw new Error(`Condition eval failed: ${err.message}`);
  }
}

/**
 * GraphRunner executes a graph
 */
export class GraphRunner {
  constructor(executionId, graph, input, options = {}) {
    this.executionId = executionId;
    this.graph = graph;
    this.state = {
      input,
      output: null,
      parallelContext: new Map(),
      currentNode: null,
      error: null
    };
    this.options = {
      ringToken: options.ringToken,
      agentId: options.agentId,
      maxRetries: options.maxRetries || 3,
      ...options
    };
    this.executionPath = [];
    this.checkpointIndex = 0;
  }

  /**
   * Audit log helper
   */
  async audit(eventType, nodeId = null, details = null) {
    const id = `audit-${randomUUID()}`;
    const now = new Date().toISOString();
    await dbExec(
      `INSERT INTO graph_audit_log (id, execution_id, node_id, event_type, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, this.executionId, nodeId || '', eventType, details ? JSON.stringify(details) : '', now]
    ).catch(e => console.warn('[GraphRunner] audit write failed:', e.message));
  }

  /**
   * Main execution loop
   */
  async run() {
    await this.audit('graph_started');

    try {
      let currentNodeId = this.graph.entryNode;

      while (currentNodeId) {
        const node = this.graph.nodes.get(currentNodeId);
        if (!node) {
          throw new Error(`Node ${currentNodeId} not found in graph`);
        }

        this.state.currentNode = currentNodeId;
        this.executionPath.push(currentNodeId);

        // Update execution state
        await this.updateExecution('running', {
          currentNode: currentNodeId,
          executionPath: JSON.stringify(this.executionPath)
        });

        console.log(`[GraphRunner] Executing node: ${currentNodeId} (${node.type})`);

        // Execute node
        const result = await this.executeNode(node);

        // Update state with result
        this.state.output = result;

        // Create checkpoint
        await this.createCheckpoint(currentNodeId);

        // Find next node
        currentNodeId = await this.getNextNode(currentNodeId, result);
      }

      // Execution complete
      await this.updateExecution('completed', {
        outputData: JSON.stringify(this.state.output),
        completedAt: new Date().toISOString()
      });

      await this.audit('graph_completed', null, { path: this.executionPath });
      console.log(`[GraphRunner] Execution ${this.executionId} completed`);
      return this.state.output;

    } catch (err) {
      console.error(`[GraphRunner] Execution ${this.executionId} failed:`, err.message);
      this.state.error = err.message;
      await this.updateExecution('failed', {
        error: err.message,
        completedAt: new Date().toISOString()
      });
      await this.audit('graph_failed', null, { error: err.message });
      throw err;
    }
  }

  /**
   * Execute a single node with retry logic
   */
  async executeNode(node) {
    const nodeExecId = `nexec-${randomUUID()}`;
    const now = new Date().toISOString();

    // Create node execution record
    await dbExec(
      `INSERT INTO node_executions (id, execution_id, node_id, node_type, state, input_data, created_at, updated_at, attempt)
       VALUES (?, ?, ?, ?, 'running', ?, ?, ?, 1)`,
      [nodeExecId, this.executionId, node.id, node.type, JSON.stringify(this.state.input || {}), now, now]
    );

    const maxRetries = node.config.maxRetries ?? this.options.maxRetries ?? 2;
    let lastErr;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        await this.audit('node_started', node.id, { type: node.type, attempt });

        // Set up node timeout
        const nodeTimeout = (node.config.timeout || this.options.nodeTimeout || 5 * 60 * 1000);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Node ${node.id} timed out after ${nodeTimeout}ms`)), nodeTimeout)
        );

        const executePromise = (async () => {
          switch (node.type) {
            case 'task':       return this.executeTaskNode(node, nodeExecId);
            case 'worker':     return this.executeWorkerNode(node, nodeExecId);
            case 'parallel':   return this.executeParallelNode(node, nodeExecId);
            case 'merge':      return this.executeMergeNode(node, nodeExecId);
            case 'human':      return this.executeHumanNode(node, nodeExecId);
            case 'conditional': return this.executeConditionalNode(node, nodeExecId);
            case 'passthrough': return { ...(this.state.output || this.state.input || {}) };
            default: throw new Error(`Unknown node type: ${node.type}`);
          }
        })();

        const result = await Promise.race([executePromise, timeoutPromise]);

        // Update node execution as completed
        const completedAt = new Date().toISOString();
        await dbExec(
          `UPDATE node_executions SET state = 'completed', output_data = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
          [JSON.stringify(result), completedAt, completedAt, nodeExecId]
        );

        await this.audit('node_completed', node.id, { attempt });
        return result;

      } catch (err) {
        lastErr = err;

        if (err.message.includes('timed out')) {
          await this.audit('node_timed_out', node.id, { timeout: nodeTimeout });
        }

        if (attempt <= maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          console.warn(`[GraphRunner] Node ${node.id} attempt ${attempt} failed, retrying in ${delay}ms:`, err.message);

          await this.audit('node_retried', node.id, { attempt, delay });

          // Update attempt counter in DB
          await dbExec(
            `UPDATE node_executions SET attempt = ?, updated_at = ? WHERE id = ?`,
            [attempt + 1, new Date().toISOString(), nodeExecId]
          );

          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // All retries exhausted
    const failedAt = new Date().toISOString();
    await dbExec(
      `UPDATE node_executions SET state = 'failed', error = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      [lastErr.message, failedAt, failedAt, nodeExecId]
    );
    await this.audit('node_failed', node.id, { error: lastErr.message, attempt: maxRetries + 1 });
    throw lastErr;
  }

  /**
   * Execute a task node (call Circus task API)
   */
  async executeTaskNode(node, nodeExecId) {
    const { agentId, taskType, payload } = node.config;

    // Submit task to Circus
    const taskRes = await fetch(`${CIRCUS_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.options.ringToken}`
      },
      body: JSON.stringify({
        to_agent_id: agentId,
        task_type: taskType || 'execute',
        payload: typeof payload === 'function' ? payload(this.state) : payload
      })
    });

    if (!taskRes.ok) {
      throw new Error(`Task submission failed: ${taskRes.status} ${await taskRes.text()}`);
    }

    const { task_id } = await taskRes.json();

    // Store task_id in node execution
    await dbExec(
      `UPDATE node_executions SET task_id = ? WHERE id = ?`,
      [task_id, nodeExecId]
    );

    // Poll for task completion
    let attempts = 0;
    const maxAttempts = 300; // 10 minutes at 2s intervals

    while (attempts < maxAttempts) {
      await sleep(2000);
      attempts++;

      const statusRes = await fetch(`${CIRCUS_URL}/api/v1/tasks/${task_id}`, {
        headers: { 'Authorization': `Bearer ${this.options.ringToken}` }
      });

      if (!statusRes.ok) {
        throw new Error(`Task status check failed: ${statusRes.status}`);
      }

      const taskData = await statusRes.json();

      if (taskData.state === 'completed') {
        return taskData.result || { status: 'completed' };
      } else if (taskData.state === 'failed') {
        throw new Error(`Task failed: ${taskData.error}`);
      }
    }

    throw new Error(`Task ${task_id} timed out after ${maxAttempts * 2}s`);
  }

  /**
   * Execute a worker node (dispatch to bot-circus)
   */
  async executeWorkerNode(node, nodeExecId) {
    const { botId, message } = node.config;

    try {
      // Validate BOT_CIRCUS_DIR is within expected base to prevent path traversal
      const { realpathSync } = await import('node:fs');
      const ALLOWED_BASE = process.env.HOME || '/root';
      let resolvedDispatchPath;
      try {
        resolvedDispatchPath = realpathSync(join(BOT_CIRCUS_DIR, 'dispatch.mjs'));
      } catch {
        throw new Error(`BOT_CIRCUS_DIR path invalid: ${BOT_CIRCUS_DIR}`);
      }
      if (!resolvedDispatchPath.startsWith(ALLOWED_BASE)) {
        throw new Error(`BOT_CIRCUS_DIR outside allowed base: ${resolvedDispatchPath}`);
      }
      const { dispatch } = await import(resolvedDispatchPath);

      const messageText = typeof message === 'function' ? message(this.state) : message;
      const result = await dispatch(botId, messageText);

      // Store worker result
      await dbExec(
        `UPDATE node_executions SET worker_result = ? WHERE id = ?`,
        [result.slice(0, 5000), nodeExecId]
      );

      return { result, botId };

    } catch (err) {
      throw new Error(`Worker dispatch failed: ${err.message}`);
    }
  }

  /**
   * Execute a parallel node (run branches concurrently)
   */
  async executeParallelNode(node, nodeExecId) {
    const { branches } = node.config;
    const now = new Date().toISOString();

    await this.audit('parallel_started', node.id, { branches });

    // Create branch records
    const branchPromises = branches.map(async (branchNodeId, index) => {
      const branchId = `branch-${randomUUID()}`;

      await dbExec(
        `INSERT INTO graph_parallel_branches (id, execution_id, parent_node_execution_id, branch_index, branch_node_id, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`,
        [branchId, this.executionId, nodeExecId, index, branchNodeId, now, now]
      );

      try {
        const branchNode = this.graph.nodes.get(branchNodeId);
        if (!branchNode) {
          throw new Error(`Branch node ${branchNodeId} not found`);
        }

        const result = await this.executeNode(branchNode);

        await dbExec(
          `UPDATE graph_parallel_branches SET state = 'completed', updated_at = ? WHERE id = ?`,
          [new Date().toISOString(), branchId]
        );

        return { branchNodeId, result };

      } catch (err) {
        await dbExec(
          `UPDATE graph_parallel_branches SET state = 'failed', updated_at = ? WHERE id = ?`,
          [new Date().toISOString(), branchId]
        );
        throw err;
      }
    });

    const settled = await Promise.allSettled(branchPromises);
    const results = [];
    const errors = [];

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        results.push(s.value);
      } else {
        errors.push(s.reason?.message || 'unknown error');
      }
    }

    if (errors.length > 0) {
      console.warn(`[GraphRunner] ${errors.length} parallel branch(es) failed:`, errors.join('; '));
    }

    // Store results in parallel context (even if some failed)
    for (const { branchNodeId, result } of results) {
      this.state.parallelContext.set(branchNodeId, result);
    }

    await this.audit('parallel_completed', node.id, { branches: results.length, errors: errors.length });
    return { branches: results, errors };
  }

  /**
   * Execute a merge node (combine parallel results)
   */
  async executeMergeNode(node) {
    const { strategy, sources } = node.config;

    const results = sources ? sources.map(s => this.state.parallelContext.get(s)) : Array.from(this.state.parallelContext.values());

    if (strategy === 'all') {
      return { merged: results };
    } else if (strategy === 'first') {
      return results[0];
    } else if (typeof strategy === 'function') {
      return strategy(results, this.state);
    } else {
      throw new Error(`Unknown merge strategy: ${strategy}`);
    }
  }

  /**
   * Execute a human node (pause for approval)
   */
  async executeHumanNode(node, nodeExecId) {
    const { prompt, options } = node.config;
    const approvalId = `approval-${randomUUID()}`;
    const now = new Date().toISOString();

    // Create approval record
    await dbExec(
      `INSERT INTO graph_human_approvals (id, execution_id, node_execution_id, prompt, options, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [approvalId, this.executionId, nodeExecId, prompt, options ? JSON.stringify(options) : null, now]
    );

    // Pause execution
    await this.updateExecution('paused');
    await this.audit('human_paused', node.id, { approvalId });

    console.log(`[GraphRunner] Waiting for human approval: ${approvalId}`);

    // Notify via Telegram if configured
    const telegramAdminId = process.env.TELEGRAM_ADMIN_ID;
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
    if (telegramAdminId && telegramBotToken) {
      const optionsList = options ? `\nOptions: ${options.join(' | ')}` : '';
      const text = `⏸ Graph approval needed\n\nExecution: \`${this.executionId}\`\nApproval: \`${approvalId}\`\n\n${prompt}${optionsList}\n\nReply with:\n/approve ${this.executionId} ${approvalId} <your response>`;
      try {
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: telegramAdminId, text, parse_mode: 'Markdown' }),
          signal: AbortSignal.timeout(8000),
        });
      } catch (e) {
        console.warn('[GraphRunner] Telegram notify failed:', e.message);
      }
    }

    // Poll for response with configurable timeout
    const maxPollMs = node.config.timeout || 24 * 60 * 60 * 1000; // default 24 hours
    const startPoll = Date.now();
    let attempts = 0;
    const maxAttempts = 86400; // safety cap

    while (attempts < maxAttempts) {
      if (Date.now() - startPoll > maxPollMs) {
        throw new Error(`Human node ${node.id} timed out after ${maxPollMs}ms`);
      }
      await sleep(3000);
      attempts++;

      const rows = await dbQuery(
        `SELECT response, responded_by FROM graph_human_approvals WHERE id = ?`,
        [approvalId]
      );

      if (rows.length > 0 && rows[0].response) {
        console.log(`[GraphRunner] Human approval received from ${rows[0].responded_by}`);
        await this.audit('human_resumed', node.id, { approvalId, response: rows[0].response });
        return { approved: true, response: rows[0].response, respondedBy: rows[0].responded_by };
      }
    }

    throw new Error(`Human approval ${approvalId} timed out after 24 hours`);
  }

  /**
   * Execute a conditional node (evaluate condition)
   */
  async executeConditionalNode(node) {
    const { condition } = node.config;

    if (typeof condition === 'function') {
      return condition(this.state);
    } else if (typeof condition === 'string') {
      // Safe eval using vm sandbox
      return safeEval(`(${condition})`, this.state);
    } else {
      throw new Error('Conditional node requires a function or string condition');
    }
  }

  /**
   * Get next node based on edges and conditions
   */
  async getNextNode(currentNodeId, currentResult) {
    // Find outgoing edges from current node
    const outgoingEdges = this.graph.edges.filter(e => e.from === currentNodeId);

    if (outgoingEdges.length === 0) {
      return null; // Terminal node
    }

    // Evaluate edges in order
    for (const edge of outgoingEdges) {
      if (!edge.condition) {
        return edge.to; // Unconditional edge
      }

      // Evaluate condition
      let conditionResult;
      if (typeof edge.condition === 'function') {
        conditionResult = edge.condition(this.state, currentResult);
      } else if (typeof edge.condition === 'string') {
        // Safe eval using vm sandbox
        const contextWithResult = { ...this.state, result: currentResult };
        conditionResult = safeEval(`(${edge.condition})`, contextWithResult);
      }

      if (conditionResult) {
        return edge.to;
      }
    }

    return null; // No matching condition
  }

  /**
   * Update execution record (using parameterized queries to prevent SQL injection)
   */
  async updateExecution(state, updates = {}) {
    const now = new Date().toISOString();
    const fields = [];
    const values = [];

    // Always update state and updated_at
    fields.push('state = ?');
    values.push(state);
    fields.push('updated_at = ?');
    values.push(now);

    // Add optional fields with parameterized values
    if (updates.currentNode !== undefined) {
      fields.push('current_node = ?');
      values.push(updates.currentNode);
    }
    if (updates.executionPath !== undefined) {
      fields.push('execution_path = ?');
      values.push(updates.executionPath);
    }
    if (updates.outputData !== undefined) {
      fields.push('output_data = ?');
      values.push(updates.outputData);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt);
    }

    // Add execution ID as final parameter
    values.push(this.executionId);

    await dbExec(
      `UPDATE graph_executions SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  /**
   * Create checkpoint
   */
  async createCheckpoint(nodeId) {
    const checkpointId = `checkpoint-${randomUUID()}`;
    const now = new Date().toISOString();

    // Find corresponding node execution
    const rows = await dbQuery(
      `SELECT id FROM node_executions WHERE execution_id = ? AND node_id = ? ORDER BY created_at DESC LIMIT 1`,
      [this.executionId, nodeId]
    );

    const nodeExecutionId = rows.length > 0 ? rows[0].id : null;

    await dbExec(
      `INSERT INTO graph_checkpoints (id, execution_id, node_execution_id, checkpoint_index, state_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [checkpointId, this.executionId, nodeExecutionId, this.checkpointIndex, JSON.stringify(this.state), now]
    );

    await this.audit('checkpoint_created', nodeId, { index: this.checkpointIndex });
    this.checkpointIndex++;
  }
}
