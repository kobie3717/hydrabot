module.exports = {
  apps: [
    {
      name: 'octo-bot',
      script: '/opt/hydrabot/bots/octo/bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'claw-bot',
      script: '/opt/hydrabot/bots/claw/bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'friday-bot',
      script: '/opt/hydrabot/bots/friday/bot.mjs',
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    // Add more bots here...
  ],
};
