// AI-IQ → Circus sync: promotes high-value personal memories to shared knowledge pool.
// Run: node /root/aiiq-circus-sync.mjs
// Cron: every 6 hours

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { circusRegister } from '../circus-bridge.mjs';

const execFileAsync = promisify(execFile);

// Per-agent DB paths — each bot has its own isolated memory DB
const BASE = process.env.BOTS_DIR || '/root';
const AIIQ_DB_MAP = {
  'Claw':     process.env.CLAW_DB     || `${BASE}/claude-telegram-bot/data/claw-memories.db`,
  'Friday':   process.env.FRIDAY_DB   || `${BASE}/claude-telegram-bot-friday/data/friday-memories.db`,
  '007':      process.env.BOT007_DB   || `${BASE}/007-bot/data/007-memories.db`,
  'WA-Drone': process.env.WADRONE_DB  || `${BASE}/wa-drone-bot/data/wa-drone-memories.db`,
  'webbs':    process.env.WEBBS_DB    || `${BASE}/webbs/data/webbs-memories.db`,
  'Octo':     process.env.OCTO_DB     || `${BASE}/octo-bot/data/octo-memories.db`,
};

const CIRCUS_URL = process.env.CIRCUS_URL || 'http://localhost:6200';
const BATCH_SIZE = 20;
const MIN_ACCESS  = 3;

// Agent to sync as — pass as CLI arg: node aiiq-circus-sync.mjs Friday assistant
const AGENT_NAME = process.argv[2] || 'Claw';
const AGENT_ROLE = process.argv[3] || 'builder';
const AIIQ_DB    = AIIQ_DB_MAP[AGENT_NAME];
if (!AIIQ_DB) {
  console.error(`[Sync] Unknown agent: ${AGENT_NAME}. Available: ${Object.keys(AIIQ_DB_MAP).join(', ')}`);
  process.exit(1);
}
const STATE_DIR  = process.env.CIRCUS_STATE_DIR || `${process.env.HOME || '/root'}/.circus`;
const SYNC_STATE = `${STATE_DIR}/aiiq-sync-state-${AGENT_NAME.toLowerCase()}.json`;

// Global shared state — prevents all 3 bots from promoting the same AI-IQ memory IDs.
// All bots read this before querying candidates; the bot that promotes first wins.
const GLOBAL_STATE = `${STATE_DIR}/aiiq-sync-state-global.json`;

const DOMAIN_MAP = {
  architecture: 'knowledge.architecture',
  decision:     'knowledge.decision',
  error:        'knowledge.error',
  workflow:     'knowledge.workflow',
  preference:   'knowledge.preference',
};

function loadState(path) {
  try {
    return existsSync(path)
      ? JSON.parse(readFileSync(path, 'utf8'))
      : { promoted_ids: [], last_run: null };
  } catch (err) {
    console.error('[Sync] State file corrupted or unreadable, resetting:', err.message);
    return { promoted_ids: [], last_run: null };
  }
}

function saveState(path, state) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[Sync] Failed to save state:', err.message);
  }
}

async function queryCandidates(excludeIds) {
  const inClause = excludeIds.length
    ? `AND id NOT IN (${excludeIds.filter(id => /^\d+$/.test(String(id))).map(id => parseInt(id, 10)).join(',')})`
    : '';

  // Each bot has its own DB — no project filtering needed
  const projectClause = '';

  // All bots include 'learning' category — bots primarily store learned facts
  // 007 uses lower access threshold since recon facts are less repeated
  const categories = "('architecture','decision','error','workflow','preference','learning')";
  const minAccess = AGENT_NAME === '007' ? 2 : MIN_ACCESS;

  const sql = `SELECT json_object('id',id,'content',content,'category',category,'access_count',access_count) FROM memories WHERE active=1 AND access_count>=${minAccess} AND category IN ${categories} AND length(content) >= 10 ${inClause} ${projectClause} ORDER BY access_count DESC LIMIT ${BATCH_SIZE};`;

  const { stdout } = await execFileAsync('sqlite3', [AIIQ_DB, sql], { timeout: 10000 });

  return stdout.trim().split('\n').filter(Boolean).map(line => {
    try {
      const obj = JSON.parse(line);
      return {
        id: String(obj.id),
        content: obj.content.trim(),
        category: obj.category.trim(),
        access_count: obj.access_count
      };
    } catch (err) {
      console.warn(`[Sync] Skipping malformed JSON: ${line.slice(0, 50)}...`);
      return null;
    }
  }).filter(Boolean);
}

async function promote(mem, ringToken) {
  const domain     = DOMAIN_MAP[mem.category] || 'knowledge.general';
  const confidence = Math.min(0.92, 0.70 + (mem.access_count * 0.02));
  const content    = mem.content.slice(0, 1000);

  const res = await fetch(`${CIRCUS_URL}/api/v1/memory-commons/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ringToken}` },
    body: JSON.stringify({
      content,
      category: mem.category,
      domain,
      confidence,
      provenance: { reasoning: `Promoted from AI-IQ (accessed ${mem.access_count}×, id: ${mem.id})` },
    }),
    signal: AbortSignal.timeout(15000),
  });

  return res.ok;
}

async function main() {
  console.log(`[Sync] AI-IQ → Circus starting at ${new Date().toISOString()}`);

  console.log(`[Sync] Running as agent: ${AGENT_NAME} (${AGENT_ROLE})`);
  const ringToken = await circusRegister(AGENT_NAME, AGENT_ROLE);
  if (!ringToken) { console.error('[Sync] Failed to auth with Circus'); process.exit(1); }

  // Load both per-agent state AND global state — exclude IDs already promoted by ANY bot
  const state       = loadState(SYNC_STATE);
  const globalState = loadState(GLOBAL_STATE);
  const globalIds   = new Set(globalState.promoted_ids.map(String));
  const alreadyDone = [...new Set([...state.promoted_ids.map(String), ...globalIds])];

  const candidates = await queryCandidates(alreadyDone);
  console.log(`[Sync] Global pool: ${globalIds.size} | This agent: ${state.promoted_ids.length} | Candidates: ${candidates.length}`);

  let promoted = 0, failed = 0;
  for (const mem of candidates) {
    try {
      if (mem.content.trim().length < 10) {
        console.warn(`[Sync] ⚠️  Skipping ${mem.id}: content too short after trim`);
        continue;
      }
      const ok = await promote(mem, ringToken);
      if (ok) {
        state.promoted_ids.push(mem.id);
        globalState.promoted_ids.push(mem.id); // Track globally so other bots skip it
        promoted++;
        console.log(`[Sync] ✅ (${mem.category}, ${mem.access_count}×): ${mem.content.slice(0, 70)}...`);
      } else {
        failed++;
        console.warn(`[Sync] ❌ Failed: ${mem.id}`);
      }
    } catch (err) {
      failed++;
      console.error(`[Sync] Error: ${err.message}`);
    }
  }

  state.last_run      = new Date().toISOString();
  globalState.last_run = new Date().toISOString();
  saveState(SYNC_STATE, state);
  saveState(GLOBAL_STATE, globalState);
  console.log(`[Sync] Done. Promoted: ${promoted}, Failed: ${failed}, Total in global pool: ${globalState.promoted_ids.length}`);

  // Auto-resolve stale belief conflicts — wait 2s for DB writes to settle
  await new Promise(r => setTimeout(r, 2000));
  try {
    const res = await fetch(`${CIRCUS_URL}/api/v1/memory-commons/auto-resolve-conflicts?limit=200`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ringToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log(`[Sync] Conflicts: ${data.resolved} resolved, ${data.skipped} skipped`);
  } catch (e) {
    console.warn('[Sync] Conflict auto-resolve skipped:', e.message);
  }
}

main().catch(err => { console.error('[Sync] Fatal:', err); process.exit(1); });
