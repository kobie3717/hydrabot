#!/usr/bin/env bash
# HydraBot Stack — Full VPS Install Script
# Tested on Ubuntu 22.04 / Debian 12

set -euo pipefail

HYDRABOT_DIR="${HYDRABOT_DIR:-/opt/hydrabot}"
NODE_VERSION="22"

echo "=== HydraBot Stack Installer ==="
echo "Install dir: $HYDRABOT_DIR"

# 1. System dependencies
echo "[1/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git python3 python3-pip sqlite3 build-essential

# 2. Node.js
echo "[2/7] Installing Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node --version)"

# 3. PM2
echo "[3/7] Installing PM2..."
npm install -g pm2 2>/dev/null || true
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# 4. Claude Code CLI
echo "[4/7] Installing Claude Code CLI..."
if ! command -v claude &>/dev/null; then
  npm install -g @anthropic-ai/claude-code
  echo "Run 'claude' once to authenticate before continuing."
  exit 0
fi
echo "Claude: $(claude --version)"

# 5. Python packages
echo "[5/7] Installing Python packages..."
pip3 install ai-iq circus-agent --quiet

# 6. Bot-Circus dependencies
echo "[6/7] Setting up Bot-Circus..."
cd "$HYDRABOT_DIR/bot-circus"
npm install --quiet
node setup-performers.mjs

# 7. Circus API systemd service
echo "[7/7] Installing Circus API service..."
cp "$HYDRABOT_DIR/deploy/circus-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable circus-api
systemctl start circus-api

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy bots/template to bots/my-bot"
echo "  2. Edit bots/my-bot/.env with your tokens"
echo "  3. npm install --prefix bots/my-bot"
echo "  4. pm2 start bots/my-bot/bot.mjs --name my-bot"
echo "  5. pm2 save"
