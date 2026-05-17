#!/bin/bash
set -e

echo "🕸️ webbs setup"
echo ""

# Check if skill directory needs to be created
if [ ! -d "/root/.claude/skills/webbs" ]; then
  echo "Creating skill directory..."
  mkdir -p /root/.claude/skills/webbs
  cp /root/webbs/SKILL.md /root/.claude/skills/webbs/SKILL.md
  echo "✓ Skill installed at /root/.claude/skills/webbs/SKILL.md"
else
  echo "✓ Skill directory exists"
fi

# Check .env configuration
if grep -q "PASTE_NEW_TOKEN_HERE" /root/webbs/.env 2>/dev/null; then
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
  echo "2. Edit /root/webbs/.env and set:"
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
echo "  cd /root/webbs && npm start"
echo ""
echo "To run as service:"
echo "  See README.md for systemd setup"
