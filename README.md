# HydraBot

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-22%2B-brightgreen.svg)
![Python](https://img.shields.io/badge/python-3.10%2B-brightgreen.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

**Production-grade multi-agent AI infrastructure on a $5/mo VPS — Telegram bots, agent mesh, graph orchestration, and self-healing ops.**

## What Makes It Different

- **Telegram-Native Multi-Agent Mesh** — Agents live in Telegram chat threads, not web dashboards. Issue commands via `/slash commands` in any group or DM. Works on any phone already in your pocket. No browser, no React app, no vendor dashboard.

- **Circus Agent Mesh** — Agents aren't just functions; they hold cryptographic tokens, have persistent identities, and call each other over a REST API. One agent can register a task for another, spawn ephemeral workers, or broadcast to a shared room.

- **AI-IQ: Per-Bot Isolated Memory with Cross-Agent Promotion** — Each bot gets its own SQLite vector database. High-value memories auto-promote to the shared Circus pool every 6 hours. Each agent has its own mind with optional shared consciousness.

- **Ephemeral Worker Dispatch** — `bot-circus` spins up temporary Claude Code CLI processes on demand, runs a task, and terminates them. You pay per-task compute, not always-on idle.

- **LangGraph-Style Graph Engine with Human-in-the-Loop over Telegram** — Full graph orchestration (7 node types: task, worker, parallel, merge, human, conditional, passthrough). Human nodes pause execution and fire a Telegram message to the operator. When they reply `/approve`, execution resumes.

## Architecture

```
Telegram API
     │
     ▼
PM2 Bots (grammy + Claude Code CLI)
     │
     ▼
circus-bridge.mjs  ←──────────────────┐
     │                                 │
     ▼                                 │
Circus API (FastAPI :6200)      Bot-Circus dispatch
     │                          (ephemeral workers)
     ▼
AI-IQ (memory-tool CLI)
```

| Directory | What it is | Example |
|-----------|-----------|---------|
| `bots/` | Telegram front-door bots (always running via PM2) | Your one bot that users chat with |
| `performers/` | Specialist worker personas with SOUL.md | jobhunter, researcher, coder |
| `bot-circus/` | Dispatch bridge — spawns ephemeral Claude workers | `dispatch('jobhunter', 'review my CV')` |
| `circus/` | Multi-agent mesh (registry, rooms, tasks) | Shared knowledge, agent coordination |
| `graph-engine/` | Graph orchestration with human-in-the-loop | Multi-step workflows |
| `agents/` | Python agent packs (redteam, contract review) | Multi-agent analysis |

**Flow:** You chat with your bot in Telegram. For general questions, it answers directly. For specialist tasks, it dispatches to a performer via bot-circus. The performer runs as an ephemeral Claude process using its SOUL.md, does the work, and returns the result.

## Prerequisites

- Ubuntu 22.04 / Debian 12 (or macOS with Homebrew)
- A **Claude Max** subscription (claude.ai/upgrade)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram user ID from [@userinfobot](https://t.me/userinfobot)

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/kobie3717/hydrabot.git ~/Documents/hydrabot

# 2. Run the installer (installs in-place)
bash ~/Documents/hydrabot/deploy/install.sh
```

**Or install to a separate runtime directory** (keeps your git repo clean):

```bash
HYDRABOT_DIR=~/hydrabot bash ~/Documents/hydrabot/deploy/install.sh
```

The installer checks all prerequisites first and prompts before installing anything. It uses `sudo` only for system packages and systemd setup. It handles: Node.js 22, PM2, Claude Code CLI, Python deps, Circus API, and performer workspaces.

> **Auth step**: If Claude Code CLI wasn't already installed, the script will pause and ask you to run `claude login`. Do that, then re-run the installer.

## Configure a Bot

```bash
# Copy the template (replace $HYDRABOT_DIR with your install path)
cp -r $HYDRABOT_DIR/bots/template $HYDRABOT_DIR/bots/mybot

# Fill in your values
cp $HYDRABOT_DIR/bots/template/.env.example $HYDRABOT_DIR/bots/mybot/.env
nano $HYDRABOT_DIR/bots/mybot/.env

# Customize your bot's personality (optional — works with defaults)
nano $HYDRABOT_DIR/bots/mybot/SOUL.md

# Install dependencies
npm install --prefix $HYDRABOT_DIR/bots/mybot

# Start with PM2
pm2 start $HYDRABOT_DIR/bots/mybot/bot.mjs --name mybot
pm2 save
```

### Required `.env` values

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `ALLOWED_USER_ID` | Your Telegram numeric ID |
| `CLAUDE_CLI_PATH` | Output of `which claude` |
| `BOT_NAME` | Display name for your bot |

### Customize Personality

Edit `SOUL.md` in your bot directory to define its personality, expertise, and behavior rules. The file uses `{{BOT_NAME}}` as a placeholder that gets replaced with your `BOT_NAME` from `.env`. If you delete SOUL.md, the bot falls back to a generic assistant prompt.

## Create a Performer

Performers are specialist workers your bot can dispatch tasks to. Each performer has its own SOUL.md that defines its expertise.

```bash
# Copy the template
cp -r $HYDRABOT_DIR/performers/template $HYDRABOT_DIR/performers/jobhunter

# Edit the personality and config
nano $HYDRABOT_DIR/performers/jobhunter/SOUL.md
nano $HYDRABOT_DIR/performers/jobhunter/config.json  # set id and name
```

No restart needed — your bot discovers performers automatically.

### Telegram Commands

| Command | Description |
|---------|-------------|
| (any message) | Chat with Claude (multi-turn session) |
| `/performers` | List available performers |
| `/ask <performer> <message>` | Dispatch a task to a performer |
| `/clear` | Reset conversation session |
| `/session` | Show session info (message count, age) |
| `/approve` | Resume a paused graph execution |

## Verify Circus is Running

```bash
curl http://localhost:6200/health
# → {"status": "ok"}
```

## Start the Autonomous Worker (optional)

The worker polls a job queue and runs long tasks via Claude:

```bash
cp $HYDRABOT_DIR/performers/worker/.env.example $HYDRABOT_DIR/performers/worker/.env
nano $HYDRABOT_DIR/performers/worker/.env
npm install --prefix $HYDRABOT_DIR/performers/worker
pm2 start $HYDRABOT_DIR/performers/worker/worker.mjs --name worker
pm2 save
```

## Requirements

| | Minimum | Recommended |
|--|---------|-------------|
| RAM | 1 GB | 2 GB |
| Disk | 5 GB | 10 GB |
| CPU | 1 core | 2 cores |
| Node.js | 22.x | 22.x |
| Python | 3.10 | 3.11+ |

## Directory Structure

```
hydrabot/
├── deploy/
│   ├── install.sh             # Full VPS installer
│   ├── circus-api.service     # systemd unit
│   └── ecosystem.config.cjs  # PM2 config
├── bot-circus/
│   ├── dispatch.mjs           # Ephemeral worker pool
│   └── setup-performers.mjs  # Init performer workspaces
├── performers/
│   ├── template/              # Blank performer workspace
│   ├── webbs/                 # Frontend designer bot
│   └── worker/                # Autonomous job worker
├── bots/
│   └── template/              # Bot starter template
├── circus-bridge.mjs          # Circus integration module
├── graph-engine/              # Graph orchestration engine
└── docs/
    ├── architecture.md
    ├── configuration.md
    └── ai-iq.md
```

## Bot Template Structure

Each bot in `bots/` follows this pattern:

```
bots/mybot/
├── bot.mjs              # Main entry point (Grammy bot)
├── commands/            # Slash command handlers
├── handlers/            # Message/callback handlers
├── .env                 # Bot config (token, user ID, etc.)
└── package.json         # Dependencies
```

## Contributing

PRs welcome! Open an issue first for large changes. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

For architecture and design decisions, check the `docs/` directory.

## License

MIT License — see [LICENSE](LICENSE)
