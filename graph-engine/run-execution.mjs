#!/usr/bin/env node
/**
 * run-execution.mjs — Spawned by Circus API to execute a graph
 *
 * Args: <executionId> <graphId>
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { Graph } from './graph.mjs';
import { GraphRunner } from './runner.mjs';

const execFileAsync = promisify(execFile);

const CIRCUS_DB = process.env.CIRCUS_DB || join(process.env.HOME || '/root', '.circus/circus.db');

/**
 * SQL escape helper
 */
function sqlEscape(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/'/g, "''").replace(/\0/g, '');
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
    console.error('[run-execution] dbQuery failed:', err.message);
    return [];
  }
}

/**
 * Run graph by ID — loads existing execution record and graph definition
 */
async function runGraphById(executionId, graphId, opts = {}) {
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

// Main entry point
const [,, executionId, graphId] = process.argv;
if (!executionId || !graphId) {
  console.error('[run-execution] Usage: run-execution.mjs <executionId> <graphId>');
  process.exit(1);
}

try {
  await runGraphById(executionId, graphId, {
    agentId: process.env.GRAPH_AGENT_ID || 'system',
    ringToken: process.env.GRAPH_RING_TOKEN || '',
  });
  console.log(`[run-execution] Execution ${executionId} completed`);
} catch (err) {
  console.error('[run-execution] Fatal:', err.message);
  process.exit(1);
}
