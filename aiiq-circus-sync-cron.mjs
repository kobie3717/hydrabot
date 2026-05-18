#!/usr/bin/env node
// aiiq-circus-sync-cron.mjs — runs aiiq-circus-sync for each agent in sequence
// PM2 cron_restart: every 6 hours ("0 */6 * * *")
// Logs: /var/log/aiiq-circus-sync.log

import { spawn } from 'child_process';

const AGENTS = [
  { name: 'Claw',     role: 'builder' },
  { name: 'Friday',   role: 'assistant' },
  { name: '007',      role: 'intelligence' },
  { name: 'Octo',     role: 'multitasker' },
  { name: 'WA-Drone', role: 'wa-drone' },
  { name: 'webbs',    role: 'builder' },
];

function run(name, role) {
  return new Promise((resolve) => {
    console.log(`\n[Cron] ── Syncing ${name} ──`);
    const proc = spawn('node', [new URL('../aiiq-circus-sync.mjs', import.meta.url).pathname, name, role], {
      stdio: 'inherit',
    });
    proc.on('close', (code) => {
      console.log(`[Cron] ${name} sync exited ${code}`);
      resolve();
    });
    proc.on('error', (err) => {
      console.error(`[Cron] ${name} spawn error:`, err.message);
      resolve();
    });
  });
}

async function main() {
  const start = Date.now();
  console.log(`[Cron] AI-IQ → Circus sync started at ${new Date().toISOString()}`);
  for (const { name, role } of AGENTS) {
    await run(name, role);
  }
  console.log(`[Cron] All agents synced in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch(err => {
  console.error('[Cron] Fatal:', err);
  process.exit(1);
});
