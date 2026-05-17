# HydraBot Stack

A deployable multi-agent AI infrastructure — persistent memory, agent mesh, ephemeral workers, and Telegram bots powered by Claude Code CLI.

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

| Layer | Component | Purpose |
|-------|-----------|---------|
| 0 | Claude Code CLI | AI inference engine |
| 1 | AI-IQ | Per-agent long-term memory |
| 2 | Circus | Multi-agent mesh (registry, rooms, tasks) |
| 3 | Bot-Circus | Ephemeral worker pool |
| 4 | circus-bridge.mjs | Node.js ↔ Circus integration |
| 5 | Bots | Telegram interface + business logic |

## Prerequisites

- Ubuntu 22.04 / Debian 12 (or macOS with Homebrew)
- A **Claude Max** subscription (claude.ai/upgrade)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram user ID from [@userinfobot](https://t.me/userinfobot)

## Install

```bash
# 1. Clone the repo
git clone <repo-url> /opt/hydrabot

# 2. Run the installer (as root or with sudo)
sudo HYDRABOT_DIR=/opt/hydrabot bash /opt/hydrabot/deploy/install.sh
```

The installer handles: Node.js 22, PM2, Claude Code CLI, Python deps, Circus API, and performer workspaces.

> **Auth step**: If Claude Code CLI wasn't already installed, the script will pause and ask you to run `claude login`. Do that, then re-run the installer.

## Configure a Bot

```bash
# Copy the template
cp -r /opt/hydrabot/bots/template /opt/hydrabot/bots/mybot

# Fill in your values
cp /opt/hydrabot/bots/template/.env.example /opt/hydrabot/bots/mybot/.env
nano /opt/hydrabot/bots/mybot/.env

# Install dependencies
npm install --prefix /opt/hydrabot/bots/mybot

# Start with PM2
pm2 start /opt/hydrabot/bots/mybot/bot.mjs --name mybot
pm2 save
```

### Required `.env` values

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `ALLOWED_USER_ID` | Your Telegram numeric ID |
| `CLAUDE_CLI_PATH` | Output of `which claude` |
| `BOT_NAME` | Display name for your bot |

## Verify Circus is Running

```bash
curl http://localhost:6200/health
# → {"status": "ok"}
```

## Start the Autonomous Worker (optional)

The worker polls a job queue and runs long tasks via Claude:

```bash
cp /opt/hydrabot/performers/worker/.env.example /opt/hydrabot/performers/worker/.env
nano /opt/hydrabot/performers/worker/.env
npm install --prefix /opt/hydrabot/performers/worker
pm2 start /opt/hydrabot/performers/worker/worker.mjs --name worker
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
└── docs/
    ├── architecture.md
    ├── configuration.md
    └── ai-iq.md
```

## License

Private — All Rights Reserved
