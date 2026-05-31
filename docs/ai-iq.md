# AI-IQ Memory System

AI-IQ is a long-term memory system for AI agents. It provides persistent, searchable memory with a CLI interface.

## Install

```bash
pip install ai-iq
```

## Core Commands

```bash
# Store a memory
memory-tool add learning "User prefers concise responses" --project MyBot --tags preference,ux

# Search memory
memory-tool search "user preferences" --semantic

# Full text search
memory-tool search "concise"

# List all memories for a project
memory-tool list --project MyBot

# Dream: consolidate duplicates, detect conflicts
memory-tool dream

# Show memory graph
memory-tool passport MyBot
```

## Categories

| Category | Use For |
|----------|---------|
| `learning` | Things the bot has learned (accumulative, no conflict detection) |
| `preference` | User preferences and settings |
| `fact` | Verified facts (accumulative) |
| `workflow` | Procedural knowledge (accumulative) |
| `belief` | Probabilistic beliefs (conflict-detected via embeddings) |
| `correction` | User corrections to bot behavior |

## Integration in Bots

AI-IQ is accessed via the `memory-tool` CLI from Node.js using `child_process.execFile`:

```javascript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Store
await execFileAsync('memory-tool', [
  'add', 'learning', 'User likes dark mode',
  '--project', 'MyBot', '--tags', 'preference,ui'
]);

// Search
const { stdout } = await execFileAsync('memory-tool', [
  'search', 'user interface preferences',
  '--semantic', '--full'
]);
```

## Database Location

Default: `~/ai-iq/memories.db`

Set via env: `MEMORY_DB=/custom/path/memories.db`

## Conflict Detection

For non-accumulative categories, AI-IQ uses sentence-transformers (all-MiniLM-L6-v2) to detect conflicting beliefs.

**Skip conflict detection** for high-volume accumulative categories (`learning`, `fact`, `workflow`) to avoid the ~3s embedding overhead.
