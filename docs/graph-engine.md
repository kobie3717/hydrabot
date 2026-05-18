# Graph Engine Reference

The Graph Engine provides LangGraph-style orchestration for complex multi-step workflows with parallel execution, human-in-the-loop approvals, conditional routing, and checkpointing.

## Overview

The Graph Engine executes directed acyclic graphs (DAGs) where each node represents a computational step (task, worker bot, parallel branches, human approval, conditional logic, or passthrough). Edges define the execution flow between nodes, with optional conditional routing. All execution state is persisted to SQLite with automatic checkpointing and resumption support.

## Node Types

| Type | Description | Required Config Fields |
|------|-------------|------------------------|
| `task` | Execute a Circus task on another agent | `agentId`, `taskType`, `payload` |
| `worker` | Dispatch to a bot-circus performer | `botId`, `message` |
| `parallel` | Fan out to multiple branches concurrently | `branches` (array of node IDs) |
| `merge` | Combine results from parallel branches | `strategy` ('all', 'first', or function), optional `sources` |
| `human` | Pause for human approval via Telegram | `prompt`, optional `options`, `timeout` |
| `conditional` | Evaluate a condition function | `condition` (function or string) |
| `passthrough` | Pass input to output unchanged | (none) |

### Node Config Details

**task**: `config.agentId` (Circus agent ID), `config.taskType` (e.g. 'execute'), `config.payload` (object or function receiving state)

**worker**: `config.botId` (bot-circus bot name), `config.message` (string or function receiving state)

**parallel**: `config.branches` (array of node IDs to execute concurrently), results stored in `state.parallelContext`

**merge**: `config.strategy` ('all' returns array, 'first' returns first result, function receives results array), optional `config.sources` (array of node IDs to merge, defaults to all parallel results)

**human**: `config.prompt` (approval message), optional `config.options` (array of valid responses), `config.timeout` (default 24h)

**conditional**: `config.condition` (function or string expression, receives state, returns boolean or value)

**passthrough**: No config needed, passes through current state

## Edge Syntax

Edges connect nodes and support conditional routing:

```javascript
{ from: 'node-a', to: 'node-b' }  // Unconditional edge
{ from: 'node-a', to: 'node-b', condition: (state, result) => result.approved }  // Conditional
{ from: 'node-a', to: 'node-b', condition: '(state, result) => result.score > 0.8' }  // String condition
```

Conditions can be functions or strings (serialized for DB storage). First matching edge is taken.

## JavaScript API

### defineGraph(name, builder, options)

Define a new graph and persist to Circus DB.

```javascript
import { defineGraph } from './graph-engine/index.mjs';

await defineGraph('content-pipeline', (g) => {
  g.addNode(new GraphNode('research', 'task', {
    agentId: 'agent-researcher',
    taskType: 'execute',
    payload: { action: 'research', topic: 'AI safety' }
  }));
  g.addNode(new GraphNode('review', 'human', {
    prompt: 'Review research findings. Approve to publish?',
    options: ['approve', 'reject', 'revise']
  }));
  g.addNode(new GraphNode('publish', 'task', {
    agentId: 'agent-publisher',
    taskType: 'execute',
    payload: (state) => ({ content: state.output.research })
  }));

  g.addEdge(new GraphEdge('research', 'review'));
  g.addEdge(new GraphEdge('review', 'publish', (state, result) => result.response === 'approve'));

  g.setEntryNode('research');
}, { version: 1 });
```

### runGraph(nameOrId, input, options)

Execute a graph with initial input data.

```javascript
import { runGraph } from './graph-engine/index.mjs';

const execution = await runGraph('content-pipeline', {
  topic: 'AI safety regulations',
  urgency: 'high'
}, {
  ringToken: process.env.CIRCUS_TOKEN,
  agentId: 'agent-webbs'
});

console.log('Execution ID:', execution.execution_id);
console.log('State:', execution.state);
```

Returns execution object with `execution_id`, `state` ('running', 'paused', 'completed', 'failed').

### resumeGraph(executionId, approvalId, response)

Resume a paused graph execution (respond to human approval).

```javascript
import { resumeGraph } from './graph-engine/index.mjs';

await resumeGraph('exec-abc123', 'approval-xyz789', 'approve');
```

### listGraphExecutions(state, limit)

List graph executions for the current agent.

```javascript
import { listGraphExecutions } from './graph-engine/index.mjs';

const executions = await listGraphExecutions('paused', 10);
for (const exec of executions.executions) {
  console.log(exec.id, exec.state, exec.created_at);
}
```

### cancelGraph(executionId)

Cancel a running or paused graph execution.

```javascript
import { cancelGraph } from './graph-engine/index.mjs';

await cancelGraph('exec-abc123');
```

## circus-bridge.mjs Exports

The `circus-bridge.mjs` module re-exports all graph functions with automatic agent token injection:

```javascript
import { runGraph, resumeGraph, listGraphExecutions } from './circus-bridge.mjs';

// No need to pass ringToken/agentId — uses bot's identity automatically
const exec = await runGraph('my-workflow', { input: 'data' });
```

Exported functions: `defineGraph`, `runGraph`, `resumeGraph`, `listGraphExecutions`, `cancelGraph`, `getExecution`

## Example Workflows

### Linear Pipeline (Task Nodes)

Research → Review → Publish workflow:

```javascript
await defineGraph('research-pipeline', (g) => {
  g.addNode(new GraphNode('fetch', 'task', {
    agentId: 'agent-researcher',
    taskType: 'execute',
    payload: { query: 'latest AI papers' }
  }));
  g.addNode(new GraphNode('analyze', 'task', {
    agentId: 'agent-analyst',
    taskType: 'execute',
    payload: (state) => ({ papers: state.output.results })
  }));
  g.addNode(new GraphNode('publish', 'worker', {
    botId: 'webbs',
    message: (state) => `Publish: ${state.output.summary}`
  }));

  g.addEdge(new GraphEdge('fetch', 'analyze'));
  g.addEdge(new GraphEdge('analyze', 'publish'));
  g.setEntryNode('fetch');
});
```

### Parallel Fan-Out with Merge

Fact-check and citation-check in parallel, then merge:

```javascript
await defineGraph('verification-workflow', (g) => {
  g.addNode(new GraphNode('draft', 'task', {
    agentId: 'agent-writer',
    taskType: 'execute',
    payload: { task: 'write article' }
  }));

  g.addNode(new GraphNode('parallel-verify', 'parallel', {
    branches: ['fact-check', 'cite-check']
  }));

  g.addNode(new GraphNode('fact-check', 'task', {
    agentId: 'agent-fact-checker',
    taskType: 'execute',
    payload: (state) => ({ content: state.output.draft })
  }));

  g.addNode(new GraphNode('cite-check', 'task', {
    agentId: 'agent-citation-bot',
    taskType: 'execute',
    payload: (state) => ({ content: state.output.draft })
  }));

  g.addNode(new GraphNode('merge-results', 'merge', {
    strategy: 'all'
  }));

  g.addNode(new GraphNode('done', 'passthrough'));

  g.addEdge(new GraphEdge('draft', 'parallel-verify'));
  g.addEdge(new GraphEdge('parallel-verify', 'merge-results'));
  g.addEdge(new GraphEdge('merge-results', 'done'));
  g.setEntryNode('draft');
});
```

### Human-in-the-Loop with Conditional Routing

Analyze → Human Approval → [Publish | Revise → Loop Back]:

```javascript
await defineGraph('content-approval', (g) => {
  g.addNode(new GraphNode('analyze', 'task', {
    agentId: 'agent-analyzer',
    taskType: 'execute',
    payload: { task: 'analyze content' }
  }));

  g.addNode(new GraphNode('human-approve', 'human', {
    prompt: 'Review content analysis. Approve, reject, or request revisions?',
    options: ['approve', 'reject', 'revise'],
    timeout: 48 * 60 * 60 * 1000  // 48 hours
  }));

  g.addNode(new GraphNode('publish', 'worker', {
    botId: 'webbs',
    message: 'Publishing approved content'
  }));

  g.addNode(new GraphNode('revise', 'task', {
    agentId: 'agent-writer',
    taskType: 'execute',
    payload: (state) => ({ feedback: state.output.response })
  }));

  g.addNode(new GraphNode('rejected', 'passthrough'));

  // Conditional edges based on human response
  g.addEdge(new GraphEdge('analyze', 'human-approve'));
  g.addEdge(new GraphEdge('human-approve', 'publish', (state, result) => result.response === 'approve'));
  g.addEdge(new GraphEdge('human-approve', 'revise', (state, result) => result.response === 'revise'));
  g.addEdge(new GraphEdge('human-approve', 'rejected', (state, result) => result.response === 'reject'));
  g.addEdge(new GraphEdge('revise', 'analyze'));  // Loop back

  g.setEntryNode('analyze');
});
```

## Telegram /approve Command

When a `human` node pauses execution, a Telegram message is sent to `TELEGRAM_ADMIN_ID`:

```
⏸ Graph approval needed

Execution: `exec-abc123...`
Approval: `approval-xyz789...`

Review content analysis. Approve, reject, or request revisions?
Options: approve | reject | revise

Reply with:
/approve exec-abc123... approval-xyz789... <your response>
```

Respond with:

```
/approve exec-abc123... approval-xyz789... approve
```

This resumes the graph execution with the provided response. The graph will proceed along the matching conditional edge.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_ADMIN_ID` | (required) | Telegram chat ID for approval notifications |
| `TELEGRAM_BOT_TOKEN` | `$BOT_TOKEN` | Telegram bot token for sending notifications |
| `GRAPH_ENGINE_DIR` | `~/hydrabot/graph-engine` | Path to graph engine code |
| `GRAPH_AGENT_ID` | (set by runner) | Agent ID of graph executor |
| `CIRCUS_DB` | `~/.circus/circus.db` | Path to Circus SQLite database |
| `CIRCUS_URL` | `http://localhost:6200` | Circus API base URL |

## Checkpointing

The graph runner automatically creates a checkpoint after each node execution. Checkpoints include:

- Full state snapshot (input, output, parallel context)
- Execution path (array of visited node IDs)
- Checkpoint index (increments sequentially)

Checkpoints enable:
- **Resumption**: Restart from last successful node after failure
- **Debugging**: Inspect state at any point in execution
- **Audit trail**: Reconstruct full execution history

To resume a failed execution, simply call `runGraph()` with the same execution ID — the runner detects existing state and continues from the last checkpoint.

## Resuming Paused Executions

### Via API

```javascript
import { resumeGraph } from './circus-bridge.mjs';

// List paused executions
const execs = await listGraphExecutions('paused');

// Resume with approval response
await resumeGraph(execs.executions[0].id, 'approval-xyz', 'approve');
```

### Via Telegram

When a graph pauses for human approval, you'll receive a Telegram message with the `/approve` command pre-filled. Just send:

```
/approve <exec-id> <approval-id> <your-response>
```

Example:
```
/approve exec-abc123def456 approval-xyz789 approve
```

The bot will call the Circus API to record your response, and the graph execution will resume automatically within seconds (the runner polls for responses every 3 seconds).

## API Endpoints

All graph endpoints require Bearer token authentication (`Authorization: Bearer <ring-token>`).

**POST** `/api/v1/graphs/define` — Define a new graph (body: `{ name, version, definition }`)

**POST** `/api/v1/graphs/run/<graph-id-or-name>` — Start execution (body: `{ input }`)

**GET** `/api/v1/graphs/executions/<execution-id>` — Get execution status

**GET** `/api/v1/graphs/executions?state=<state>&limit=<n>` — List executions

**POST** `/api/v1/graphs/executions/<execution-id>/resume` — Resume paused execution (body: `{ approval_id, response }`)

**DELETE** `/api/v1/graphs/executions/<execution-id>` — Cancel execution

**GET** `/api/v1/graphs/executions/<execution-id>/nodes` — List node executions

**GET** `/api/v1/graphs/executions/<execution-id>/approvals` — List human approvals

**GET** `/api/v1/graphs/executions/<execution-id>/audit` — Get audit log (NEW in this version)
