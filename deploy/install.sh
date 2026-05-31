#!/usr/bin/env bash
# HydraBot Stack Installer
# Supports: Ubuntu 22.04+, Debian 12+, macOS (Homebrew)
#
# Usage:
#   bash deploy/install.sh                     # install in-place (source = runtime)
#   HYDRABOT_DIR=~/hydrabot bash deploy/install.sh  # install to separate runtime dir

set -euo pipefail

# Source dir is always where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"
HYDRABOT_DIR="${HYDRABOT_DIR:-$SOURCE_DIR}"
NODE_VERSION="22"
CIRCUS_DIR="${CIRCUS_DIR:-$HOME/circus}"
CIRCUS_DATA_DIR="${CIRCUS_DATA_DIR:-$HOME/.circus}"

# --- Helpers ---
log()  { echo "[hydrabot] $*"; }
err()  { echo "[hydrabot] ERROR: $*" >&2; exit 1; }
ok()   { printf "  %-28s %s\n" "$1" "OK ($2)"; }
miss() { printf "  %-28s %s\n" "$1" "MISSING"; }

# --- Detect platform ---
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM="linux" ;;
  Darwin*) PLATFORM="mac" ;;
  *)       err "Unsupported platform: $OS" ;;
esac

# --- Detect privilege escalation ---
USE_SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo &>/dev/null; then
    USE_SUDO="sudo"
  fi
fi

# --- Detect package manager ---
if [ "$PLATFORM" = "mac" ]; then
  command -v brew &>/dev/null || err "Homebrew is required on macOS. Install from https://brew.sh"
  PKG_MGR="brew"
elif command -v apt-get &>/dev/null; then
  PKG_MGR="apt"
else
  err "No supported package manager found (apt-get on Linux, brew on macOS)"
fi

# ============================================================
# Phase 1: Prerequisites check
# ============================================================
echo "=== HydraBot Stack Installer ==="
echo ""
echo "Source dir  : $SOURCE_DIR"
echo "Install dir : $HYDRABOT_DIR"
if [ "$SOURCE_DIR" != "$HYDRABOT_DIR" ]; then
  echo "              (will copy source files to install dir)"
fi
echo "Circus dir  : $CIRCUS_DIR"
echo "Circus data : $CIRCUS_DATA_DIR"
echo "Platform    : $PLATFORM ($PKG_MGR)"
echo ""
echo "--- Prerequisites ---"

MISSING=()

# Node.js
if command -v node &>/dev/null; then
  NODE_VER="$(node --version 2>/dev/null)"
  NODE_MAJOR="${NODE_VER#v}"
  NODE_MAJOR="${NODE_MAJOR%%.*}"
  if [ "$NODE_MAJOR" -ge "$NODE_VERSION" ] 2>/dev/null; then
    ok "Node.js" "$NODE_VER"
  else
    miss "Node.js (have $NODE_VER, need >=$NODE_VERSION)"
    MISSING+=("nodejs")
  fi
else
  miss "Node.js"
  MISSING+=("nodejs")
fi

# npm (comes with Node but check anyway)
if command -v npm &>/dev/null; then
  ok "npm" "$(npm --version 2>/dev/null)"
else
  miss "npm"
  MISSING+=("npm")
fi

# Python 3
if command -v python3 &>/dev/null; then
  ok "Python 3" "$(python3 --version 2>/dev/null | awk '{print $2}')"
else
  miss "Python 3"
  MISSING+=("python3")
fi

# pip3
if command -v pip3 &>/dev/null; then
  ok "pip3" "$(pip3 --version 2>/dev/null | awk '{print $2}')"
else
  miss "pip3"
  MISSING+=("pip3")
fi

# sqlite3
if command -v sqlite3 &>/dev/null; then
  ok "sqlite3" "$(sqlite3 --version 2>/dev/null | awk '{print $1}')"
else
  miss "sqlite3"
  MISSING+=("sqlite3")
fi

# curl
if command -v curl &>/dev/null; then
  ok "curl" "installed"
else
  miss "curl"
  MISSING+=("curl")
fi

# git
if command -v git &>/dev/null; then
  ok "git" "$(git --version 2>/dev/null | awk '{print $3}')"
else
  miss "git"
  MISSING+=("git")
fi

# build tools (gcc/make)
if command -v gcc &>/dev/null || command -v cc &>/dev/null; then
  ok "C compiler" "installed"
else
  miss "C compiler (build-essential)"
  MISSING+=("build-tools")
fi

echo ""
echo "--- Optional (installed during setup if missing) ---"

# PM2
if command -v pm2 &>/dev/null; then
  ok "PM2" "$(pm2 --version 2>/dev/null)"
else
  miss "PM2"
fi

# Claude Code CLI
if command -v claude &>/dev/null; then
  ok "Claude Code CLI" "$(claude --version 2>/dev/null || echo 'installed')"
else
  miss "Claude Code CLI"
fi

# Python packages
if python3 -c "import aiiq" 2>/dev/null; then
  ok "ai-iq (Python)" "installed"
else
  miss "ai-iq (Python)"
fi

if python3 -c "import sqlite_vec; import onnxruntime" 2>/dev/null; then
  ok "AI-IQ embeddings" "installed"
else
  miss "AI-IQ embeddings (semantic search)"
fi

echo ""

# ============================================================
# Phase 2: Prompt user
# ============================================================
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "The following system packages need to be installed:"
  for pkg in "${MISSING[@]}"; do
    echo "  - $pkg"
  done
  echo ""
  if [ "$PLATFORM" = "linux" ] && [ -z "$USE_SUDO" ]; then
    echo "WARNING: Not running as root and sudo is not available."
    echo "You may need to install these packages manually first."
    echo ""
  fi
fi

echo "The installer will also set up: PM2, Claude Code CLI, Python packages,"
echo "Circus data directory, bot-circus workspaces, and the Circus API service."
echo ""
read -rp "Continue with installation? [Y/n] " REPLY
REPLY="${REPLY:-Y}"
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi
echo ""

# ============================================================
# Phase 3: Install
# ============================================================

# 0. Copy source to install dir if they differ
if [ "$SOURCE_DIR" != "$HYDRABOT_DIR" ]; then
  log "Copying source files to $HYDRABOT_DIR..."
  mkdir -p "$HYDRABOT_DIR"
  rsync -a --exclude='.git' --exclude='node_modules' --exclude='.env' \
    "$SOURCE_DIR/" "$HYDRABOT_DIR/"
  log "Source files copied. Your git repo is untouched."
fi

# 1. System dependencies
if [ ${#MISSING[@]} -gt 0 ]; then
  log "[1/8] Installing system dependencies..."
  if [ "$PKG_MGR" = "brew" ]; then
    brew install curl git python3 sqlite3 2>/dev/null || true
  else
    $USE_SUDO apt-get update -qq
    $USE_SUDO apt-get install -y -qq curl git python3 python3-pip sqlite3 build-essential
  fi
else
  log "[1/8] System dependencies already installed, skipping."
fi

# 2. Node.js
if [[ " ${MISSING[*]} " =~ " nodejs " ]]; then
  log "[2/8] Installing Node.js $NODE_VERSION..."
  if [ "$PKG_MGR" = "brew" ]; then
    brew install "node@$NODE_VERSION"
    brew link --overwrite "node@$NODE_VERSION" 2>/dev/null || true
  else
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | $USE_SUDO bash -
    $USE_SUDO apt-get install -y nodejs
  fi
else
  log "[2/8] Node.js already installed, skipping."
fi
log "Node: $(node --version)"

# 3. PM2
if command -v pm2 &>/dev/null; then
  log "[3/8] PM2 already installed, skipping."
else
  log "[3/8] Installing PM2..."
  $USE_SUDO npm install -g pm2 2>/dev/null || npm install -g pm2
fi
if [ "$PLATFORM" = "linux" ]; then
  pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null || true
fi

# 4. Claude Code CLI
if command -v claude &>/dev/null; then
  log "[4/8] Claude Code CLI already installed."
  log "Claude: $(claude --version 2>/dev/null || echo 'installed')"
else
  log "[4/8] Installing Claude Code CLI..."
  $USE_SUDO npm install -g @anthropic-ai/claude-code 2>/dev/null || npm install -g @anthropic-ai/claude-code
  echo ""
  echo "========================================================"
  echo "  Claude Code CLI installed but needs authentication."
  echo "  Run 'claude' interactively to authenticate, then re-run:"
  echo "  bash $HYDRABOT_DIR/deploy/install.sh"
  echo "========================================================"
  exit 0
fi

# 5. Python packages
log "[5/8] Installing Python packages..."
pip3 install ai-iq circus-agent --quiet --user 2>/dev/null \
  || pip3 install ai-iq circus-agent --quiet 2>/dev/null \
  || log "Warning: Could not install ai-iq / circus-agent. Install manually: pip3 install ai-iq circus-agent"

# AI-IQ semantic search dependencies (optional — keyword search works without these)
log "Installing AI-IQ embedding dependencies..."
pip3 install sqlite-vec onnxruntime tokenizers numpy --quiet --user 2>/dev/null \
  || pip3 install sqlite-vec onnxruntime tokenizers numpy --quiet 2>/dev/null \
  || log "Warning: Could not install embedding deps. Semantic search will be unavailable. Install manually: pip3 install sqlite-vec onnxruntime tokenizers numpy"

# 6. Bootstrap Circus data directory
log "[6/8] Bootstrapping Circus data directory..."
mkdir -p "$CIRCUS_DATA_DIR"

if [ ! -f "$CIRCUS_DATA_DIR/owner.key" ]; then
  log "Generating Circus owner keypair..."
  export CIRCUS_DATA_DIR
  python3 - <<'PYEOF'
import sys, os
data_dir = os.environ.get('CIRCUS_DATA_DIR', os.path.join(os.path.expanduser('~'), '.circus'))
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
PYEOF
fi

# Generate Circus secret key if not present
CIRCUS_ENV="$CIRCUS_DIR/.env"
mkdir -p "$CIRCUS_DIR"
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

# 8. Circus API service
log "[8/8] Installing Circus API service..."
if [ "$PLATFORM" = "linux" ] && command -v systemctl &>/dev/null; then
  sed -e "s|/root/circus|$CIRCUS_DIR|g" \
      -e "s|User=root|User=$(whoami)|g" \
      "$HYDRABOT_DIR/deploy/circus-api.service" \
    | $USE_SUDO tee /etc/systemd/system/circus-api.service > /dev/null
  $USE_SUDO systemctl daemon-reload
  $USE_SUDO systemctl enable circus-api
  $USE_SUDO systemctl start circus-api
elif [ "$PLATFORM" = "mac" ]; then
  log "macOS detected — skipping systemd. Start Circus API manually:"
  log "  cd $CIRCUS_DIR && python3 -m uvicorn circus.app:app --host 127.0.0.1 --port 6200"
else
  log "No systemd found — start Circus API manually:"
  log "  cd $CIRCUS_DIR && python3 -m uvicorn circus.app:app --host 127.0.0.1 --port 6200"
fi

# Save PM2 config
pm2 save 2>/dev/null || true

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "  1. cp -r $HYDRABOT_DIR/bots/template $HYDRABOT_DIR/bots/my-bot"
echo "  2. Edit $HYDRABOT_DIR/bots/my-bot/.env with your TELEGRAM_BOT_TOKEN"
echo "  3. Edit $HYDRABOT_DIR/bots/my-bot/SOUL.md to customize your bot's personality"
echo "  4. npm install --prefix $HYDRABOT_DIR/bots/my-bot"
echo "  5. pm2 start $HYDRABOT_DIR/bots/my-bot/bot.mjs --name my-bot --cwd $HYDRABOT_DIR/bots/my-bot"
echo "  6. pm2 save"
echo ""
echo "Set up AI-IQ maintenance (recommended):"
echo "  # Nightly dream + reindex for each bot:"
echo "  crontab -l 2>/dev/null; echo '0 3 * * * bash $HYDRABOT_DIR/bots/my-bot/maintain.sh >> /tmp/hydrabot-maintain.log 2>&1'"
echo "  # Or add to crontab manually: crontab -e"
echo ""
echo "Create a performer (optional):"
echo "  cp -r $HYDRABOT_DIR/performers/template $HYDRABOT_DIR/performers/myworker"
echo "  Edit performers/myworker/SOUL.md and config.json"
echo "  Then use /performers and /ask in Telegram"
echo ""
echo "Circus API: http://localhost:6200/health"
