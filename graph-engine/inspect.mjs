#!/usr/bin/env node
/**
 * inspect.mjs — Visual graph inspector CLI
 * Usage: node inspect.mjs <graph-id-or-name> [execution-id]
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const HOME_DIR = process.env.HOME || '/root';
const CIRCUS_DB = process.env.CIRCUS_DB || join(HOME_DIR, '.circus/circus.db');

const STATE_ICONS = {
  completed: '✅', running: '🔄', failed: '❌', paused: '⏸', pending: '⏳', skipped: '⏭'
};

const NODE_COLORS = {
  task: '\x1b[34m',       // blue
  worker: '\x1b[35m',     // magenta
  parallel: '\x1b[36m',   // cyan
  merge: '\x1b[36m',      // cyan
  human: '\x1b[33m',      // yellow
  conditional: '\x1b[32m', // green
  passthrough: '\x1b[37m', // white
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

async function dbQuery(sql) {
  const { stdout } = await execFileAsync('sqlite3', [CIRCUS_DB, '-json', sql], { timeout: 5000 });
  return stdout.trim() ? JSON.parse(stdout) : [];
}

async function listGraphs() {
  const rows = await dbQuery(`
    SELECT name, MAX(version) as version, COUNT(*) as versions, created_at
    FROM graph_definitions GROUP BY name ORDER BY created_at DESC LIMIT 20
  `);
  console.log(`\n${BOLD}Graphs (${rows.length})${RESET}`);
  for (const r of rows) {
    console.log(`  ${r.name} ${DIM}v${r.version} · ${r.created_at.slice(0,16)}${RESET}`);
  }
}

async function listExecutions(graphName) {
  const rows = await dbQuery(`
    SELECT e.id, e.state, e.created_at, e.completed_at, e.error
    FROM graph_executions e
    JOIN graph_definitions g ON e.graph_id = g.id
    WHERE g.name = '${graphName}' ORDER BY e.created_at DESC LIMIT 10
  `);
  console.log(`\n${BOLD}Executions for ${graphName} (${rows.length})${RESET}`);
  for (const r of rows) {
    const icon = STATE_ICONS[r.state] || '?';
    const dur = r.completed_at ? ` ${Math.round((new Date(r.completed_at)-new Date(r.created_at))/1000)}s` : '';
    const err = r.error ? ` ${DIM}${r.error.slice(0,50)}${RESET}` : '';
    console.log(`  ${icon} ${r.id.slice(0,20)}… ${r.state}${dur}${err}`);
  }
}

async function inspectGraph(graphIdOrName, executionId) {
  // Resolve graph
  let defRow;
  if (graphIdOrName.startsWith('graph-')) {
    const rows = await dbQuery(`SELECT * FROM graph_definitions WHERE id='${graphIdOrName}' LIMIT 1`);
    defRow = rows[0];
  } else {
    const rows = await dbQuery(`SELECT * FROM graph_definitions WHERE name='${graphIdOrName}' ORDER BY version DESC LIMIT 1`);
    defRow = rows[0];
  }
  if (!defRow) { console.error(`Graph not found: ${graphIdOrName}`); process.exit(1); }

  const def = JSON.parse(defRow.definition);
  const nodes = def.nodes || [];
  const edges = def.edges || [];

  // Load execution state if provided
  let nodeStates = {};
  let execRow = null;
  let auditRows = [];
  if (executionId) {
    const execRows = await dbQuery(`SELECT * FROM graph_executions WHERE id='${executionId}'`);
    execRow = execRows[0];
    if (execRow) {
      const nodeExecs = await dbQuery(`SELECT node_id, state, attempt, error FROM node_executions WHERE execution_id='${executionId}' ORDER BY created_at DESC`);
      for (const n of nodeExecs) {
        if (!nodeStates[n.node_id]) nodeStates[n.node_id] = n; // most recent
      }
      auditRows = await dbQuery(`SELECT event_type, node_id, created_at, details FROM graph_audit_log WHERE execution_id='${executionId}' ORDER BY created_at ASC LIMIT 50`).catch(() => []);
    }
  }

  // Header
  console.log(`\n${BOLD}${def.name || defRow.name}${RESET} ${DIM}v${defRow.version} · ${defRow.id}${RESET}`);
  if (execRow) {
    const icon = STATE_ICONS[execRow.state] || '?';
    const dur = execRow.completed_at ? ` · ${Math.round((new Date(execRow.completed_at)-new Date(execRow.created_at))/1000)}s` : '';
    console.log(`${icon} Execution: ${executionId} [${execRow.state}${dur}]`);
    if (execRow.error) console.log(`  ${DIM}Error: ${execRow.error}${RESET}`);
  }

  // Build adjacency for topological sort
  const inDegree = {};
  const outEdges = {};
  for (const n of nodes) { inDegree[n.id] = 0; outEdges[n.id] = []; }
  for (const e of edges) {
    inDegree[e.to] = (inDegree[e.to] || 0) + 1;
    outEdges[e.from] = outEdges[e.from] || [];
    outEdges[e.from].push(e);
  }

  // Topological sort (Kahn's algorithm)
  const queue = nodes.filter(n => (inDegree[n.id] || 0) === 0).map(n => n.id);
  const order = [];
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    for (const e of (outEdges[id] || [])) {
      inDegree[e.to]--;
      if (inDegree[e.to] <= 0) queue.push(e.to);
    }
  }
  // Add any remaining (cycles)
  for (const n of nodes) if (!visited.has(n.id)) order.push(n.id);

  // Render nodes
  console.log(`\n${BOLD}Nodes:${RESET}`);
  for (const nodeId of order) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;
    const color = NODE_COLORS[node.type] || '';
    const ns = nodeStates[nodeId];
    const icon = ns ? (STATE_ICONS[ns.state] || '○') : '○';
    const isEntry = nodeId === def.entryNode ? ' ← entry' : '';
    const hasNext = (outEdges[nodeId] || []).length > 0;
    const nextIds = (outEdges[nodeId] || []).map(e => e.to).join(', ');
    const attempt = ns && ns.attempt > 1 ? ` (attempt ${ns.attempt})` : '';
    const err = ns && ns.error ? ` ${DIM}[${ns.error.slice(0,40)}]${RESET}` : '';

    console.log(`  ${icon} ${color}${BOLD}${nodeId}${RESET} ${DIM}(${node.type})${isEntry}${RESET}${attempt}${err}`);
    if (hasNext) {
      for (const e of outEdges[nodeId]) {
        const cond = e.condition ? ` ${DIM}if: ${String(e.condition).slice(0,40)}${RESET}` : '';
        console.log(`     └→ ${e.to}${cond}`);
      }
    }
  }

  // Execution path if available
  if (execRow && execRow.execution_path) {
    try {
      const path = JSON.parse(execRow.execution_path);
      if (path.length) {
        console.log(`\n${BOLD}Execution path:${RESET}`);
        console.log('  ' + path.map(id => {
          const ns = nodeStates[id];
          const icon = ns ? (STATE_ICONS[ns.state] || '○') : '○';
          return `${icon} ${id}`;
        }).join(' → '));
      }
    } catch {}
  }

  // Recent audit log
  if (auditRows.length) {
    console.log(`\n${BOLD}Audit log (last 10):${RESET}`);
    for (const a of auditRows.slice(-10)) {
      const time = a.created_at.slice(11,19);
      const node = a.node_id ? ` [${a.node_id}]` : '';
      console.log(`  ${DIM}${time}${RESET} ${a.event_type}${node}`);
    }
  }

  console.log();
}

// Main
const args = process.argv.slice(2);
if (args[0] === '--list' || args.length === 0) {
  await listGraphs();
} else if (args[0] === '--executions' && args[1]) {
  await listExecutions(args[1]);
} else if (args.length >= 1) {
  await inspectGraph(args[0], args[1]);
} else {
  console.log('Usage: node inspect.mjs <graph-name> [exec-id]');
  console.log('       node inspect.mjs --list');
  console.log('       node inspect.mjs --executions <graph-name>');
}
