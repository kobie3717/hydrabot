/**
 * bot.mjs — HydraBot Template
 *
 * A Claude-powered Telegram bot with:
 * - AI-IQ long-term memory
 * - Circus multi-agent mesh integration
 * - Ephemeral sub-worker dispatch
 * - Non-fatal graceful degradation
 */

import 'dotenv/config';
import { Bot } from 'grammy';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Support both in-repo and standalone deployment
const BRIDGE_PATH = process.env.CIRCUS_BRIDGE_PATH ||
  new URL('../../circus-bridge.mjs', import.meta.url).pathname;
const {
  circusRegister,
  circusJoinRooms,
  startHeartbeat,
  registerTaskHandler,
  startTaskInboxPoller,
  enableAutoReconnect,
  writeSharedKnowledge,
  getRelevantSharedKnowledge,
} = await import(BRIDGE_PATH);

const execFileAsync = promisify(execFile);

const BOT_NAME      = process.env.BOT_NAME || 'MyBot';
const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER  = parseInt(process.env.ALLOWED_USER_ID || '0', 10);
const CLAUDE_PATH   = process.env.CLAUDE_CLI_PATH || 'claude';
const CLAUDE_CWD    = process.env.CLAUDE_WORKING_DIR || process.cwd();
const CLAUDE_TIMEOUT = parseInt(process.env.CLAUDE_TIMEOUT || '120000', 10);

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');

// ── Personality ─────────────────────────────────────────────────────────────

function loadSoul() {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const soulPath = process.env.SOUL_FILE || join(__dirname, 'SOUL.md');
    if (existsSync(soulPath)) {
      const soul = readFileSync(soulPath, 'utf8')
        .replaceAll('{{BOT_NAME}}', BOT_NAME)
        .slice(0, 4000);
      console.log(`[Soul] Loaded personality from ${soulPath}`);
      return soul;
    }
  } catch { /* non-fatal */ }
  return `You are ${BOT_NAME}, a helpful AI assistant.`;
}

const SOUL = loadSoul();

const bot = new Bot(BOT_TOKEN);

// ── Authorization ────────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  if (ALLOWED_USER && ctx.from?.id !== ALLOWED_USER) return;
  await next();
});

// ── Graph Orchestration Example ─────────────────────────────────────────────
// Uncomment to define and run a graph:
//
// const { defineGraph, runGraph } = await import(BRIDGE_PATH);
//
// const graphId = await defineGraph(
//   [
//     { id: 'research', type: 'worker', config: { botId: 'octo', messageBuilder: (s) => `Research: ${s.query}` } },
//     { id: 'approve',  type: 'human',  config: { prompt: 'Approve research?', timeout: 3600000 } },
//     { id: 'publish',  type: 'task',   config: { toAgentId: 'target-agent-id', taskType: 'publish' } },
//   ],
//   [
//     { from: 'research', to: 'approve' },
//     { from: 'approve',  to: 'publish', condition: (o) => o.approve_response === 'yes' },
//   ],
//   { name: 'research-workflow', entryNode: 'research' }
// );
// const execId = await runGraph(graphId, { query: 'AI trends 2026' });
// console.log('Graph started:', execId);

// ── Commands ─────────────────────────────────────────────────────────────────

bot.command('approve', async (ctx) => {
  const text = ctx.message.text;
  const parts = text.split(' ');
  const [, executionId, approvalId, ...responseParts] = parts;
  const response = responseParts.join(' ');

  if (!executionId || !approvalId || !response) {
    await ctx.reply('Usage: /approve <executionId> <approvalId> <response>');
    return;
  }

  try {
    const { resumeGraph } = await import(BRIDGE_PATH);
    await resumeGraph(executionId, approvalId, response);
    await ctx.reply(`✅ Graph resumed with: "${response}"`);
  } catch (err) {
    await ctx.reply(`❌ Failed to resume graph: ${err.message}`);
  }
});

// ── Message Handler ──────────────────────────────────────────────────────────

bot.on('message:text', async (ctx) => {
  const userMessage = ctx.message.text;

  try {
    // Fetch shared knowledge from Circus mesh (non-fatal)
    const sharedContext = await getRelevantSharedKnowledge(userMessage).catch(() => '');

    // Build system prompt
    const systemPrompt = [
      SOUL,
      sharedContext ? `\n## Shared Knowledge\n${sharedContext}` : '',
    ].filter(Boolean).join('\n');

    // Run Claude Code CLI
    const { stdout } = await execFileAsync(
      CLAUDE_PATH,
      ['--print', '--output-format', 'text', '--model', 'claude-sonnet-4-6',
       '--system-prompt', systemPrompt],
      {
        input: userMessage,
        timeout: CLAUDE_TIMEOUT,
        cwd: CLAUDE_CWD,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      }
    );

    const response = stdout.trim();
    await ctx.reply(response, { parse_mode: 'Markdown' }).catch(() =>
      ctx.reply(response) // fallback: no markdown
    );

    // Share interesting responses with the mesh
    if (response.length > 100) {
      writeSharedKnowledge(response, 'learning', 0.6, 'conversation').catch(() => {});
    }

  } catch (err) {
    console.error('[Bot] Claude error:', err.message);
    await ctx.reply('Something went wrong. Try again.').catch(() => {});
  }
});

// ── Circus Integration ───────────────────────────────────────────────────────

// Register task handlers (before circusRegister — survive Circus downtime)
registerTaskHandler('notify', async (payload) => {
  const msg = payload.message || payload.text || JSON.stringify(payload);
  await bot.api.sendMessage(ALLOWED_USER, `📩 Task notification:\n${msg}`).catch(() => {});
  return { delivered: true };
});

// Connect to Circus mesh
circusRegister(BOT_NAME, 'assistant')
  .then(token => {
    if (token) {
      circusJoinRooms(['memory-commons']);
      startHeartbeat();
      startTaskInboxPoller(60_000);
      console.log(`[Circus] ${BOT_NAME} connected to mesh ✓`);
    }
  })
  .catch(err => console.error('[Circus] Registration failed:', err.message));

// Auto-reconnect every 5 min if Circus was unavailable at startup
enableAutoReconnect(BOT_NAME, 'assistant');

// ── Start ────────────────────────────────────────────────────────────────────

console.log(`${BOT_NAME} starting...`);
bot.start({ onStart: () => console.log(`${BOT_NAME} is online`) });
