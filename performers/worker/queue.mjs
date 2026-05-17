import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

const JOBS_DIR = '/root/jobs';
const DB_PATH = join(JOBS_DIR, 'queue.db');

mkdirSync(JOBS_DIR, { recursive: true });

let _db = null;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        submitted_by TEXT NOT NULL,
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        notify_chat_id TEXT
      )
    `);
  }
  return _db;
}

export function enqueueJob({ title, description, submittedBy, notifyChatId }) {
  const db = getDb();
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  db.prepare(`
    INSERT INTO jobs (id, title, description, status, submitted_by, created_at, notify_chat_id)
    VALUES (?, ?, ?, 'queued', ?, ?, ?)
  `).run(id, title, description, submittedBy, new Date().toISOString(), notifyChatId || null);
  console.log(`[Jobs] Enqueued: ${id} — ${title}`);
  return id;
}

export function getNextJob() {
  const db = getDb();
  return db.prepare(`SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`).get();
}

export function markRunning(id) {
  getDb().prepare(`UPDATE jobs SET status='running', started_at=? WHERE id=?`).run(new Date().toISOString(), id);
}

export function markDone(id, result) {
  getDb().prepare(`UPDATE jobs SET status='done', result=?, completed_at=? WHERE id=?`).run(result, new Date().toISOString(), id);
}

export function markFailed(id, error) {
  getDb().prepare(`UPDATE jobs SET status='failed', error=?, completed_at=? WHERE id=?`).run(error, new Date().toISOString(), id);
}

export function listJobs(limit = 10) {
  return getDb().prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`).all(limit);
}

export function getJob(id) {
  return getDb().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
}

export function getRunningJob() {
  return getDb().prepare(`SELECT * FROM jobs WHERE status = 'running' LIMIT 1`).get();
}
