#!/usr/bin/env node
/**
 * setup-performers.mjs — Initialize performer workspaces
 * Run once: node bot-circus/setup-performers.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const PERFORMERS_DIR = process.env.PERFORMERS_DIR ||
  new URL('../performers', import.meta.url).pathname;

const DEFAULT_PERFORMERS = [
  { id: 'bot1', name: 'Bot One', role: 'general assistant' },
];

for (const { id, name, role } of DEFAULT_PERFORMERS) {
  const dir = join(PERFORMERS_DIR, id);
  if (existsSync(dir)) {
    console.log(`✓ ${id} — already exists`);
    continue;
  }

  mkdirSync(join(dir, 'memory'), { recursive: true });

  writeFileSync(join(dir, 'SOUL.md'),
    `# ${name}\n\nYou are ${name}, a specialized AI sub-worker.\n\n## Role\n${role}\n\n## Behavior\n- Complete assigned tasks concisely\n- Return structured output when asked\n- Reference MEMORY.md for prior task context\n`
  );

  writeFileSync(join(dir, 'IDENTITY.md'),
    `# ${name}\nRole: ${role}\n`
  );

  writeFileSync(join(dir, 'USER.md'),
    `Be helpful, concise, and focused on the task.\n`
  );

  writeFileSync(join(dir, 'MEMORY.md'),
    `# ${name} Worker Memory\n\nTask results are appended here automatically.\n`
  );

  writeFileSync(join(dir, 'config.json'), JSON.stringify({
    id,
    name,
    troupe: null,
    persona_file: 'SOUL.md',
    rate_limits: { messages_per_minute: 20, max_queue_size: 100 },
    claude_config: { model: 'claude-sonnet-4-6', timeout_ms: 120000 },
    sub_bot: true,
    created_at: new Date().toISOString(),
  }, null, 2));

  console.log(`✓ ${id} — created`);
}

console.log('\nDone. Edit performers/ directories to customize personas.');
