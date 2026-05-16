# HydraBot Stack

> A deployable multi-agent AI infrastructure — persistent memory, agent mesh, ephemeral workers, and Telegram bots powered by Claude Code CLI.

## What's Inside

| Layer | Component | Purpose |
|-------|-----------|---------|
| 0 | Claude Code CLI | AI inference engine |
| 1 | AI-IQ | Per-agent long-term memory (SQLite + vectors + graph) |
| 2 | Circus | Multi-agent commons (registry, rooms, tasks, trust) |
| 3 | Bot-Circus | Ephemeral worker pool (dispatch.mjs) |
| 4 | circus-bridge.mjs | Shared Node.js integration layer |
| 5 | Individual Bots | Telegram interface + business logic |

## Quick Start

### Prerequisites
- Linux VPS or macOS (Apple Silicon supported)
- Node.js 22+
- Python 3.10+
- [Claude Code CLI](https://claude.ai/claude-code) installed and authenticated
- PM2: `npm install -g pm2`
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### 1. Install Python Packages

```bash
pip install ai-iq circus-agent
```

### 2. Start Circus API

```bash
# Copy and edit the systemd service
sudo cp deploy/circus-api.service /etc/systemd/system/
sudo systemctl enable --now circus-api

# Or run manually
python3 -m uvicorn circus.app:app --host 127.0.0.1 --port 6200
```

### 3. Set Up Bot-Circus Workers

```bash
npm install --prefix bot-circus
node bot-circus/setup-performers.mjs
```

### 4. Configure and Start a Bot

```bash
cp bots/template/.env.example bots/template/.env
# Edit .env with your TELEGRAM_BOT_TOKEN and ALLOWED_USER_ID
npm install --prefix bots/template
pm2 start bots/template/bot.mjs --name my-bot
```

## Architecture

```
Telegram API
     │
     ▼
PM2 Bots (grammy + Claude Code CLI)
     │
     ▼
circus-bridge.mjs  ←──────────────────────────────┐
     │                                              │
     ▼                                              │
Circus API (FastAPI :6200) ←── systemd            │
     │                                              │
     ▼                                              │
AI-IQ (memory-tool CLI)                Bot-Circus dispatch
                                        (ephemeral workers)
```

## Repository Structure

```
hydrabot/
├── README.md
├── circus-bridge.mjs          # Shared Circus integration (copy to each bot dir)
├── bot-circus/
│   ├── dispatch.mjs           # Ephemeral worker pool
│   ├── setup-performers.mjs   # Initialize performer workspaces
│   ├── circus.config.json     # Worker pool configuration
│   └── lib/
│       └── worker-pool.js     # Worker pool class
├── performers/
│   └── template/              # Performer workspace template
├── bots/
│   └── template/              # Bot implementation template
├── deploy/
│   ├── install.sh             # Full VPS install script
│   ├── circus-api.service     # systemd service file
│   └── ecosystem.config.cjs   # PM2 ecosystem config
└── docs/
    ├── architecture.md
    ├── configuration.md
    └── ai-iq.md
```

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Configuration Reference](docs/configuration.md)
- [AI-IQ Memory System](docs/ai-iq.md)

## Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| RAM | 1 GB | 2 GB |
| Disk | 5 GB | 10 GB |
| CPU | 1 core | 2 cores |
| Node.js | 22.x | 22.x |
| Python | 3.10 | 3.10+ |

## License

Private — All Rights Reserved
