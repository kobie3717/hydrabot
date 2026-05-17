module.exports = {
  apps: [{
    name: 'worker-bot',
    script: '/root/jobs/worker.mjs',
    interpreter: 'node',
    cwd: '/root/jobs',
    env_file: '/root/claude-telegram-bot-friday/.env', // Use Friday's token for Telegram notify
    watch: false,
    restart_delay: 5000,
    max_restarts: 10,
    log_file: '/root/jobs/worker.log'
  }]
};
