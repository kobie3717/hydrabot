#!/usr/bin/env node
/**
 * bot.mjs — Entry point for bot-circus dispatch to worker performer
 *
 * When dispatched by graph runner, args[0] is the task message.
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(await import('child_process').then(m => m.execFile));

const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || 'claude';
const CLAUDE_WORKING_DIR = process.env.CLAUDE_WORKING_DIR || process.env.HOME || '/root';
const JOB_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const WORKER_SYSTEM_PROMPT = `You are an autonomous worker agent. You complete coding, research, and operations tasks on a Linux VPS.

Working directory: ${CLAUDE_WORKING_DIR}
Available tools: All Claude Code tools (Read, Write, Edit, Bash, Glob, Grep, Agent)

Rules:
- Complete the task fully before reporting done
- Be precise — test your work
- Report what you did, what changed, and any issues
- Keep the final summary concise (under 500 chars for Telegram)`;

async function runTask(taskMessage) {
  const fullPrompt = `${taskMessage}\n\nWhen done, summarize what you accomplished in 2-3 sentences.`;

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
      reject(new Error('Task timed out after 30 minutes'));
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

// Entry point: args[2] is the task message from dispatch
const message = process.argv[2] || '';

if (!message) {
  console.error('[worker/bot] No message provided');
  process.exit(1);
}

try {
  const result = await runTask(message);
  console.log(JSON.stringify({ status: 'done', result }));
} catch (err) {
  console.error('[worker/bot] Task failed:', err.message);
  process.exit(1);
}
