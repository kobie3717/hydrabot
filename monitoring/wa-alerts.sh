#!/bin/bash
# ══════════════════════════════════════════════════════════════
# WhatsAuction Alert System v2.0
# Runs every 5 min via cron — zero AI, zero cost
# Sends to @Whatsauctionbot on Telegram
# ══════════════════════════════════════════════════════════════

BOT_TOKEN="REDACTED_BOT_TOKEN"
CHAT_IDS="6531675960 5253614714"  # Kobus. Add De Clercq when he /starts
STATE_DIR="/tmp/wa-alerts"
DB_PASS="vpn_secure_password_2025"
DB_USER="vpn_user"
DB_NAME="whatsauction"
ALERT_LOG="/var/log/wa-alerts.log"

mkdir -p "$STATE_DIR"

# ── Helpers ──
send() {
  local msg="$1"
  local silent="${2:-false}"
  for cid in $CHAT_IDS; do
    if [ "$silent" = "true" ]; then
      curl -sf -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d chat_id="$cid" -d text="$msg" -d parse_mode="Markdown" -d disable_notification=true > /dev/null 2>&1
    else
      curl -sf -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d chat_id="$cid" -d text="$msg" -d parse_mode="Markdown" > /dev/null 2>&1
    fi
  done
}

db_query() {
  PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d "$DB_NAME" -h localhost -t -A "$@" 2>/dev/null
}

ts() { date '+%Y-%m-%d %H:%M:%S'; }

state_alert() {
  # $1=key $2=condition(true=problem) $3=down_msg $4=recover_msg $5=silent
  local key="$1" problem="$2" down_msg="$3" recover_msg="$4" silent="${5:-false}"
  if [ "$problem" = "true" ]; then
    if [ ! -f "$STATE_DIR/$key" ]; then
      send "$down_msg" "$silent"
      echo "$(ts)" > "$STATE_DIR/$key"
    fi
  else
    if [ -f "$STATE_DIR/$key" ]; then
      local down_since=$(cat "$STATE_DIR/$key")
      send "$recover_msg
_Down since: ${down_since}_" "$silent"
      rm "$STATE_DIR/$key"
    fi
  fi
}

# ══════════════════════════════════════════════════════════════
# CRITICAL — These wake you up
# ══════════════════════════════════════════════════════════════

# ── 1. API Health ──
API_HEALTH=$(curl -sf --max-time 10 http://localhost:4000/health 2>/dev/null)
API_STATUS=$(echo "$API_HEALTH" | jq -r '.status' 2>/dev/null)
DB_STATUS=$(echo "$API_HEALTH" | jq -r '.checks.database.status' 2>/dev/null)
DB_LATENCY=$(echo "$API_HEALTH" | jq -r '.checks.database.latencyMs' 2>/dev/null)
REDIS_STATUS=$(echo "$API_HEALTH" | jq -r '.checks.redis.status' 2>/dev/null)
REDIS_LATENCY=$(echo "$API_HEALTH" | jq -r '.checks.redis.latencyMs' 2>/dev/null)
WA_STATUS=$(echo "$API_HEALTH" | jq -r '.checks.whatsapp.status' 2>/dev/null)

state_alert "api_down" \
  "$([ "$API_STATUS" != "ok" ] && echo true || echo false)" \
  "🔴 *CRITICAL: API DOWN*
Status: ${API_STATUS:-unreachable}
Time: $(ts)" \
  "✅ *API recovered*
Time: $(ts)"

# ── 2. Database ──
state_alert "db_down" \
  "$([ "$DB_STATUS" != "ok" ] && echo true || echo false)" \
  "🔴 *CRITICAL: Database DOWN*
Status: ${DB_STATUS:-unreachable}
Time: $(ts)" \
  "✅ *Database recovered*
Time: $(ts)"

# DB slow (>100ms)
if [ -n "$DB_LATENCY" ] && [ "$DB_LATENCY" != "null" ] && [ "$DB_LATENCY" -gt 500 ] 2>/dev/null; then
  state_alert "db_slow" "true" \
    "⚠️ *Database slow: ${DB_LATENCY}ms*
Normal: <10ms | Alert threshold: 500ms
Time: $(ts)" \
    "✅ *Database latency normal*"
else
  state_alert "db_slow" "false" "" "✅ *Database latency normal*"
fi

# ── 3. Redis ──
state_alert "redis_down" \
  "$([ "$REDIS_STATUS" != "ok" ] && echo true || echo false)" \
  "🔴 *CRITICAL: Redis DOWN*
Queues, caching, sessions all affected
Time: $(ts)" \
  "✅ *Redis recovered*
Time: $(ts)"

# ── 4. WhatsApp Connection ──
state_alert "wa_down" \
  "$([ "$WA_STATUS" != "connected" ] && echo true || echo false)" \
  "🔴 *WhatsApp DISCONNECTED*
Bids will NOT be processed!
Time: $(ts)" \
  "✅ *WhatsApp reconnected*
Time: $(ts)"

# ── 5. WhatsApp Worker Container ──
WORKER_RUNNING=$(docker ps --filter "name=whatsapp-worker" --filter "status=running" -q 2>/dev/null)
state_alert "worker_down" \
  "$([ -z "$WORKER_RUNNING" ] && echo true || echo false)" \
  "🔴 *CRITICAL: WhatsApp Worker container DOWN*
No bids, no notifications, no bot
Time: $(ts)" \
  "✅ *WhatsApp Worker recovered*
Time: $(ts)"

# ── 6. API Container ──
API_RUNNING=$(docker ps --filter "name=whatsauction-api" --filter "status=running" -q 2>/dev/null)
state_alert "api_container_down" \
  "$([ -z "$API_RUNNING" ] && echo true || echo false)" \
  "🔴 *CRITICAL: API container DOWN*
Website and app completely offline
Time: $(ts)" \
  "✅ *API container recovered*
Time: $(ts)"

# ── 6b. WhatsHub Container ──
WHATSHUB_RUNNING=$(docker ps --filter "name=whatshub-api" --filter "status=running" -q 2>/dev/null)
state_alert "whatshub_down" \
  "$([ -z "$WHATSHUB_RUNNING" ] && echo true || echo false)" \
  "🔴 *WhatsHub container DOWN*
whatshubb.co.za + Memzy offline
Time: $(ts)" \
  "✅ *WhatsHub recovered*
Time: $(ts)"

# ── 6c. WhatsBookings Container ──
BOOKINGS_RUNNING=$(docker ps --filter "name=whatsbookings" --filter "status=running" -q 2>/dev/null)
state_alert "whatsbookings_down" \
  "$([ -z "$BOOKINGS_RUNNING" ] && echo true || echo false)" \
  "🔴 *WhatsBookings container DOWN*
whatsbookings.co.za offline
Time: $(ts)" \
  "✅ *WhatsBookings recovered*
Time: $(ts)"

# ── 6d. WhatsBookings WhatsApp Container ──
BOOKINGS_WA_RUNNING=$(docker ps --filter "name=whatsbookings-whatsapp" --filter "status=running" -q 2>/dev/null)
state_alert "whatsbookings_wa_down" \
  "$([ -z "$BOOKINGS_WA_RUNNING" ] && echo true || echo false)" \
  "⚠️ *WhatsBookings WA service DOWN*
Booking notifications not sending
Time: $(ts)" \
  "✅ *WhatsBookings WA recovered*
Time: $(ts)"

# ── 6e. WhatsMap Container ──
WHATSMAP_RUNNING=$(docker ps --filter "name=whatsmap-api" --filter "status=running" -q 2>/dev/null)
state_alert "whatsmap_down" \
  "$([ -z "$WHATSMAP_RUNNING" ] && echo true || echo false)" \
  "⚠️ *WhatsMap container DOWN*
Time: $(ts)" \
  "✅ *WhatsMap recovered*
Time: $(ts)"

# ── 6f. WhatsStatus Container ──
WHATSSTATUS_RUNNING=$(docker ps --filter "name=whatsstatus-app" --filter "status=running" -q 2>/dev/null)
state_alert "whatsstatus_down" \
  "$([ -z "$WHATSSTATUS_RUNNING" ] && echo true || echo false)" \
  "⚠️ *WhatsStatus container DOWN*
Time: $(ts)" \
  "✅ *WhatsStatus recovered*
Time: $(ts)"

# ══════════════════════════════════════════════════════════════
# HIGH — Important but not 3AM worthy
# ══════════════════════════════════════════════════════════════

# ── 7. Worker Health Details ──
WORKER_HEALTH=$(curl -sf --max-time 5 http://localhost:4002/health 2>/dev/null)
IS_LEADER=$(echo "$WORKER_HEALTH" | jq -r '.isLeader' 2>/dev/null)
CONNECTED_ORGS=$(echo "$WORKER_HEALTH" | jq -r '.whatsapp.connectedOrgs' 2>/dev/null)
TOTAL_ORGS=$(echo "$WORKER_HEALTH" | jq -r '.whatsapp.totalOrgs' 2>/dev/null)
WORKER_HEAP=$(echo "$WORKER_HEALTH" | jq -r '.memory.heapUsed' 2>/dev/null)

# Worker not leader
state_alert "no_leader" \
  "$([ "$IS_LEADER" = "false" ] && echo true || echo false)" \
  "⚠️ *Worker lost leadership*
WhatsApp bot may not be processing messages
Time: $(ts)" \
  "✅ *Worker regained leadership*"

# Worker memory >500MB
if [ -n "$WORKER_HEAP" ] && [ "$WORKER_HEAP" != "null" ]; then
  HEAP_MB=$((WORKER_HEAP / 1048576))
  state_alert "worker_memory" \
    "$([ "$HEAP_MB" -gt 500 ] && echo true || echo false)" \
    "⚠️ *Worker memory high: ${HEAP_MB}MB*
Possible memory leak — may need restart
Time: $(ts)" \
    "✅ *Worker memory normal: ${HEAP_MB}MB*"
fi

# ── 8. SSL Certificate Expiry ──
SSL_EXPIRY=$(echo | openssl s_client -connect app.whatsauction.co.za:443 -servername app.whatsauction.co.za 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$SSL_EXPIRY" ]; then
  EXPIRY_EPOCH=$(date -d "$SSL_EXPIRY" +%s 2>/dev/null)
  NOW_EPOCH=$(date +%s)
  DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
  state_alert "ssl_expiry" \
    "$([ "$DAYS_LEFT" -lt 14 ] && echo true || echo false)" \
    "⚠️ *SSL certificate expiring in ${DAYS_LEFT} days!*
Domain: app.whatsauction.co.za
Expires: ${SSL_EXPIRY}
Action: certbot renew" \
    "✅ *SSL renewed — ${DAYS_LEFT} days remaining*"
fi

# ── 9. Disk Usage ──
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
state_alert "disk_85" \
  "$([ "$DISK_PCT" -gt 85 ] && echo true || echo false)" \
  "💾 *Disk usage: ${DISK_PCT}%*
Action needed — clean up logs/backups
Time: $(ts)" \
  "✅ *Disk usage back to ${DISK_PCT}%*"

# Disk critical >95%
state_alert "disk_95" \
  "$([ "$DISK_PCT" -gt 95 ] && echo true || echo false)" \
  "🔴 *CRITICAL: Disk ${DISK_PCT}% — server may stop!*
IMMEDIATE action required
Time: $(ts)" \
  "✅ *Disk critical resolved: ${DISK_PCT}%*"

# ── 10. PM2 Services (exclude intentionally stopped claw-* services) ──
PM2_DOWN=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.pm2_env.status != "online") | select((.pm2_env.status == "waiting restart" and (.pm2_env.cron_restart // "" | length) > 0) | not) | select(.name | startswith("claw-") | not) | .name' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
state_alert "pm2_down" \
  "$([ -n "$PM2_DOWN" ] && echo true || echo false)" \
  "🔴 *PM2 services down: ${PM2_DOWN}*
Time: $(ts)" \
  "✅ *All PM2 services recovered*
Time: $(ts)"

# ── 11. Error Spikes ──
ERROR_COUNT=$(docker logs whatsauction-api --since 5m 2>&1 | grep -ic "error" || true)
ERROR_COUNT=$((ERROR_COUNT + 0))
state_alert "error_spike" \
  "$([ "$ERROR_COUNT" -gt 20 ] && echo true || echo false)" \
  "⚠️ *Error spike: ${ERROR_COUNT} errors in 5 min*
Check: docker logs whatsauction-api --tail 50
Time: $(ts)" \
  "✅ *Error rate normalized*"

# ── 12. Backup Check (daily at 4AM check) ──
HOUR=$(date +%H)
if [ "$HOUR" = "04" ]; then
  LATEST_BACKUP=$(ls -t /root/whatsauction/backups/whatsauction_*.sql.gz 2>/dev/null | head -1)
  if [ -n "$LATEST_BACKUP" ]; then
    BACKUP_AGE=$(( ($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")) / 3600 ))
    if [ "$BACKUP_AGE" -gt 48 ]; then
      state_alert "backup_stale" "true" \
        "⚠️ *Last backup is ${BACKUP_AGE}h old*
Expected: fresh backup every deploy
File: $(basename $LATEST_BACKUP)
Time: $(ts)" \
        "✅ *Backups fresh*"
    else
      state_alert "backup_stale" "false" "" "✅ *Backups fresh*"
    fi
  else
    send "⚠️ *No backups found!*
Directory: /root/backups/pre-deploy/
Time: $(ts)"
  fi
fi

# ══════════════════════════════════════════════════════════════
# BUSINESS — Celebrate the wins
# ══════════════════════════════════════════════════════════════

# ── 13. New Signups ──
LAST_CHECK_FILE="$STATE_DIR/last_signup_check"
NOW_UTC=$(date -u '+%Y-%m-%d %H:%M:%S')
LAST_CHECK=$(cat "$LAST_CHECK_FILE" 2>/dev/null || echo "1970-01-01 00:00:00")

NEW_USERS=$(db_query -F'|' -c "
SELECT u.name, u.email, u.phone, o.name as org_name
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
WHERE u.created_at > '$LAST_CHECK'::timestamp
AND u.email NOT LIKE '%@test.whatsauction%'
AND u.email NOT IN ('kobie@pop.co.za','jiwentzel@icloud.com')
ORDER BY u.created_at DESC;")

if [ -n "$NEW_USERS" ]; then
  while IFS='|' read -r name email phone org; do
    [ -z "$name" ] && continue
    send "🎉 *New signup!*
👤 ${name}
📧 ${email}
📱 ${phone:-no phone}
🏢 ${org:-no org yet}
Time: $(ts)" "true"
  done <<< "$NEW_USERS"
fi
echo "$NOW_UTC" > "$LAST_CHECK_FILE"

# ── 13b. WhatsHub New Signups ──
LAST_HUB_FILE="$STATE_DIR/last_whatshub_signup"
LAST_HUB=$(cat "$LAST_HUB_FILE" 2>/dev/null || echo "1970-01-01 00:00:00")

NEW_HUB_USERS=$(db_query -F'|' -c "
SELECT name, email, created_at
FROM whatshub_users
WHERE created_at > '$LAST_HUB'::timestamp
AND email NOT IN ('kobie@pop.co.za','jiwentzel@icloud.com')
ORDER BY created_at DESC;")

if [ -n "$NEW_HUB_USERS" ]; then
  while IFS='|' read -r name email created; do
    [ -z "$name" ] && continue
    send "🛠️ *WhatsHub signup!*
👤 ${name}
📧 ${email}
🕐 ${created}
Platform: whatshubb.co.za" "true"
  done <<< "$NEW_HUB_USERS"
fi
echo "$NOW_UTC" > "$LAST_HUB_FILE"

# ── 13c. Memzy New Signups ──
LAST_MEMZY_FILE="$STATE_DIR/last_memzy_signup"
LAST_MEMZY=$(cat "$LAST_MEMZY_FILE" 2>/dev/null || echo "1970-01-01 00:00:00")

NEW_MEMZY_ORGS=$(db_query -F'|' -c "
SELECT name, owner_email, owner_phone, plan, created_at
FROM memzy_orgs
WHERE created_at > '$LAST_MEMZY'::timestamp
AND owner_email NOT IN ('kobie@pop.co.za','jiwentzel@icloud.com')
ORDER BY created_at DESC;")

if [ -n "$NEW_MEMZY_ORGS" ]; then
  while IFS='|' read -r name email phone plan created; do
    [ -z "$name" ] && continue
    send "📸 *Memzy signup!*
👤 ${name}
📧 ${email}
📱 ${phone:-no phone}
📋 Plan: ${plan:-Free}
🕐 ${created}
Platform: memzy.co.za" "true"
  done <<< "$NEW_MEMZY_ORGS"
fi
echo "$NOW_UTC" > "$LAST_MEMZY_FILE"

# ── 13d. WhatsBookings New Signups ──
LAST_BOOKINGS_FILE="$STATE_DIR/last_bookings_signup"
LAST_BOOKINGS=$(cat "$LAST_BOOKINGS_FILE" 2>/dev/null || echo "1970-01-01 00:00:00")

NEW_BOOKING_USERS=$(PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d bodyfit -h localhost -t -A -F'|' -c "
SELECT u.name, u.email, u.role, o.name as org_name, u.\"createdAt\"
FROM \"User\" u
LEFT JOIN \"Organization\" o ON u.\"organizationId\" = o.id
WHERE u.\"createdAt\" > '$LAST_BOOKINGS'::timestamp
AND u.email NOT IN ('kobie@pop.co.za','jiwentzel@icloud.com')
ORDER BY u.\"createdAt\" DESC;" 2>/dev/null)

if [ -n "$NEW_BOOKING_USERS" ]; then
  while IFS='|' read -r name email role org created; do
    [ -z "$name" ] && continue
    send "📅 *WhatsBookings signup!*
👤 ${name}
📧 ${email}
👔 Role: ${role:-user}
🏢 ${org:-no org}
🕐 ${created}
Platform: whatsbookings.co.za" "true"
  done <<< "$NEW_BOOKING_USERS"
fi
echo "$NOW_UTC" > "$LAST_BOOKINGS_FILE"

# ── 14. New Auction Created ──
LAST_AUCTION_FILE="$STATE_DIR/last_auction_check"
LAST_AUCTION=$(cat "$LAST_AUCTION_FILE" 2>/dev/null || echo "1970-01-01 00:00:00")

NEW_AUCTIONS=$(db_query -F'|' -c "
SELECT a.name, o.name as org_name, a.auction_type, a.created_at
FROM auctions a
JOIN organizations o ON a.organization_id = o.id
WHERE a.created_at > '$LAST_AUCTION'::timestamp
AND o.name NOT LIKE '%Stress%' AND o.name NOT LIKE '%Test%' AND o.name NOT LIKE '%E2E%'
ORDER BY a.created_at DESC;")

if [ -n "$NEW_AUCTIONS" ]; then
  while IFS='|' read -r aname org atype created; do
    [ -z "$aname" ] && continue
    send "🔨 *New auction created!*
📋 ${aname}
🏢 ${org}
Type: ${atype}
Time: ${created}" "true"
  done <<< "$NEW_AUCTIONS"
fi
echo "$NOW_UTC" > "$LAST_AUCTION_FILE"

# ── 15. Subscription Changes ──
LAST_SUB_FILE="$STATE_DIR/last_sub_check"
LAST_SUB=$(cat "$LAST_SUB_FILE" 2>/dev/null || echo "1970-01-01 00:00:00")

NEW_SUBS=$(db_query -F'|' -c "
SELECT s.status, s.plan_id, o.name as org_name, s.updated_at
FROM subscriptions s
JOIN organizations o ON s.organization_id = o.id
WHERE s.updated_at > '$LAST_SUB'::timestamp
AND s.status IN ('ACTIVE','CANCELLED','PAST_DUE')
ORDER BY s.updated_at DESC;" 2>/dev/null)

if [ -n "$NEW_SUBS" ]; then
  while IFS='|' read -r status plan org updated; do
    [ -z "$org" ] && continue
    case "$status" in
      ACTIVE)    emoji="💰"; label="Subscription activated" ;;
      CANCELLED) emoji="❌"; label="Subscription cancelled" ;;
      PAST_DUE)  emoji="⚠️"; label="Payment failed" ;;
      *)         emoji="📋"; label="Subscription: $status" ;;
    esac
    send "${emoji} *${label}*
🏢 ${org}
Plan: ${plan:-unknown}
Time: ${updated}"
  done <<< "$NEW_SUBS"
fi
echo "$NOW_UTC" > "$LAST_SUB_FILE"

# ══════════════════════════════════════════════════════════════
# DAILY SUMMARY (8AM SAST = 7AM CET)
# ══════════════════════════════════════════════════════════════

if [ "$HOUR" = "07" ] && [ ! -f "$STATE_DIR/daily_sent_$(date +%Y%m%d)" ]; then
  USER_COUNT=$(db_query -c "SELECT count(*) FROM users WHERE email NOT LIKE '%@test.whatsauction%' AND email NOT IN ('kobie@pop.co.za','jiwentzel@icloud.com');")
  AUCTION_COUNT=$(db_query -c "SELECT count(*) FROM auctions;")
  BID_COUNT=$(db_query -c "SELECT count(*) FROM bids;")
  ACTIVE_SUBS=$(db_query -c "SELECT count(*) FROM subscriptions WHERE status = 'ACTIVE';")
  SIGNUPS_24H=$(db_query -c "SELECT count(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours' AND email NOT LIKE '%@test.whatsauction%' AND email NOT IN ('kobie@pop.co.za','jiwentzel@icloud.com');")
  BIDS_24H=$(db_query -c "SELECT count(*) FROM bids WHERE created_at > NOW() - INTERVAL '24 hours';")
  VERSION=$(docker inspect whatsauction-api --format '{{.Config.Image}}' 2>/dev/null | cut -d: -f2)
  UPTIME_API=$(docker ps --filter "name=whatsauction-api" --format "{{.Status}}" 2>/dev/null)

  send "📊 *WhatsAuction Daily Report*
_$(date '+%A, %d %B %Y')_

*Last 24h:*
• New signups: ${SIGNUPS_24H:-0}
• Bids placed: ${BIDS_24H:-0}

*Totals:*
• Users: ${USER_COUNT:-0}
• Auctions: ${AUCTION_COUNT:-0}
• Total bids: ${BID_COUNT:-0}
• Active subs: ${ACTIVE_SUBS:-0}

*System:*
• Version: ${VERSION:-unknown}
• API: ${UPTIME_API:-unknown}
• Disk: ${DISK_PCT}%
• WhatsApp: ${WA_STATUS:-unknown}
• DB: ${DB_LATENCY:-?}ms | Redis: ${REDIS_LATENCY:-?}ms" "true"

  touch "$STATE_DIR/daily_sent_$(date +%Y%m%d)"
  # Clean old daily markers
  find "$STATE_DIR" -name "daily_sent_*" -mtime +3 -delete 2>/dev/null
fi

# ══════════════════════════════════════════════════════════════
# 16. VERSION CHANGE / DEPLOY DETECTION
# ══════════════════════════════════════════════════════════════
CURRENT_VERSION=$(docker inspect whatsauction-api --format '{{.Config.Image}}' 2>/dev/null | cut -d: -f2)
if [ -n "$CURRENT_VERSION" ]; then
  state_alert "version_${CURRENT_VERSION}" "true" \
    "🚀 *New Deploy Detected!*

Version: \`${CURRENT_VERSION}\`
API: $(docker ps --filter 'name=whatsauction-api' --format '{{.Status}}')
Worker: $(docker ps --filter 'name=whatsapp-worker' --format '{{.Status}}')
Time: $(ts)" \
    ""
fi
