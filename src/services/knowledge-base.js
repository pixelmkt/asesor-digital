/* ═══════════════════════════════════════════════════════════════
   Knowledge Base — Document ingestion, chunking, and retrieval
   RAG-style context engine for the AI advisor
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KB_DIR = path.join(__dirname, '..', 'data');
const KB_FILE = path.join(KB_DIR, 'knowledge.json');
const CHUNK_SIZE = 500; // words per chunk
const CHUNK_OVERLAP = 50; // overlap words

let kb = { sources: [], chunks: [], lastUpdated: null };

function ensureDir() { if (!fs.existsSync(KB_DIR)) fs.mkdirSync(KB_DIR, { recursive: true }); }

function load() {
  ensureDir();
  try { if (fs.existsSync(KB_FILE)) kb = JSON.parse(fs.readFileSync(KB_FILE, 'utf8')); } catch (e) { console.error('KB load error:', e.message); }
}

function save() {
  ensureDir();
  kb.lastUpdated = new Date().toISOString();
  fs.writeFileSync(KB_FILE, JSON.stringify(kb, null, 2));
}

/**
 * Split text into overlapping chunks
 */
function chunkText(text, sourceId, sourceName, category = 'general') {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const slice = words.slice(i, i + CHUNK_SIZE);
    if (slice.length < 20) continue; // skip tiny trailing chunks
    chunks.push({
      id: crypto.randomUUID(),
      sourceId,
      sourceName,
      category,
      content: slice.join(' '),
      wordCount: slice.length,
      createdAt: new Date().toISOString()
    });
  }
  return chunks;
}

/**
 * Add a text source to the knowledge base
 * @param {string} name - Source name (e.g. "Products.txt", "FAQ", "Manual")
 * @param {string} text - Raw text content
 * @param {string} type - 'file' | 'text' | 'shopify' | 'url'
 * @param {string} category - Category tag
 * @returns {Object} source info
 */
function addSource(name, text, type = 'text', category = 'general') {
  const sourceId = crypto.randomUUID();
  const chunks = chunkText(text, sourceId, name, category);

  const source = {
    id: sourceId,
    name,
    type,
    category,
    chunkCount: chunks.length,
    wordCount: text.split(/\s+/).length,
    createdAt: new Date().toISOString()
  };

  kb.sources.push(source);
  kb.chunks.push(...chunks);
  save();

  return source;
}

/**
 * Remove a source and its chunks
 */
function removeSource(sourceId) {
  kb.sources = kb.sources.filter(s => s.id !== sourceId);
  kb.chunks = kb.chunks.filter(c => c.sourceId !== sourceId);
  save();
}

/**
 * Clear all Shopify-crawled data (to re-crawl fresh)
 */
function clearShopifySources() {
  const shopifyIds = kb.sources.filter(s => s.type === 'shopify').map(s => s.id);
  kb.sources = kb.sources.filter(s => s.type !== 'shopify');
  kb.chunks = kb.chunks.filter(c => !shopifyIds.includes(c.sourceId));
  save();
}

/**
 * Search knowledge base for relevant context
 * Simple keyword matching — effective and fast for moderate KB sizes
 * @param {string} query - User's message
 * @param {number} maxChunks - Max chunks to return
 * @returns {string} Combined context text
 */
function search(query, maxChunks = 6) {
  if (!kb.chunks.length) return '';

  const queryWords = query.toLowerCase()
    .replace(/[^a-záéíóúñü0-9\s]/gi, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (!queryWords.length) return kb.chunks.slice(0, 3).map(c => c.content).join('\n\n');

  // Score each chunk by keyword matches
  const scored = kb.chunks.map(chunk => {
    const lower = chunk.content.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      const occurrences = (lower.match(new RegExp(word, 'gi')) || []).length;
      score += occurrences;
      // Boost exact phrase matches
      if (lower.includes(query.toLowerCase().substring(0, 30))) score += 5;
    }
    // Boost product-related chunks for commerce queries
    if (chunk.category === 'products' && queryWords.some(w => ['proteina', 'creatina', 'suplemento', 'precio', 'producto', 'comprar', 'recomienda'].includes(w))) {
      score += 3;
    }
    return { ...chunk, score };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);
  const topChunks = sorted.slice(0, maxChunks).filter(c => c.score > 0);

  if (!topChunks.length) return kb.chunks.slice(0, 3).map(c => c.content).join('\n\n');

  return topChunks.map(c => `[${c.sourceName}]\n${c.content}`).join('\n\n---\n\n');
}

/**
 * Get KB statistics
 */
function getStats() {
  return {
    sources: kb.sources.length,
    chunks: kb.chunks.length,
    totalWords: kb.chunks.reduce((sum, c) => sum + c.wordCount, 0),
    byType: {
      file: kb.sources.filter(s => s.type === 'file').length,
      text: kb.sources.filter(s => s.type === 'text').length,
      shopify: kb.sources.filter(s => s.type === 'shopify').length,
      url: kb.sources.filter(s => s.type === 'url').length
    },
    lastUpdated: kb.lastUpdated
  };
}

function getSources() { return kb.sources; }

/**
 * Parse uploaded file content based on extension
 */
function parseFile(filename, buffer) {
  const ext = path.extname(filename).toLowerCase();
  const text = buffer.toString('utf8');

  if (['.txt', '.md', '.csv', '.json', '.html'].includes(ext)) {
    // Strip HTML tags if HTML
    if (ext === '.html') return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
  }

  // For unrecognized formats, try as text
  return text;
}

// Initialize
load();

module.exports = { addSource, removeSource, clearShopifySources, search, getStats, getSources, parseFile, load, save };
