#!/bin/bash
set -e

# Auto-detect directory from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBBS_DIR="${WEBBS_DIR:-$SCRIPT_DIR}"
CLAUDE_SKILLS_DIR="${HOME}/.claude/skills"

echo "🕸️ webbs setup"
echo ""

# Check if skill directory needs to be created
if [ ! -d "$CLAUDE_SKILLS_DIR/webbs" ]; then
  echo "Creating skill directory..."
  mkdir -p "$CLAUDE_SKILLS_DIR/webbs"
  cp "$WEBBS_DIR/SKILL.md" "$CLAUDE_SKILLS_DIR/webbs/SKILL.md"
  echo "✓ Skill installed at $CLAUDE_SKILLS_DIR/webbs/SKILL.md"
else
  echo "✓ Skill directory exists"
fi

# Check .env configuration
if grep -q "PASTE_NEW_TOKEN_HERE" "$WEBBS_DIR/.env" 2>/dev/null; then
  echo ""
  echo "⚠️  SETUP REQUIRED:"
  echo ""
  echo "1. Create new Telegram bot:"
  echo "   - Open https://t.me/BotFather"
  echo "   - Send: /newbot"
  echo "   - Name: webbs"
  echo "   - Username: webbs_designer_bot (or similar)"
  echo "   - Copy the token"
  echo ""
  echo "2. Edit $WEBBS_DIR/.env and set:"
  echo "   WEBBS_BOT_TOKEN=<your_token_from_botfather>"
  echo "   ANTHROPIC_API_KEY=<your_anthropic_api_key>"
  echo ""
  echo "3. Run: npm start"
  exit 1
fi

echo ""
echo "✓ Configuration complete"
echo ""
echo "To start the bot:"
echo "  cd $WEBBS_DIR && npm start"
echo ""
echo "To run as service:"
echo "  See README.md for systemd setup"
