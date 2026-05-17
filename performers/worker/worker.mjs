#!/usr/bin/env node
/**
 * Autonomous Worker — polls job queue and runs Claude CLI tasks
 * PM2: worker-bot
 */

import { spawn } from 'child_process';
import { getNextJob, getRunningJob, markRunning, markDone, markFailed, listJobs } from './queue.mjs';

const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || 'claude';
const CLAUDE_WORKING_DIR = process.env.CLAUDE_WORKING_DIR || process.env.HOME || '/root';
const POLL_INTERVAL = 10000; // 10 seconds
const JOB_TIMEOUT = 30 * 60 * 1000; // 30 minutes max per job

const WORKER_SYSTEM_PROMPT = `You are an autonomous worker agent. You complete coding, research, and operations tasks on a Linux VPS.

Working directory: ${CLAUDE_WORKING_DIR}
Available tools: All Claude Code tools (Read, Write, Edit, Bash, Glob, Grep, Agent)

Rules:
- Complete the task fully before reporting done
- Be precise — test your work
- Report what you did, what changed, and any issues
- Keep the final summary concise (under 500 chars for Telegram)`;

async function runJob(job) {
  console.log(`[Worker] Starting job: ${job.id} — ${job.title}`);
  markRunning(job.id);

  const fullPrompt = `# Task: ${job.title}\n\n${job.description}\n\nWhen done, summarize what you accomplished in 2-3 sentences.`;

  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_CLI, [
      '--print',
      '--output-format', 'text',
      '--model', 'sonnet',
      '--system-prompt', WORKER_SYSTEM_PROMPT,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: CLAUDE_WORKING_DIR,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => {
      stdout += d.toString();
      process.stdout.write(d); // Stream to worker log
    });
    proc.stderr.on('data', d => {
      stderr += d.toString();
    });

    proc.stdin.write(fullPrompt + '\n');
    proc.stdin.end();

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Job timed out after 30 minutes'));
    }, JOB_TIMEOUT);

    proc.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });
  });
}

async function notifyTelegram(chatId, message) {
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
  } catch (err) {
    console.error('[Worker] Telegram notify failed:', err.message);
  }
}

async function poll() {
  try {
    // Skip if a job is already running
    const running = getRunningJob();
    if (running) {
      console.log(`[Worker] Job already running: ${running.id} — ${running.title}`);
      return;
    }

    const job = getNextJob();
    if (!job) return; // Nothing to do

    try {
      const result = await runJob(job);
      markDone(job.id, result);
      console.log(`[Worker] ✅ Job done: ${job.id}`);

      const summary = result.slice(-400); // Last 400 chars = summary
      await notifyTelegram(job.notify_chat_id,
        `✅ <b>Job Done: ${job.title}</b>\n\n${summary}`
      );
    } catch (err) {
      markFailed(job.id, err.message);
      console.error(`[Worker] ❌ Job failed: ${job.id} —`, err.message);
      await notifyTelegram(job.notify_chat_id,
        `❌ <b>Job Failed: ${job.title}</b>\n\n${err.message.slice(0, 300)}`
      );
    }
  } catch (err) {
    console.error('[Worker] Poll error:', err.message);
  }
}

console.log('🤖 Worker started — polling every 10s');
setInterval(poll, POLL_INTERVAL);
poll(); // Run immediately on start
