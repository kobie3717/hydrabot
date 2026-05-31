# Configuration Reference

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Token from @BotFather |
| `ALLOWED_USER_ID` | Yes | — | Telegram user ID allowed to chat |
| `CLAUDE_CLI_PATH` | No | `claude` | Path to Claude Code CLI binary |
| `CLAUDE_WORKING_DIR` | No | `$HOME` | Working directory for Claude sessions |
| `CLAUDE_TIMEOUT` | No | `300000` | Claude CLI timeout in ms |
| `CIRCUS_URL` | No | `http://localhost:6200` | Circus API URL |
| `BOT_NAME` | No | — | Bot display name (used in Circus registration) |
| `WEBHOOK_URL` | No | — | Public URL for Telegram webhook mode |
| `WEBHOOK_PORT` | No | `7711` | Local port for webhook server |

## Circus API (`$HOME/circus/.env`)

| Variable | Description |
|----------|-------------|
| `CIRCUS_SECRET_KEY` | JWT signing secret (generate: `openssl rand -hex 32`) |
| `CIRCUS_OWNER_PRIVATE_KEY_PATH` | Path to EdDSA private key |
| `CIRCUS_OWNER_ID` | Owner username |

## Bot-Circus (`bot-circus/circus.config.json`)

| Field | Default | Description |
|-------|---------|-------------|
| `maxWorkers` | 10 | Max concurrent ephemeral workers |
| `requestTimeoutMs` | 120000 | Worker timeout (2 min) |
| `claudeRequestsPerMinute` | 100 | Rate limit for Claude API calls |

## Performer Workspace

Each bot gets a workspace at `performers/{botId}/`:

- **SOUL.md** — System prompt injected into every worker spawn (`--system-prompt`)
- **IDENTITY.md** — Name and role (for context/display)
- **MEMORY.md** — Append-only task log (workers write results here)
- **config.json** — Rate limits, model config, troupe assignment
