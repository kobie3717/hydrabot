const path = require('path');
const HOME = process.env.HOME || '/root';
const JOBS_DIR = process.env.JOBS_DIR || path.join(HOME, 'jobs');

module.exports = {
  apps: [{
    name: 'worker-bot',
    script: path.join(JOBS_DIR, 'worker.mjs'),
    interpreter: 'node',
    cwd: JOBS_DIR,
    env_file: process.env.WORKER_ENV_FILE || path.join(HOME, 'claude-telegram-bot-friday/.env'),
    watch: false,
    restart_delay: 5000,
    max_restarts: 10,
    log_file: path.join(JOBS_DIR, 'worker.log')
  }]
};
