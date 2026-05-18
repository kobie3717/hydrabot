/**
 * runner.mjs — Graph execution engine
 *
 * GraphRunner executes a graph definition, maintaining state in Circus SQLite DB.
 * Supports all node types: task, worker, parallel, merge, human, conditional, passthrough.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { join } from 'path';

const execFileAsync = promisify(execFile);

const CIRCUS_DB = process.env.CIRCUS_DB || join(process.env.HOME || '/root', '.circus/circus.db');
const CIRCUS_URL = process.env.CIRCUS_URL || 'http://localhost:6200';
const BOT_CIRCUS_DIR = process.env.BOT_CIRCUS_DIR || join(process.env.HOME || '/root', 'hydrabot/bot-circus');

/**
 * SQL escape helper for SQLite string literals
 */
function sqlEscape(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/'/g, "''").replace(/\0/g, '');
}

/**
 * Write to DB via sqlite3 CLI
 */
async function dbExec(sql, params = []) {
  // Replace ? placeholders with escaped values
  let finalSql = sql;
  for (const param of params) {
    const escaped = typeof param === 'string' ? `'${sqlEscape(param)}'` : String(param);
    finalSql = finalSql.replace('?', escaped);
  }

  try {
    const { stdout, stderr } = await execFileAsync('sqlite3', [CIRCUS_DB, finalSql], { timeout: 10000 });
    if (stderr) console.error('[GraphRunner] sqlite3 stderr:', stderr);
    return stdout;
  } catch (err) {
    console.error('[GraphRunner] dbExec failed:', err.message);
    throw err;
  }
}

/**
 * Query DB and return JSON rows
 */
async function dbQuery(sql, params = []) {
  let finalSql = sql;
  for (const param of params) {
    const escaped = typeof param === 'string' ? `'${sqlEscape(param)}'` : String(param);
    finalSql = finalSql.replace('?', escaped);
  }

  try {
    const { stdout } = await execFileAsync('sqlite3', [CIRCUS_DB, '-json', finalSql], { timeout: 10000 });
    return stdout.trim() ? JSON.parse(stdout) : [];
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
   * Main execution loop
   */
  async run() {
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

      console.log(`[GraphRunner] Execution ${this.executionId} completed`);
      return this.state.output;

    } catch (err) {
      console.error(`[GraphRunner] Execution ${this.executionId} failed:`, err.message);
      this.state.error = err.message;
      await this.updateExecution('failed', {
        error: err.message,
        completedAt: new Date().toISOString()
      });
      throw err;
    }
  }

  /**
   * Execute a single node
   */
  async executeNode(node) {
    const nodeExecId = `nexec-${randomUUID()}`;
    const now = new Date().toISOString();

    // Create node execution record
    await dbExec(
      `INSERT INTO node_executions (id, execution_id, node_id, node_type, state, input_data, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
      [nodeExecId, this.executionId, node.id, node.type, JSON.stringify(this.state.input || {}), now, now]
    );

    try {
      let result;

      switch (node.type) {
        case 'task':
          result = await this.executeTaskNode(node, nodeExecId);
          break;
        case 'worker':
          result = await this.executeWorkerNode(node, nodeExecId);
          break;
        case 'parallel':
          result = await this.executeParallelNode(node, nodeExecId);
          break;
        case 'merge':
          result = await this.executeMergeNode(node, nodeExecId);
          break;
        case 'human':
          result = await this.executeHumanNode(node, nodeExecId);
          break;
        case 'conditional':
          result = await this.executeConditionalNode(node, nodeExecId);
          break;
        case 'passthrough':
          result = { ...(this.state.output || this.state.input || {}) };
          break;
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      // Update node execution as completed
      const completedAt = new Date().toISOString();
      await dbExec(
        `UPDATE node_executions SET state = 'completed', output_data = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(result), completedAt, completedAt, nodeExecId]
      );

      return result;

    } catch (err) {
      // Update node execution as failed
      const failedAt = new Date().toISOString();
      await dbExec(
        `UPDATE node_executions SET state = 'failed', error = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        [err.message, failedAt, failedAt, nodeExecId]
      );
      throw err;
    }
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
      // Dynamically import dispatch from bot-circus
      const dispatchPath = join(BOT_CIRCUS_DIR, 'dispatch.mjs');
      const { dispatch } = await import(dispatchPath);

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

    const results = await Promise.all(branchPromises);

    // Store results in parallel context
    for (const { branchNodeId, result } of results) {
      this.state.parallelContext.set(branchNodeId, result);
    }

    return { branches: results };
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

    console.log(`[GraphRunner] Waiting for human approval: ${approvalId}`);

    // Poll for response
    let attempts = 0;
    const maxAttempts = 86400; // 24 hours at 3s intervals

    while (attempts < maxAttempts) {
      await sleep(3000);
      attempts++;

      const rows = await dbQuery(
        `SELECT response, responded_by FROM graph_human_approvals WHERE id = ?`,
        [approvalId]
      );

      if (rows.length > 0 && rows[0].response) {
        console.log(`[GraphRunner] Human approval received from ${rows[0].responded_by}`);
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
      // Eval string as function
      const fn = eval(`(${condition})`);
      return fn(this.state);
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
        const fn = eval(`(${edge.condition})`);
        conditionResult = fn(this.state, currentResult);
      }

      if (conditionResult) {
        return edge.to;
      }
    }

    return null; // No matching condition
  }

  /**
   * Update execution record
   */
  async updateExecution(state, updates = {}) {
    const now = new Date().toISOString();
    const fields = [`state = '${state}'`, `updated_at = '${now}'`];

    if (updates.currentNode) fields.push(`current_node = '${sqlEscape(updates.currentNode)}'`);
    if (updates.executionPath) fields.push(`execution_path = '${sqlEscape(updates.executionPath)}'`);
    if (updates.outputData) fields.push(`output_data = '${sqlEscape(updates.outputData)}'`);
    if (updates.error) fields.push(`error = '${sqlEscape(updates.error)}'`);
    if (updates.completedAt) fields.push(`completed_at = '${updates.completedAt}'`);

    await dbExec(
      `UPDATE graph_executions SET ${fields.join(', ')} WHERE id = ?`,
      [this.executionId]
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

    this.checkpointIndex++;
  }
}
