#!/bin/bash
# Quick start script for HydraBot agents library

set -e

echo "HydraBot Agents Library - Quick Start"
echo "======================================"
echo ""

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  Warning: ANTHROPIC_API_KEY not set"
    echo "   Set it with: export ANTHROPIC_API_KEY='sk-ant-...'"
    echo ""
fi

# Auto-detect hydrabot root from this script's location (agents/ is one level down)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HYDRABOT_DIR="${HYDRABOT_DIR:-$(dirname "$SCRIPT_DIR")}"

# Set PYTHONPATH
export PYTHONPATH="$HYDRABOT_DIR:$PYTHONPATH"

echo "1. Running import tests..."
python3 "$HYDRABOT_DIR/agents/test_imports.py"

echo ""
echo "2. Available agent packs:"
python3 -c "
import sys
sys.path.insert(0, '$HYDRABOT_DIR')
from agents import list_packs
for pack in list_packs():
    print(f\"  - {pack['id']}: {pack['name']}\")
    print(f\"    {pack['description']}\")
"

echo ""
echo "3. Ready to use!"
echo ""
echo "Example usage:"
echo "  export PYTHONPATH=$HYDRABOT_DIR:\$PYTHONPATH"
echo "  python3 $HYDRABOT_DIR/agents/example.py"
echo ""
echo "Or in Python:"
echo "  import sys"
echo "  sys.path.insert(0, '$HYDRABOT_DIR')"
echo "  from agents import run_pack"
echo "  result = await run_pack('redteam', document)"
