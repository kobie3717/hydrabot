// PM2 ecosystem config for all live VPS services
module.exports = {
  apps: [
    // Separate repos (deployed from their own locations)
    {
      name: '007-bot',
      cwd: '/root/007-bot',
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'claw-bot',
      cwd: '/root/claude-telegram-bot',
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'friday-bot',
      cwd: '/root/claude-telegram-bot-friday',
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'octo-bot',
      cwd: '/root/octo-bot',
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'wa-drone-bot',
      cwd: '/root/wa-drone-bot',
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    // Performers (from hydrabot repo)
    {
      name: 'webbs',
      cwd: '/root/webbs',
      script: 'bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'worker-bot',
      cwd: '/root/jobs',
      script: 'worker.mjs',
      watch: false,
      max_memory_restart: '256M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
