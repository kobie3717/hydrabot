/**
 * agent-bot — HydraBot Agent Pack Telegram Interface
 *
 * Commands:
 *   /agents        — list all available agent packs
 *   /run <pack>    — start a run (bot asks for document next)
 *   /cancel        — cancel current run
 *   /help          — usage guide
 *
 * Flow:
 *   1. /run redteam
 *   2. Bot: "Send your document"
 *   3. User sends text
 *   4. Bot runs: python3 agents/cli.py run redteam -
 *   5. Bot formats + returns result
 */

import 'dotenv/config';
import { Bot } from 'grammy';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execFileAsync = promisify(execFile);

const BOT_NAME     = process.env.BOT_NAME || 'AgentBot';
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER = parseInt(process.env.ALLOWED_USER_ID || '0', 10);
const PYTHON       = process.env.PYTHON_PATH || 'python3';
const HYDRABOT_DIR = process.env.HYDRABOT_DIR || '/opt/hydrabot';
const TIMEOUT      = parseInt(process.env.AGENT_TIMEOUT || '120000', 10);
const CLI_PATH     = join(HYDRABOT_DIR, 'agents', 'cli.py');

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');

const bot = new Bot(BOT_TOKEN);

// Session: track which pack each chat is waiting to run
const pendingSessions = new Map(); // chatId → packId

// ── Auth ──────────────────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  if (ALLOWED_USER && ctx.from?.id !== ALLOWED_USER) return;
  await next();
});

// ── /start ────────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  await ctx.reply(
    `🤖 *${BOT_NAME} — Agent Pack Runner*\n\n` +
    `Run multi-agent AI analysis on any document.\n\n` +
    `*Commands:*\n` +
    `/agents — list available packs\n` +
    `/run <pack> — run a pack on your document\n` +
    `/help — detailed usage\n\n` +
    `Start with: /agents`,
    { parse_mode: 'Markdown' }
  );
});

// ── /help ─────────────────────────────────────────────────────────────────────

bot.command('help', async (ctx) => {
  await ctx.reply(
    `*How to use ${BOT_NAME}:*\n\n` +
    `1. /agents — see what packs are available\n` +
    `2. /run redteam — start a run (replace \`redteam\` with any pack ID)\n` +
    `3. Paste your document — business plan, strategy doc, contract, etc.\n` +
    `4. Wait ~30s — agents run in parallel\n` +
    `5. Get structured analysis back\n\n` +
    `*Adding new packs:*\n` +
    `See \`agents/IMPLEMENTATION.md\` in the hydrabot repo.\n` +
    `New packs appear here automatically once registered.`,
    { parse_mode: 'Markdown' }
  );
});

// ── /agents ───────────────────────────────────────────────────────────────────

bot.command('agents', async (ctx) => {
  const msg = await ctx.reply('⏳ Loading agent packs...');
  try {
    const { stdout } = await execFileAsync(
      PYTHON,
      [CLI_PATH, 'list', '--verbose'],
      { cwd: HYDRABOT_DIR, timeout: 10000 }
    );

    // Parse CLI output into structured message
    const lines = stdout.trim().split('\n');
    const packs = [];
    let current = {};

    for (const line of lines) {
      if (line.startsWith('ID:')) {
        if (current.id) packs.push(current);
        current = { id: line.replace('ID:', '').trim() };
      } else if (line.startsWith('Name:')) {
        current.name = line.replace('Name:', '').trim();
      } else if (line.startsWith('Description:')) {
        current.description = line.replace('Description:', '').trim();
      } else if (line.startsWith('Input:')) {
        current.input = line.replace('Input:', '').trim();
      } else if (line.startsWith('Output:')) {
        current.output = line.replace('Output:', '').trim();
      }
    }
    if (current.id) packs.push(current);

    if (!packs.length) {
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, '❌ No agent packs found.');
      return;
    }

    const text = packs.map(p =>
      `*${p.name}* (\`${p.id}\`)\n` +
      `${p.description}\n` +
      `📥 Input: ${p.input}\n` +
      `📤 Output: ${p.output}\n` +
      `➡️ Use: /run ${p.id}`
    ).join('\n\n─────────────────────\n\n');

    await ctx.api.editMessageText(
      ctx.chat.id, msg.message_id,
      `🤖 *Available Agent Packs (${packs.length}):*\n\n${text}`,
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    console.error('[agent-bot] list error:', err.message);
    await ctx.api.editMessageText(
      ctx.chat.id, msg.message_id,
      `❌ Failed to load packs. Check HYDRABOT_DIR and ANTHROPIC_API_KEY.`
    );
  }
});

// ── /run <pack> ───────────────────────────────────────────────────────────────

bot.command('run', async (ctx) => {
  const packId = ctx.match?.trim();
  if (!packId) {
    await ctx.reply('Usage: /run <pack_id>\nSee /agents for available packs.');
    return;
  }

  pendingSessions.set(ctx.chat.id, packId);
  await ctx.reply(
    `📋 *Ready to run: \`${packId}\`*\n\n` +
    `Send your document now — paste the full text.\n` +
    `(/cancel to abort)`,
    { parse_mode: 'Markdown' }
  );
});

// ── /cancel ───────────────────────────────────────────────────────────────────

bot.command('cancel', async (ctx) => {
  if (pendingSessions.has(ctx.chat.id)) {
    const pack = pendingSessions.get(ctx.chat.id);
    pendingSessions.delete(ctx.chat.id);
    await ctx.reply(`❌ Cancelled \`${pack}\` run.`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('No active run to cancel.');
  }
});

// ── Document handler ──────────────────────────────────────────────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return; // ignore unknown commands

  const packId = pendingSessions.get(ctx.chat.id);
  if (!packId) {
    await ctx.reply('Use /run <pack> to start an analysis, or /agents to see what\'s available.');
    return;
  }

  if (text.length < 50) {
    await ctx.reply('⚠️ Document looks too short. Paste the full text (50+ characters).');
    return;
  }

  pendingSessions.delete(ctx.chat.id);

  const status = await ctx.reply(
    `⚡ Running *${packId}* — agents working in parallel...\n_This takes ~30 seconds._`,
    { parse_mode: 'Markdown' }
  );

  try {
    const { stdout } = await execFileAsync(
      PYTHON,
      [CLI_PATH, 'run', packId, '--pretty', '-'],
      {
        input: text,
        cwd: HYDRABOT_DIR,
        timeout: TIMEOUT,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env },
      }
    );

    const result = JSON.parse(stdout.trim());
    const formatted = formatResult(packId, result);

    // Send in chunks if too long
    const chunks = splitMessage(formatted, 4000);
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        await ctx.api.editMessageText(ctx.chat.id, status.message_id, chunks[i], {
          parse_mode: 'Markdown'
        }).catch(() => ctx.reply(chunks[i]));
      } else {
        await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunks[i]));
      }
    }

  } catch (err) {
    console.error('[agent-bot] run error:', err.message);
    const errMsg = err.killed ? '⏱️ Timed out — document may be too large.' : `❌ Error: ${err.message.slice(0, 200)}`;
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, errMsg).catch(() => {});
  }
});

// ── Formatters ────────────────────────────────────────────────────────────────

function formatResult(packId, result) {
  // Generic formatter — works for any pack
  // Redteam-specific formatting
  if (result.risk_score !== undefined) {
    return formatRedteam(result);
  }
  // Fallback: pretty JSON summary
  return `*${packId.toUpperCase()} RESULT*\n\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 3500)}\n\`\`\``;
}

function formatRedteam(r) {
  const scoreBar = '█'.repeat(Math.floor(r.risk_score / 10)) + '░'.repeat(10 - Math.floor(r.risk_score / 10));
  const verdictEmoji = { PROCEED: '✅', PROCEED_WITH_CAUTION: '⚠️', DO_NOT_PROCEED: '🚫' }[r.verdict] || '❓';

  const vulns = (r.vulnerabilities || [])
    .map(v => `${v.severity === 'CRITICAL' ? '🔴' : v.severity === 'HIGH' ? '🟠' : '🟡'} *[${v.agent?.toUpperCase()}]* ${v.title}\n_${v.attack?.slice(0, 120)}_`)
    .join('\n\n');

  const questions = (r.top_3_questions || []).map((q, i) => `${i + 1}. ${q}`).join('\n');

  return [
    `🎯 *RED TEAM ANALYSIS*`,
    ``,
    `Risk Score: *${r.risk_score}/100* ${scoreBar}`,
    `Verdict: ${verdictEmoji} *${r.verdict?.replace(/_/g, ' ')}*`,
    ``,
    `*Executive Summary*`,
    r.executive_summary,
    ``,
    `*Vulnerabilities (${(r.vulnerabilities || []).length})*`,
    vulns || '_None identified_',
    ``,
    `*Top Questions*`,
    questions || '_None_',
  ].join('\n');
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    let chunk = remaining.slice(0, maxLen);
    const lastNewline = chunk.lastIndexOf('\n');
    if (lastNewline > maxLen * 0.7) chunk = chunk.slice(0, lastNewline);
    chunks.push(chunk);
    remaining = remaining.slice(chunk.length);
  }
  return chunks;
}

// ── Start ─────────────────────────────────────────────────────────────────────

console.log(`${BOT_NAME} starting...`);
bot.start({ onStart: () => console.log(`${BOT_NAME} online — Telegram agent pack runner`) });
