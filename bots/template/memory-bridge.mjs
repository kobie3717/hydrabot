/**
 * memory-bridge.mjs — AI-IQ long-term memory integration
 *
 * Wraps the memory-tool CLI to give each bot its own persistent memory.
 * All operations are non-fatal — bot works fine if memory-tool is missing.
 */

import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lazy config — deferred until first use so dotenv has time to load
let _config = null;
function getConfig() {
  if (_config) return _config;
  const botName = process.env.BOT_NAME || 'MyBot';
  const dbPath = process.env.MEMORY_DB || process.env.AIIQ_DB_PATH || join(__dirname, 'data', `${botName.toLowerCase()}-memories.db`);

  // Find memory-tool — check env, PATH, then common virtualenv locations
  let memoryTool = 'memory-tool';
  if (process.env.MEMORY_TOOL_PATH) {
    memoryTool = process.env.MEMORY_TOOL_PATH;
  } else {
    try {
      memoryTool = execSync('which memory-tool', { encoding: 'utf8' }).trim();
    } catch {
      const candidates = [
        join(process.env.HOME || '', 'ml-env/bin/memory-tool'),
        join(process.env.HOME || '', '.local/bin/memory-tool'),
        join(process.env.HOME || '', 'venv/bin/memory-tool'),
      ];
      for (const p of candidates) {
        if (existsSync(p)) { memoryTool = p; break; }
      }
    }
  }

  // Ensure data directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  _config = { botName, dbPath, memoryTool };
  console.log(`[Memory] Bot: ${botName}, DB: ${dbPath}, Tool: ${memoryTool}`);
  return _config;
}

export async function storeMemory(content, tags = ['telegram', 'auto-captured'], category = 'learning') {
  try {
    const { botName, dbPath, memoryTool } = getConfig();
    const tagString = tags.join(',');
    await execFileAsync(memoryTool, [
      'add',
      category,
      content,
      '--tags', tagString,
      '--project', botName
    ], { timeout: 10000, env: { ...process.env, MEMORY_DB: dbPath } });

    console.log(`[Memory] Stored: ${content.substring(0, 80)}...`);
    return { ok: true };
  } catch (error) {
    console.error('[Memory] Store failed:', error.message);
    return { ok: false, error: error.message };
  }
}

export async function searchMemory(query, limit = 5) {
  try {
    const { dbPath, memoryTool } = getConfig();
    const execOpts = { timeout: 10000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, MEMORY_DB: dbPath } };
    // Try semantic search first, fall back to basic keyword search
    let stdout;
    try {
      ({ stdout } = await execFileAsync(memoryTool, ['search', query, '--semantic'], execOpts));
    } catch {
      ({ stdout } = await execFileAsync(memoryTool, ['search', query], execOpts));
    }

    const lines = stdout.trim().split('\n');
    const memories = [];
    let currentMemory = '';

    for (const line of lines) {
      // Match lines like "[1] learning | User preference: ..." or "1 | content..."
      if (line.match(/^\[?\d+\]?\s.*\|/)) {
        if (currentMemory) memories.push(currentMemory.trim());
        // Split on first pipe after the category
        const pipeIdx = line.indexOf('|');
        if (pipeIdx !== -1) {
          // Strip trailing metadata (⚡score, ~tokens, etc.)
          currentMemory = line.slice(pipeIdx + 1).replace(/[⚡~]\S+/g, '').trim();
        }
      } else if (currentMemory && line.trim() && !line.startsWith('💰') && !line.startsWith('[search_id')) {
        currentMemory += ' ' + line.trim();
      }
    }
    if (currentMemory) memories.push(currentMemory.trim());
    console.log(`[Memory] Search "${query}" → ${memories.length} results`);

    return memories.slice(0, limit);
  } catch (error) {
    console.error('[Memory] Search failed:', error.message);
    return [];
  }
}

export function extractFacts(userMessage, assistantResponse) {
  const facts = [];

  if (userMessage.match(/remember|save|store|note that|keep in mind/i)) {
    facts.push(`User preference: ${userMessage}`);
  }

  if (assistantResponse.match(/created|deployed|fixed|updated|installed|configured/i)) {
    const summary = assistantResponse.slice(0, 200).replace(/\n/g, ' ');
    facts.push(`Action completed: ${summary}`);
  }

  if (userMessage.match(/error|broke|failed|not working/i) &&
      assistantResponse.match(/fixed|solved|resolved|should work now/i)) {
    facts.push(`Issue resolved: ${userMessage.slice(0, 100)} → ${assistantResponse.slice(0, 100)}`);
  }

  return facts;
}

export async function buildMemoryContext(userMessage) {
  // Extract keywords for search — try multiple queries to maximize recall
  const stopWords = new Set(['what','when','where','which','who','how','does','did','the','and','for','are','but','not','you','all','can','had','her','was','one','our','out','with','have','this','that','from','they','been','said','each','tell','about','would','could','should','your','their','into','just','also','than','them','very','some','like','know','want','please','think','will','make','more']);
  const words = userMessage.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  if (words.length === 0) return '';

  // Search with each keyword, deduplicate results
  const seen = new Set();
  const allMemories = [];
  for (const word of words.slice(0, 4)) {
    const results = await searchMemory(word, 3);
    for (const mem of results) {
      if (!seen.has(mem)) {
        seen.add(mem);
        allMemories.push(mem);
      }
    }
  }

  if (allMemories.length === 0) return '';

  let context = '\n## Relevant Past Conversations\n\n';
  for (let i = 0; i < allMemories.slice(0, 3).length; i++) {
    context += `${i + 1}. ${allMemories[i]}\n`;
  }
  return context;
}

export async function autoStoreConversation(userMessage, assistantResponse) {
  const facts = extractFacts(userMessage, assistantResponse);
  for (const fact of facts) {
    await storeMemory(fact);
  }
}
