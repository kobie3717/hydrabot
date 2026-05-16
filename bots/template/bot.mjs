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

const bot = new Bot(BOT_TOKEN);

// ── Authorization ────────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  if (ALLOWED_USER && ctx.from?.id !== ALLOWED_USER) return;
  await next();
});

// ── Message Handler ──────────────────────────────────────────────────────────

bot.on('message:text', async (ctx) => {
  const userMessage = ctx.message.text;

  try {
    // Fetch shared knowledge from Circus mesh (non-fatal)
    const sharedContext = await getRelevantSharedKnowledge(userMessage).catch(() => '');

    // Build system prompt
    const systemPrompt = [
      `You are ${BOT_NAME}, a helpful AI assistant.`,
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
