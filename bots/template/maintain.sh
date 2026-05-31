#!/usr/bin/env bash
# AI-IQ nightly maintenance — run via cron or PM2
# Consolidates memories, reindexes embeddings for semantic search

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env to get BOT_NAME
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | grep '=' | xargs)
fi

BOT_NAME="${BOT_NAME:-MyBot}"
BOT_NAME_LOWER="$(echo "$BOT_NAME" | tr '[:upper:]' '[:lower:]')"
DB_PATH="${MEMORY_DB:-${AIIQ_DB_PATH:-$SCRIPT_DIR/data/${BOT_NAME_LOWER}-memories.db}}"

# Find memory-tool
MEMORY_TOOL="${MEMORY_TOOL_PATH:-}"
if [ -z "$MEMORY_TOOL" ]; then
  MEMORY_TOOL="$(which memory-tool 2>/dev/null || echo "")"
fi
if [ -z "$MEMORY_TOOL" ]; then
  for candidate in "$HOME/ml-env/bin/memory-tool" "$HOME/.local/bin/memory-tool" "$HOME/venv/bin/memory-tool"; do
    if [ -x "$candidate" ]; then MEMORY_TOOL="$candidate"; break; fi
  done
fi
if [ -z "$MEMORY_TOOL" ]; then
  echo "[maintain] memory-tool not found, skipping"
  exit 0
fi

if [ ! -f "$DB_PATH" ]; then
  echo "[maintain] No memory DB at $DB_PATH, skipping"
  exit 0
fi

export MEMORY_DB="$DB_PATH"

echo "[maintain] $BOT_NAME — dream + reindex ($DB_PATH)"
$MEMORY_TOOL dream 2>/dev/null || echo "[maintain] dream skipped"
$MEMORY_TOOL reindex 2>/dev/null || echo "[maintain] reindex skipped"
echo "[maintain] done"
