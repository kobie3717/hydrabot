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
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getOrCreateSession, clearSession, getSessionInfo, cleanExpiredSessions } from './sessions.mjs';
import { buildMemoryContext, autoStoreConversation } from './memory-bridge.mjs';

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

// Performer dispatch — spawn ephemeral workers from performers/
const DISPATCH_PATH = process.env.DISPATCH_PATH ||
  new URL('../../bot-circus/dispatch.mjs', import.meta.url).pathname;
const { dispatch } = await import(DISPATCH_PATH);

const PERFORMERS_DIR = process.env.PERFORMERS_DIR ||
  new URL('../../performers', import.meta.url).pathname;

const execFileAsync = promisify(execFile);

const BOT_NAME      = process.env.BOT_NAME || 'MyBot';
const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER  = parseInt(process.env.ALLOWED_USER_ID || '0', 10);
const CLAUDE_PATH   = process.env.CLAUDE_CLI_PATH || 'claude';
const CLAUDE_CWD    = process.env.CLAUDE_WORKING_DIR || process.cwd();
const CLAUDE_TIMEOUT = parseInt(process.env.CLAUDE_TIMEOUT || '120000', 10);

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');

// ── Workspace Files ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadWorkspaceFile(filename, maxLen = 4000) {
  try {
    const filePath = join(__dirname, filename);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8')
        .replaceAll('{{BOT_NAME}}', BOT_NAME)
        .slice(0, maxLen);
      // Skip files that are all comments/placeholders
      const stripped = content.replace(/<!--[\s\S]*?-->/g, '').replace(/^#.*$/gm, '').trim();
      if (stripped.length < 20) return '';
      console.log(`[Workspace] Loaded ${filename}`);
      return content;
    }
  } catch { /* non-fatal */ }
  return '';
}

function loadSoul() {
  const soul = loadWorkspaceFile('SOUL.md');
  return soul || `You are ${BOT_NAME}, a helpful AI assistant.`;
}

const userContext = loadWorkspaceFile('USER.md', 2000);
const agentsRules = loadWorkspaceFile('AGENTS.md', 2000);
const toolsRef = loadWorkspaceFile('TOOLS.md', 1500);

const SOUL = loadSoul();

// ── Performer Discovery ─────────────────────────────────────────────────────

function listPerformers() {
  try {
    return readdirSync(PERFORMERS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'template')
      .filter(d => existsSync(join(PERFORMERS_DIR, d.name, 'config.json')))
      .map(d => {
        const dir = join(PERFORMERS_DIR, d.name);
        const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
        let role = '';
        try {
          const soul = readFileSync(join(dir, 'SOUL.md'), 'utf8');
          const roleMatch = soul.match(/## (?:Role|Expertise)\n([^\n#]+)/);
          if (roleMatch) role = roleMatch[1].trim();
        } catch { /* no SOUL.md */ }
        return { id: d.name, name: config.name || d.name, role };
      });
  } catch { return []; }
}

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

bot.command('clear', async (ctx) => {
  const cleared = clearSession(ctx.from.id);
  await ctx.reply(cleared
    ? 'Conversation cleared. Next message starts a fresh session.'
    : 'No active session to clear.');
});

bot.command('session', async (ctx) => {
  const info = getSessionInfo(ctx.from.id);
  if (!info) {
    await ctx.reply('No active session. Send a message to start one.');
    return;
  }
  await ctx.reply(
    `Session: ${info.sessionId.slice(0, 8)}...\n` +
    `Messages: ${info.messageCount}\n` +
    `Age: ${info.age} min\n` +
    `Last used: ${info.lastUsed} min ago`
  );
});

bot.command('performers', async (ctx) => {
  const performers = listPerformers();
  if (performers.length === 0) {
    await ctx.reply(
      'No performers installed.\n\n' +
      'Create one:\n' +
      '  cp -r performers/template performers/myworker\n' +
      '  Edit performers/myworker/SOUL.md'
    );
    return;
  }
  const lines = performers.map(p =>
    `- *${p.id}*: ${p.name}${p.role ? ` — ${p.role}` : ''}`
  );
  await ctx.reply(
    `Available performers:\n${lines.join('\n')}\n\nUse: /ask <performer> <message>`,
    { parse_mode: 'Markdown' }
  ).catch(() => ctx.reply(`Available performers:\n${lines.join('\n')}\n\nUse: /ask <performer> <message>`));
});

bot.command('ask', async (ctx) => {
  const text = ctx.message.text;
  const parts = text.replace(/^\/ask\s+/, '').split(/\s+/);
  const performerId = parts[0];
  const message = parts.slice(1).join(' ');

  if (!performerId || !message) {
    await ctx.reply('Usage: /ask <performer> <message>\n\nSee /performers for available performers.');
    return;
  }

  // Validate performer exists
  const performerDir = join(PERFORMERS_DIR, performerId);
  if (!existsSync(join(performerDir, 'config.json'))) {
    const available = listPerformers().map(p => p.id).join(', ') || 'none';
    await ctx.reply(`Unknown performer: ${performerId}\nAvailable: ${available}`);
    return;
  }

  await ctx.reply(`Dispatching to *${performerId}*...`, { parse_mode: 'Markdown' }).catch(() => {});

  try {
    const result = await dispatch(performerId, message);
    await ctx.reply(result, { parse_mode: 'Markdown' }).catch(() =>
      ctx.reply(result)
    );
  } catch (err) {
    console.error(`[Dispatch] ${performerId} error:`, err.message);
    await ctx.reply(`Performer error: ${err.message}`);
  }
});

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
    // Fetch context in parallel (all non-fatal)
    const [sharedContext, memoryContext] = await Promise.all([
      getRelevantSharedKnowledge(userMessage).catch(() => ''),
      buildMemoryContext(userMessage).catch(() => ''),
    ]);

    // Build system prompt with performer awareness
    const performers = listPerformers();
    const performerContext = performers.length > 0
      ? `\n## Available Performers\nYou can suggest the user dispatch specialized tasks to these performers via /ask <id> <message>:\n${performers.map(p => `- ${p.id}: ${p.name}${p.role ? ` — ${p.role}` : ''}`).join('\n')}`
      : '';

    const systemPrompt = [
      SOUL,
      userContext,
      agentsRules,
      toolsRef,
      memoryContext,
      performerContext,
      sharedContext ? `\n## Shared Knowledge\n${sharedContext}` : '',
    ].filter(Boolean).join('\n');

    // Session management — resume conversations across messages
    const { sessionId, isNew } = getOrCreateSession(ctx.from.id);
    const sessionArgs = isNew
      ? ['--session-id', sessionId]
      : ['--resume', sessionId];

    // Run Claude Code CLI — pass message as arg (stdin doesn't work with --resume)
    const { stdout } = await execFileAsync(
      CLAUDE_PATH,
      ['--print', ...sessionArgs, '--output-format', 'text', '--model', 'claude-sonnet-4-6',
       '--system-prompt', systemPrompt, '--', userMessage],
      {
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

    // Store notable facts in AI-IQ long-term memory (non-fatal)
    autoStoreConversation(userMessage, response).catch(err => console.error('[Memory] Auto-store error:', err.message));

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

// ── Session Cleanup ─────────────────────────────────────────────────────────

// Purge sessions idle >24h every 6 hours
setInterval(() => cleanExpiredSessions(24), 6 * 60 * 60 * 1000);

// ── Start ────────────────────────────────────────────────────────────────────

console.log(`${BOT_NAME} starting...`);
bot.start({ onStart: () => console.log(`${BOT_NAME} is online`) });
