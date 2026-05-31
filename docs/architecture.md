# Architecture Overview

HydraBot is a 5-layer AI agent operating system. Each layer is independently deployable and fails gracefully if a lower layer is unavailable.

## Layer Stack

```
Layer 5: Individual Bots (Telegram / user interface)
         grammy + Claude Code CLI + circuit-breaker session mgmt
              │
Layer 4: circus-bridge.mjs (shared integration glue)
         registration, rooms, tasks, shared memory, preferences
              │
Layer 3: Bot-Circus (ephemeral worker pool)
         dispatch.mjs → claude --print --model sonnet-4-6
              │
Layer 2: Circus API (multi-agent commons)
         FastAPI :6200 — registry, trust, tasks, SSE, federation
              │
Layer 1: AI-IQ (persistent memory)
         memory-tool CLI → SQLite + FTS5 + vectors + knowledge graph
              │
Layer 0: Claude Code CLI
         The AI inference engine that powers everything
```

## Key Design Decisions

### Non-Fatal Integration
Every Circus call in `circus-bridge.mjs` is wrapped in try/catch and fails gracefully. If Circus is down, bots continue working with local memory only.

### Ephemeral Workers
Sub-tasks are handled by short-lived `claude --print` processes. They start, do the work, write to MEMORY.md, then exit. No long-running worker processes.

### Star Topology
All workers for a given bot share the same `performers/{botId}/` workspace. Workers see the same SOUL.md persona and MEMORY.md context.

### Handlers Before Registration
Task handlers are registered in the in-memory map before `circusRegister()` is called. If Circus is unreachable at boot, handlers survive. `enableAutoReconnect()` retries every 5 minutes.

## Data Stores

| Store | Location | Size | Purpose |
|-------|----------|------|---------|
| AI-IQ memories.db | `$HOME/ai-iq/memories.db` | ~6 MB | Per-agent long-term memory |
| Circus circus.db | `$HOME/.circus/circus.db` | ~57 MB | Shared agent commons |
| Bot session state | In-memory (per process) | KB | Active conversation context |
| Performer MEMORY.md | `performers/{id}/MEMORY.md` | KB | Worker task logs |

## Communication Patterns

### Request-Response (Telegram → Bot)
User message → grammy webhook → Claude session → response

### Pub-Sub (Shared Knowledge)
Bot learns something → `writeSharedKnowledge()` → POST `/memory-commons/publish` → Circus SSE broadcast → other bots read on next poll

### Task Delegation (A2A)
Bot A calls `submitTask(targetAgentId, type, payload)` → Circus stores in tasks table → Bot B polls inbox (every 60s) → processes via registered handler → updates task state to 'completed'

### Ephemeral Workers
`dispatch(botId, prompt)` → spawn `claude --print` with `cwd: performers/{botId}/` → collect stdout → append to MEMORY.md → resolve promise
