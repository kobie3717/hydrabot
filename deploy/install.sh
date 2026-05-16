#!/usr/bin/env bash
# HydraBot Stack — Full VPS Install Script
# Tested on Ubuntu 22.04 / Debian 12

set -euo pipefail

HYDRABOT_DIR="${HYDRABOT_DIR:-/opt/hydrabot}"
NODE_VERSION="22"
CIRCUS_DIR="${CIRCUS_DIR:-/root/circus}"
CIRCUS_DATA_DIR="${CIRCUS_DATA_DIR:-/root/.circus}"

log() { echo "[hydrabot] $*"; }
err() { echo "[hydrabot] ERROR: $*" >&2; exit 1; }

echo "=== HydraBot Stack Installer ==="
echo "Install dir : $HYDRABOT_DIR"
echo "Circus dir  : $CIRCUS_DIR"
echo "Circus data : $CIRCUS_DATA_DIR"
echo ""

# 1. System dependencies
log "[1/8] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git python3 python3-pip sqlite3 build-essential

# 2. Node.js
log "[2/8] Installing Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
log "Node: $(node --version)"

# 3. PM2
log "[3/8] Installing PM2..."
npm install -g pm2 2>/dev/null || true
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# 4. Claude Code CLI
log "[4/8] Checking Claude Code CLI..."
if ! command -v claude &>/dev/null; then
  log "Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code
  echo ""
  echo "========================================================"
  echo "  Claude Code CLI installed but needs authentication."
  echo "  Run 'claude' interactively to authenticate, then re-run:"
  echo "  HYDRABOT_DIR=$HYDRABOT_DIR $0"
  echo "========================================================"
  exit 0
fi
log "Claude: $(claude --version 2>/dev/null || echo 'installed')"

# 5. Python packages
log "[5/8] Installing Python packages..."
pip3 install ai-iq circus-agent --quiet

# 6. Bootstrap Circus data directory
log "[6/8] Bootstrapping Circus data directory..."
mkdir -p "$CIRCUS_DATA_DIR"

# Generate owner keypair if not present
if [ ! -f "$CIRCUS_DATA_DIR/owner.key" ]; then
  log "Generating Circus owner keypair..."
  python3 - <<'EOF'
import sys, os
data_dir = os.environ.get('CIRCUS_DATA_DIR', '/root/.circus')
try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PrivateFormat, PublicFormat, NoEncryption
    )
    key = Ed25519PrivateKey.generate()
    priv = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    pub = key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    with open(f'{data_dir}/owner.key', 'wb') as f: f.write(priv)
    with open(f'{data_dir}/owner.pub', 'wb') as f: f.write(pub)
    print(f'Keypair generated: {data_dir}/owner.key')
except ImportError:
    print('Warning: cryptography package not found. Install: pip3 install cryptography')
EOF
fi

# Generate Circus secret key if not present
CIRCUS_ENV="$CIRCUS_DIR/.env"
if [ ! -f "$CIRCUS_ENV" ]; then
  SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  cat > "$CIRCUS_ENV" <<EOF
CIRCUS_SECRET_KEY=$SECRET
CIRCUS_OWNER_PRIVATE_KEY_PATH=$CIRCUS_DATA_DIR/owner.key
CIRCUS_OWNER_ID=admin
EOF
  chmod 600 "$CIRCUS_ENV"
  log "Created $CIRCUS_ENV with generated secret key"
fi

# 7. Bot-Circus dependencies + performer workspaces
log "[7/8] Setting up Bot-Circus..."
cd "$HYDRABOT_DIR/bot-circus"
npm install --quiet
node setup-performers.mjs

# 8. Circus API systemd service
log "[8/8] Installing Circus API service..."
sed "s|/root/circus|$CIRCUS_DIR|g" "$HYDRABOT_DIR/deploy/circus-api.service" \
  | tee /etc/systemd/system/circus-api.service > /dev/null
systemctl daemon-reload
systemctl enable circus-api
systemctl start circus-api

# Save PM2 config
pm2 save 2>/dev/null || true

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "  1. cp $HYDRABOT_DIR/bots/template $HYDRABOT_DIR/bots/my-bot"
echo "  2. Edit $HYDRABOT_DIR/bots/my-bot/.env with your TELEGRAM_BOT_TOKEN"
echo "  3. npm install --prefix $HYDRABOT_DIR/bots/my-bot"
echo "  4. pm2 start $HYDRABOT_DIR/bots/my-bot/bot.mjs --name my-bot"
echo "  5. pm2 save"
echo ""
echo "Circus API: http://localhost:6200/health"
