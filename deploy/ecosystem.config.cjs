// PM2 ecosystem config for all live VPS services
// Paths default to $HOME-relative; override with environment variables or edit to match your layout
const HOME = process.env.HOME || '/root';
const path = require('path');
const join = path.join;

module.exports = {
  apps: [
    // Separate repos (deployed from their own locations)
    {
      name: '007-bot',
      cwd: join(HOME, '007-bot'),
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'claw-bot',
      cwd: join(HOME, 'claude-telegram-bot'),
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'friday-bot',
      cwd: join(HOME, 'claude-telegram-bot-friday'),
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'octo-bot',
      cwd: join(HOME, 'octo-bot'),
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'wa-drone-bot',
      cwd: join(HOME, 'wa-drone-bot'),
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    // Performers (from hydrabot repo)
    {
      name: 'webbs',
      cwd: join(HOME, 'webbs'),
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'worker-bot',
      cwd: join(HOME, 'jobs'),
      script: 'worker.mjs',
      watch: false,
      max_memory_restart: '256M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
