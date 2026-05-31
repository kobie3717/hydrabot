/**
 * index.mjs — Public API for graph orchestration
 *
 * Export high-level functions for:
 * - Defining graphs
 * - Running graphs
 * - Resuming paused executions
 * - Querying execution state
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { Graph, GraphNode, GraphEdge } from './graph.mjs';
import { GraphRunner } from './runner.mjs';

const execFileAsync = promisify(execFile);

const HOME_DIR = process.env.HOME || '/root';
const CIRCUS_DB = process.env.CIRCUS_DB || join(HOME_DIR, '.circus/circus.db');
const CIRCUS_URL = process.env.CIRCUS_URL || 'http://localhost:6200';

/**
 * SQL escape helper
 */
function sqlEscape(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/'/g, "''").replace(/\0/g, '');
}

/**
 * Write to DB
 */
async function dbExec(sql, params = []) {
  let finalSql = sql;
  for (const param of params) {
    const escaped = typeof param === 'string' ? `'${sqlEscape(param)}'` : String(param);
    finalSql = finalSql.replace('?', escaped);
  }

  try {
    const { stdout, stderr } = await execFileAsync('sqlite3', [CIRCUS_DB, finalSql], { timeout: 10000 });
    if (stderr) console.error('[graph-engine] sqlite3 stderr:', stderr);
    return stdout;
  } catch (err) {
    console.error('[graph-engine] dbExec failed:', err.message);
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
    console.error('[graph-engine] dbQuery failed:', err.message);
    return [];
  }
}

/**
 * Define and persist a graph to the database
 * @param {Graph} graph - Graph instance
 * @param {Object} opts - Options (ringToken, agentId)
 * @returns {Promise<string>} graphId
 */
export async function defineGraph(graph, opts = {}) {
  if (!(graph instanceof Graph)) {
    throw new Error('Must provide a Graph instance');
  }

  const validation = graph.validate();
  if (!validation.valid) {
    throw new Error(`Invalid graph: ${validation.errors.join(', ')}`);
  }

  if (validation.warnings.length > 0) {
    console.warn('[graph-engine] Graph warnings:', validation.warnings.join(', '));
  }

  const graphId = graph.id;
  const now = new Date().toISOString();
  const definition = graph.serialize();

  await dbExec(
    `INSERT INTO graph_definitions (id, name, version, created_by, definition, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [graphId, graph.name, graph.version, opts.agentId || 'system', definition, now]
  );

  console.log(`[graph-engine] Graph defined: ${graphId} (${graph.name} v${graph.version})`);
  return graphId;
}

/**
 * Run a graph execution (async, fire-and-forget)
 * @param {string} graphId - Graph ID or name
 * @param {Object} input - Input data for the graph
 * @param {Object} opts - Options (ringToken, agentId)
 * @returns {Promise<string>} executionId
 */
export async function runGraph(graphId, input, opts = {}) {
  // Resolve graph ID from name if needed
  let resolvedGraphId = graphId;
  if (!graphId.startsWith('graph-')) {
    const rows = await dbQuery(
      `SELECT id FROM graph_definitions WHERE name = ? ORDER BY version DESC LIMIT 1`,
      [graphId]
    );
    if (rows.length === 0) {
      throw new Error(`Graph not found: ${graphId}`);
    }
    resolvedGraphId = rows[0].id;
  }

  // Fetch graph definition
  const defRows = await dbQuery(
    `SELECT definition, version FROM graph_definitions WHERE id = ?`,
    [resolvedGraphId]
  );

  if (defRows.length === 0) {
    throw new Error(`Graph definition not found: ${resolvedGraphId}`);
  }

  const graph = Graph.deserialize(defRows[0].definition);
  const executionId = `exec-${randomUUID()}`;
  const now = new Date().toISOString();

  // Create execution record
  await dbExec(
    `INSERT INTO graph_executions (id, graph_id, graph_version, started_by, state, input_data, execution_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', ?, '[]', ?, ?)`,
    [executionId, resolvedGraphId, defRows[0].version, opts.agentId || 'system', JSON.stringify(input), now, now]
  );

  console.log(`[graph-engine] Execution started: ${executionId}`);

  // Run async (fire-and-forget with error logging)
  (async () => {
    try {
      const runner = new GraphRunner(executionId, graph, input, opts);
      await runner.run();
    } catch (err) {
      console.error(`[graph-engine] Execution ${executionId} failed:`, err.message);
    }
  })();

  return executionId;
}

/**
 * Resume a paused graph execution (human approval)
 * @param {string} executionId - Execution ID
 * @param {string} approvalId - Approval ID
 * @param {string} response - Human response
 * @param {Object} opts - Options (respondedBy)
 * @returns {Promise<void>}
 */
export async function resumeGraph(executionId, approvalId, response, opts = {}) {
  const now = new Date().toISOString();

  // Update approval record
  await dbExec(
    `UPDATE graph_human_approvals SET response = ?, responded_by = ?, responded_at = ? WHERE id = ? AND execution_id = ?`,
    [response, opts.respondedBy || 'anonymous', now, approvalId, executionId]
  );

  console.log(`[graph-engine] Approval ${approvalId} responded, execution will resume`);
}

/**
 * List graph executions
 * @param {Object} filters - Filters (state, startedBy, limit)
 * @returns {Promise<Array>}
 */
export async function listGraphExecutions(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.state) {
    conditions.push('state = ?');
    params.push(filters.state);
  }
  if (filters.startedBy) {
    conditions.push('started_by = ?');
    params.push(filters.startedBy);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 50;

  const rows = await dbQuery(
    `SELECT * FROM graph_executions ${whereClause} ORDER BY created_at DESC LIMIT ${limit}`,
    params
  );

  return rows;
}

/**
 * Get a single graph execution
 * @param {string} executionId - Execution ID
 * @returns {Promise<Object|null>}
 */
export async function getGraphExecution(executionId) {
  const rows = await dbQuery(
    `SELECT * FROM graph_executions WHERE id = ?`,
    [executionId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Cancel a running graph execution
 * @param {string} executionId - Execution ID
 * @returns {Promise<void>}
 */
export async function cancelGraph(executionId) {
  const now = new Date().toISOString();

  await dbExec(
    `UPDATE graph_executions SET state = 'canceled', updated_at = ?, completed_at = ? WHERE id = ? AND state IN ('running', 'paused')`,
    [now, now, executionId]
  );

  console.log(`[graph-engine] Execution ${executionId} canceled`);
}

/**
 * Run graph by ID (for spawned execution processes)
 * @param {string} executionId - Execution ID
 * @param {string} graphId - Graph ID
 * @param {Object} opts - Options (ringToken, agentId)
 * @returns {Promise<Object>} execution result
 */
export async function runGraphById(executionId, graphId, opts = {}) {
  const defRows = await dbQuery(
    `SELECT definition, version FROM graph_definitions WHERE id = ?`,
    [graphId]
  );
  if (defRows.length === 0) throw new Error(`Graph ${graphId} not found`);

  const graph = Graph.deserialize(defRows[0].definition);

  // Load input from existing execution record
  const execRows = await dbQuery(
    `SELECT input_data FROM graph_executions WHERE id = ?`,
    [executionId]
  );
  if (execRows.length === 0) throw new Error(`Execution ${executionId} not found`);
  const input = JSON.parse(execRows[0].input_data);

  const runner = new GraphRunner(executionId, graph, input, opts);
  return runner.run();
}

// Re-export graph classes
export { Graph, GraphNode, GraphEdge };
