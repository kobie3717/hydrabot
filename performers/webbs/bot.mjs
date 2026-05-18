#!/usr/bin/env node
import { Bot, InputFile } from 'grammy';
import { config } from 'dotenv';
import { writeFile, unlink, readFile } from 'fs/promises';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
import { circusRegister, circusJoinRooms, startHeartbeat, buildPreferenceContext, getRelevantSharedKnowledge, writeSharedKnowledge, shouldShareKnowledge, registerTaskHandler, startTaskInboxPoller, enableAutoReconnect } from './circus-bridge.mjs';
import { buildMemoryContext, autoStoreConversation } from './memory-bridge.mjs';
const DISPATCH_PATH = process.env.DISPATCH_PATH ||
  new URL('../../bot-circus/dispatch.mjs', import.meta.url).pathname;
const { dispatch: spawnWorker, poolStats: workerPoolStats } = await import(DISPATCH_PATH);
import { getOrCreateSession, clearSession, getSessionInfo, cleanExpiredSessions, getStats } from './sessions.mjs';

config();

const BOT_TOKEN = process.env.WEBBS_BOT_TOKEN;
const ALLOWED_USER_ID = parseInt(process.env.ALLOWED_USER_ID || '0', 10);
const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || 'claude';
const WORKING_DIR = process.env.CLAUDE_WORKING_DIR || process.cwd();

if (!BOT_TOKEN) {
  console.error('WEBBS_BOT_TOKEN missing in .env');
  process.exit(1);
}

process.on('uncaughtException', err => console.error('[crash guard]', err.message));
process.on('unhandledRejection', r => console.error('[crash guard]', r?.message || r));

const bot = new Bot(BOT_TOKEN);
const BOT_START = Date.now();

// Message queue state
const busyUsers = new Set();
const userQueues = new Map(); // userId -> [{msg, ctx}]

async function processNext(userId) {
  const queue = userQueues.get(userId) || [];
  if (queue.length === 0) {
    busyUsers.delete(userId);
    return;
  }
  const next = queue.shift();
  userQueues.set(userId, queue);
  await handleDesignRequest(next.ctx, next.msg, next.imagePath || null);
}

const SYSTEM_PROMPT = `You are webbs 🕸️ — a frontend web designer specialist. Philosophy: "Every pixel is a thread. Make the web beautiful."

You create COMPLETE, PRODUCTION-READY HTML/CSS/JS. Core rules:
- Zero placeholders. Zero TODOs. Zero lorem ipsum.
- Mobile-first responsive (min-width breakpoints)
- Hover/focus states on all interactive elements
- Semantic HTML, CSS custom properties for theming

Default aesthetic: dark backgrounds, glassmorphism, orange accent #FF6B35, micro-animations.

WhatsAuction brand: primary #FF6B35, dark bg #0F0F0F, surface #1A1A2E, text #F9FAFB.

Default CSS tokens:
:root {
  --bg: #0F0F0F; --surface: #1A1A2E;
  --accent: #FF6B35; --glow: rgba(255,107,53,0.3);
  --text: #F9FAFB; --muted: #9CA3AF; --border: rgba(255,255,255,0.08);
  --r: 12px; --t: 200ms cubic-bezier(0.4,0,0.2,1);
}

## GSAP Animations (use for any scroll/text/SVG animation request)

Always load via CDN:
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>

gsap.registerPlugin(ScrollTrigger);

Core patterns:
- Fade+slide in on scroll: gsap.from(el, { opacity:0, y:40, duration:0.8, scrollTrigger:{trigger:el,start:"top 85%"} })
- Stagger children: gsap.from(".card", { opacity:0, y:30, stagger:0.1, duration:0.6, scrollTrigger:{trigger:".cards",start:"top 80%"} })
- Text reveal (SplitText): gsap.from(chars, { opacity:0, y:20, stagger:0.03, ease:"back.out(1.7)" })
- Timeline: const tl = gsap.timeline(); tl.from(h1, {...}).from(p, {...}, "-=0.3")
- Magnetic button: mousemove → gsap.to(btn, { x: (e.clientX-rect.left-w/2)*0.3, y: (e.clientY-rect.top-h/2)*0.3, duration:0.3 })
- SVG draw: gsap.from(path, { drawSVG:"0%", duration:2, ease:"power2.inOut" }) (needs DrawSVG plugin)
- Parallax: ScrollTrigger scrub:true, y: "30%"
- Pinned section: ScrollTrigger { pin:true, scrub:1, end:"+=500" }

Performance: always use will-change:transform on animated els. Batch DOM reads before writes.

## UI Reverse Engineering (when user gives a URL or says "clone")

When asked to clone/copy a URL:
1. Fetch the URL source (curl or fetch)
2. Extract real values: getComputedStyle colors, font stacks, spacing, border-radius
3. Grep JS bundle for GSAP/Motion/Lenis params (duration, ease, stagger values)
4. Reproduce in React + Tailwind with real extracted values — never approximate
5. Note any animations found (GSAP ScrollTrigger, CSS @keyframes, Motion)

## Anti-Slop Rules (MANDATORY — check before every output)

**BANNED fonts** (instant AI-slop signal — never use):
Inter, Roboto, Arial, Helvetica Neue, system-ui, Open Sans, Lato, Montserrat, Poppins, Nunito.
→ Use instead: Sora, Cabinet Grotesk, Clash Display, Satoshi, DM Sans, Space Grotesk, Bricolage Grotesque, Fraunces, Instrument Serif

**BANNED color patterns:**
- Generic blue SaaS (#3B82F6 hero), purple gradients (#7C3AED→#2563EB), teal+coral "startup", default Tailwind blue anywhere prominent

**BANNED layout patterns:**
- 3-column icon+title+text grid (THE most overused pattern)
- Centered hero with floating background particles
- Generic stats row (users/reviews/uptime)
- Identical cards in a uniform grid

**BANNED animations:**
- Floating/pulsing decorative particles with no meaning
- Generic fade-in-up on every single element

**Before writing code — commit to ONE bold direction:**
Editorial / Brutalist / Organic / Luxury / Retro-futuristic / Maximalist
→ NOT "clean and modern" (that's slop)

## Component Libraries Available
- **Tailwind v4 + shadcn** — component system
- **Motion (Framer Motion)** — React spring physics, layout animations: \`import { motion } from "motion/react"\`
- **Aceternity UI** — premium animated components (cards, beams, grids)
- **Inspira UI** — motion-forward components
- **auto-animate** — drop-in list animations: \`autoAnimate(el)\`
- **Mobile-first** — SA = mobile-heavy, always start 375px
- **PWA** — when asked for installable/offline: manifest + service worker

## Payment Integration (WA auctions)
PayFast (SA): ZAR, instant EFT, card. Merchant ID + key in env. POST to https://www.payfast.co.za/eng/process.

## Response format
1. One sentence: aesthetic direction + font choice + animation approach
2. Complete code in a single \`\`\`html block (or React if requested)
3. Self-check: confirm no banned fonts/colors/layouts used
4. Optional: 1 customization hint`;

function isAuthorized(ctx) {
  if (!ALLOWED_USER_ID) return true;
  return ctx.from?.id === ALLOWED_USER_ID;
}

async function downloadTelegramFile(fileId) {
  const fileInfo = await bot.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
  const resp = await fetch(url);
  const ext = (fileInfo.file_path.split('.').pop() || 'bin').toLowerCase();
  const tmp = `/tmp/webbs-upload-${Date.now()}.${ext}`;
  await writeFile(tmp, Buffer.from(await resp.arrayBuffer()));
  return { path: tmp, ext, filePath: fileInfo.file_path };
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'm4v', 'wmv']);
const PDF_EXTS   = new Set(['pdf']);
const TEXT_EXTS  = new Set(['html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx', 'txt', 'md', 'json', 'xml', 'yaml', 'yml', 'toml', 'vue', 'svelte']);

async function extractVideoFrame(videoPath) {
  const framePath = videoPath + '-frame.jpg';
  await execFileAsync('ffmpeg', [
    '-i', videoPath, '-ss', '00:00:01', '-frames:v', '1',
    '-q:v', '2', framePath, '-y'
  ]);
  return framePath;
}

async function extractPdfText(pdfPath) {
  const { stdout } = await execFileAsync('pdftotext', ['-l', '5', pdfPath, '-']);
  return stdout.slice(0, 8000);
}

async function askClaude(prompt, imagePath = null, sessionId = null, isNew = false) {
  return new Promise((resolve, reject) => {
    const args = [
      '--print', '--output-format', 'stream-json', '--verbose',
      '--model', 'sonnet',
    ];

    // Add session arguments if provided
    if (sessionId) {
      if (isNew) {
        args.push('--session-id', sessionId);
      } else {
        args.push('--resume', sessionId);
      }
    }

    args.push('--system-prompt', SYSTEM_PROMPT);

    // Prepend image path — Claude Code's Read tool handles images natively
    const fullPrompt = imagePath
      ? `Image file to analyze: ${imagePath}\n\n${prompt}`
      : prompt;
    const proc = spawn(CLAUDE_CLI, args, { cwd: WORKING_DIR, stdio: ['pipe', 'pipe', 'pipe'] });

    let output = '';
    let stderr = '';
    let buffer = '';

    proc.stdout.on('data', d => {
      buffer += d.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === 'assistant' && evt.message?.content) {
            for (const block of evt.message.content) {
              if (block.type === 'text') {
                output += block.text;
              }
            }
          }
        } catch {}
      }
    });

    proc.stderr.on('data', d => stderr += d.toString());
    proc.stdin.write(fullPrompt + '\n');
    proc.stdin.end();

    // 5 min timeout — GSAP pages take time
    const timeout = setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('Timeout after 5min')); }, 300000);

    proc.on('close', code => {
      clearTimeout(timeout);
      if (output.trim()) resolve(output.trim());
      else reject(new Error(`Claude exited ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

// Session state now managed by sessions.mjs (sqlite-backed)

bot.command('start', ctx => ctx.reply(
  '🕸️ *webbs* — web designer bot\n\nTell me what to build.\n\nExamples:\n• Dark landing page for auction app\n• Pricing section with 3 tiers\n• Bid button with pulse animation\n• Glassmorphism login form\n\n/clear — reset',
  { parse_mode: 'Markdown' }
));

bot.command('clear', ctx => {
  const cleared = clearSession(ctx.from?.id);
  ctx.reply(cleared ? '🕸️ Session cleared.' : '🕸️ No session to clear.');
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
    const CIRCUS_BRIDGE_PATH = process.env.CIRCUS_BRIDGE_PATH ||
      new URL('../../circus-bridge.mjs', import.meta.url).pathname;
    const { resumeGraph } = await import(CIRCUS_BRIDGE_PATH);
    await resumeGraph(executionId, approvalId, response);
    await ctx.reply(`✅ Graph resumed with: "${response}"`);
  } catch (err) {
    await ctx.reply(`❌ Failed to resume graph: ${err.message}`);
  }
});

async function handleDesignRequest(ctx, msg, imagePath = null) {
  const userId = ctx.from.id;
  const cleanupFiles = imagePath ? [imagePath] : [];

  try {
    // Get or create persistent session
    const { sessionId, isNew } = getOrCreateSession(userId);

    let fullPrompt = msg;

    // Get Kobus preferences + shared knowledge from Circus (non-blocking, non-fatal)
    let circusContext = '';
    try {
      const prefs = await buildPreferenceContext();
      if (prefs) circusContext = `\nUser preferences:\n${prefs}\n`;
    } catch {}
    try {
      const shared = await getRelevantSharedKnowledge(msg.slice(0, 500));
      if (shared) circusContext += `\n## Shared Knowledge from Fleet\n${shared}\n`;
    } catch {}

    // Add memory context from AI-IQ (non-blocking, non-fatal)
    try {
      const memCtx = await buildMemoryContext(msg);
      if (memCtx) circusContext += memCtx;
    } catch {}

    // Add Circus context if available
    if (circusContext) fullPrompt = circusContext + '\n' + fullPrompt;

    const thinking = await ctx.reply(imagePath ? '🕸️ reading image...' : '🕸️ spinning...');
    let dots = 0;
    // Keep typing indicator alive (Telegram clears it after 5s)
    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
    }, 4000);
    const heartbeat = setInterval(() => {
      dots = (dots + 1) % 4;
      ctx.api.editMessageText(ctx.chat.id, thinking.message_id, `🕸️ spinning${'.'.repeat(dots + 1)}`).catch(() => {});
    }, 15000);

    try {
      const reply = await askClaude(fullPrompt, imagePath, sessionId, isNew);
      clearInterval(typingInterval);
      clearInterval(heartbeat);

      // Auto-store conversation in AI-IQ (non-blocking)
      autoStoreConversation(msg, reply).catch(() => {});

      // Share significant design learnings to Circus fleet (non-blocking)
      try {
        const { shouldShare, category, domain, confidence, content } = shouldShareKnowledge(msg, reply);
        if (shouldShare) {
          writeSharedKnowledge(content, category, confidence, domain, 'webbs').catch(() => {});
        }
      } catch {}

      const htmlMatch = reply.match(/```(?:html|HTML)?\n([\s\S]+?)```/);
      const short = reply.length > 4000
        ? reply.replace(/```[\s\S]*?```/g, '[see attached file]').slice(0, 4000)
        : reply;

      await ctx.api.editMessageText(ctx.chat.id, thinking.message_id, short, { parse_mode: 'Markdown' })
        .catch(() => ctx.api.editMessageText(ctx.chat.id, thinking.message_id, short.replace(/[*_`[\]]/g, '')));

      if (htmlMatch) {
        const tmp = `/tmp/webbs-${Date.now()}.html`;
        await writeFile(tmp, htmlMatch[1]);
        await ctx.replyWithDocument(new InputFile(tmp, 'webbs.html'));
        unlink(tmp).catch(() => {});
      }

    } catch (err) {
      clearInterval(typingInterval);
      clearInterval(heartbeat);
      console.error(err);
      await ctx.api.editMessageText(ctx.chat.id, thinking.message_id, `❌ ${err.message}`).catch(() => {});
    }
  } finally {
    // Cleanup uploaded files
    for (const f of cleanupFiles) unlink(f).catch(() => {});
    // Always process next queued message for this user
    await processNext(userId);
  }
}

// Helper: queue or dispatch
function dispatch(ctx, msg, imagePath = null) {
  if (!isAuthorized(ctx)) return;
  if (ctx.message.date * 1000 < BOT_START - 30000) return;
  const userId = ctx.from.id;
  if (busyUsers.has(userId)) {
    const queue = userQueues.get(userId) || [];
    if (queue.length >= 3) return ctx.reply('🕸️ Queue full (3 pending). Wait for current job.');
    queue.push({ ctx, msg, imagePath });
    userQueues.set(userId, queue);
    return ctx.reply(`🕸️ Queued (#${queue.length}). Will process after current job.`);
  }
  busyUsers.add(userId);
  return handleDesignRequest(ctx, msg, imagePath);
}

bot.on('message:text', async ctx => {
  if (!isAuthorized(ctx)) return;
  const msg = ctx.message.text;
  if (msg.startsWith('/')) return;
  dispatch(ctx, msg);
});

// Photos: download + pass as image to Claude
bot.on('message:photo', async ctx => {
  if (!isAuthorized(ctx)) return;
  if (ctx.message.date * 1000 < BOT_START - 30000) return;
  try {
    const photo = ctx.message.photo.at(-1); // largest size
    const { path: imgPath } = await downloadTelegramFile(photo.file_id);
    const caption = ctx.message.caption || 'Analyze this design/screenshot. What would you build or improve?';
    dispatch(ctx, caption, imgPath);
  } catch (e) {
    ctx.reply(`❌ Failed to download image: ${e.message}`);
  }
});

// Documents: route by type — image, video, PDF, text, or reject
bot.on('message:document', async ctx => {
  if (!isAuthorized(ctx)) return;
  if (ctx.message.date * 1000 < BOT_START - 30000) return;
  const doc = ctx.message.document;
  const caption = ctx.message.caption || '';
  let filePath = null;
  let extraCleanup = null;
  try {
    const dl = await downloadTelegramFile(doc.file_id);
    filePath = dl.path;
    const ext = dl.ext;

    if (IMAGE_EXTS.has(ext)) {
      const msg = caption || 'Analyze this design/screenshot. What would you build or improve?';
      dispatch(ctx, msg, filePath);
      filePath = null; // dispatch owns cleanup

    } else if (VIDEO_EXTS.has(ext)) {
      await ctx.reply('🕸️ Extracting frame...');
      const framePath = await extractVideoFrame(filePath);
      extraCleanup = framePath;
      const msg = caption || 'Analyze this UI/design from the video frame. What would you build?';
      dispatch(ctx, msg, framePath);
      framePath = null; // dispatch owns cleanup

    } else if (PDF_EXTS.has(ext)) {
      const text = await extractPdfText(filePath);
      if (!text.trim()) return ctx.reply('🕸️ PDF has no extractable text (scanned image?).');
      const msg = caption
        ? `${caption}\n\nPDF contents (${doc.file_name}):\n${text}`
        : `Design a web page or component based on this PDF content (${doc.file_name}):\n${text}`;
      dispatch(ctx, msg);

    } else if (TEXT_EXTS.has(ext)) {
      const contents = await readFile(filePath, 'utf8');
      const msg = caption
        ? `${caption}\n\nFile contents (${doc.file_name}):\n\`\`\`\n${contents.slice(0, 8000)}\n\`\`\``
        : `Review and improve this code (${doc.file_name}):\n\`\`\`\n${contents.slice(0, 8000)}\n\`\`\``;
      dispatch(ctx, msg);

    } else {
      ctx.reply(`🕸️ Unsupported: .${ext}\nSupported: images, video, PDF, HTML/CSS/JS/TS/JSON`);
    }
  } catch (e) {
    ctx.reply(`❌ Failed to process file: ${e.message}`);
  } finally {
    if (filePath) unlink(filePath).catch(() => {});
    if (extraCleanup) unlink(extraCleanup).catch(() => {});
  }
});

bot.start();
console.log('🕸️ webbs bot started');

// Register task handlers unconditionally — no token needed
registerTaskHandler('design', async (payload) => {
  console.log('[Task] design task received:', payload.description?.slice(0, 100));
  return { status: 'acknowledged' };
}, { useWorker: true });
registerTaskHandler('notify', async (payload) => {
  console.log('[Task] notify task received:', payload.message?.slice(0, 100));
  return { status: 'ok' };
});
console.log('[Circus] Task handlers registered');

// Register with Circus (non-fatal)
circusRegister('webbs', 'builder')
  .then(token => {
    if (token) {
      circusJoinRooms(['memory-commons', 'engineering']);
      startHeartbeat();
      startTaskInboxPoller(60_000);
    }
  })
  .catch(e => console.log('[circus] registration skipped:', e.message));
enableAutoReconnect('webbs', 'builder');
