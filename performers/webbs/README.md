# webbs 🕸️ - Telegram Bot

Frontend web designer assistant bot. Spins production-ready HTML/CSS/JS via Claude.

## Setup

1. Create a new Telegram bot via [@BotFather](https://t.me/BotFather):
   - Send `/newbot`
   - Name: `webbs`
   - Username: `webbs_designer_bot` (or similar)
   - Copy the token

2. Configure `.env`:
   ```bash
   WEBBS_BOT_TOKEN=your_token_from_botfather
   ANTHROPIC_API_KEY=your_anthropic_api_key
   ALLOWED_USER_ID=6531675960  # Already set to your ID
   ```

3. Run:
   ```bash
   npm start
   ```

## Usage

Start chat with your bot, then:

- `/start` - Show help
- `/clear` - Reset conversation

Send any frontend design request:
- "Build a dark landing page for an auction app"
- "Create a pricing section with 3 tiers"
- "Design a bid button with animation"
- "Make a glass morphism card component"

Bot will respond with complete, runnable code + send as `.html` file attachment.

## Features

- Complete, production-ready code (no placeholders)
- WhatsAuction brand awareness (#FF6B35 orange, dark theme)
- Mobile-first responsive
- Hover/focus states on all interactive elements
- Semantic HTML
- CSS custom properties for theming
- Conversation memory (last 20 messages)

## Run as Service

Create `/etc/systemd/system/webbs.service`:

```ini
[Unit]
Description=webbs Telegram Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/webbs
ExecStart=/usr/bin/node /root/webbs/bot.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
systemctl daemon-reload
systemctl enable webbs
systemctl start webbs
systemctl status webbs
```

## Philosophy

> Every pixel is a thread. Make the web beautiful.

webbs delivers COMPLETE, RUNNABLE code — no TODOs, no placeholders, no compromises.
