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

# Set PYTHONPATH
export PYTHONPATH=/root/hydrabot:$PYTHONPATH

echo "1. Running import tests..."
python3 agents/test_imports.py

echo ""
echo "2. Available agent packs:"
python3 -c "
import sys
sys.path.insert(0, '/root/hydrabot')
from agents import list_packs
for pack in list_packs():
    print(f\"  - {pack['id']}: {pack['name']}\")
    print(f\"    {pack['description']}\")
"

echo ""
echo "3. Ready to use!"
echo ""
echo "Example usage:"
echo "  export PYTHONPATH=/root/hydrabot:\$PYTHONPATH"
echo "  python3 agents/example.py"
echo ""
echo "Or in Python:"
echo "  import sys"
echo "  sys.path.insert(0, '/root/hydrabot')"
echo "  from agents import run_pack"
echo "  result = await run_pack('redteam', document)"
