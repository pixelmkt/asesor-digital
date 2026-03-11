/* ═══════════════════════════════════════════════════════════════
   Knowledge Base v2 — RAG engine with Google Drive/Docs/Sheets support
   Import from: Google Drive shared URLs, Google Docs (export),
   Google Sheets (export), plain URLs, files, text
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const KB_DIR = path.join(__dirname, '..', 'data');
const KB_FILE = path.join(KB_DIR, 'knowledge.json');
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

let kb = { sources: [], chunks: [], lastUpdated: null };

function ensureDir() { if (!fs.existsSync(KB_DIR)) fs.mkdirSync(KB_DIR, { recursive: true }); }
function load() {
  ensureDir();
  try { if (fs.existsSync(KB_FILE)) kb = JSON.parse(fs.readFileSync(KB_FILE, 'utf8')); }
  catch (e) { console.error('KB load error:', e.message); }
}
function save() {
  ensureDir();
  kb.lastUpdated = new Date().toISOString();
  fs.writeFileSync(KB_FILE, JSON.stringify(kb, null, 2));
}

function chunkText(text, sourceId, sourceName, category = 'general') {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const slice = words.slice(i, i + CHUNK_SIZE);
    if (slice.length < 20) continue;
    chunks.push({ id: crypto.randomUUID(), sourceId, sourceName, category, content: slice.join(' '), wordCount: slice.length, createdAt: new Date().toISOString() });
  }
  return chunks;
}

function addSource(name, text, type = 'text', category = 'general', meta = {}) {
  const sourceId = crypto.randomUUID();
  const chunks = chunkText(text, sourceId, name, category);
  const source = { id: sourceId, name, type, category, chunkCount: chunks.length, wordCount: text.split(/\s+/).length, createdAt: new Date().toISOString(), ...meta };
  kb.sources.push(source);
  kb.chunks.push(...chunks);
  save();
  return source;
}

function removeSource(sourceId) {
  kb.sources = kb.sources.filter(s => s.id !== sourceId);
  kb.chunks = kb.chunks.filter(c => c.sourceId !== sourceId);
  save();
}

function clearShopifySources() {
  const ids = kb.sources.filter(s => s.type === 'shopify').map(s => s.id);
  kb.sources = kb.sources.filter(s => s.type !== 'shopify');
  kb.chunks = kb.chunks.filter(c => !ids.includes(c.sourceId));
  save();
}

// ── improved RAG search with TF-IDF-like scoring ──
function search(query, maxChunks = 6) {
  if (!kb.chunks.length) return '';

  const queryWords = query.toLowerCase()
    .replace(/[^a-záéíóúñü0-9\s]/gi, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (!queryWords.length) return kb.chunks.slice(0, 3).map(c => c.content).join('\n\n');

  // Stop words to ignore in scoring
  const STOP = new Set(['que','los','las','una','para','como','con','por','del','hay','sus','puede','mas','pero','cuando','este','esos','todo']);

  const significantWords = queryWords.filter(w => !STOP.has(w));

  const scored = kb.chunks.map(chunk => {
    const lower = chunk.content.toLowerCase();
    let score = 0;
    for (const word of significantWords) {
      const matches = (lower.match(new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*\\b', 'gi')) || []).length;
      score += matches * 2;
    }
    // Exact phrase boost
    const phraseMatch = lower.includes(query.toLowerCase().substring(0, 25).trim());
    if (phraseMatch) score += 8;
    // Category boosts
    if (chunk.category === 'products' && significantWords.some(w => ['proteina','creatina','suplemento','precio','producto','comprar','recomienda','whey','bcaa','omega','vitamina','colágeno','colageno'].includes(w))) score += 4;
    if (chunk.category === 'policies' && significantWords.some(w => ['devolucion','cambio','garantia','envio','tiempo','entrega','politica'].includes(w))) score += 4;
    return { ...chunk, score };
  });

  const top = scored.sort((a, b) => b.score - a.score).slice(0, maxChunks).filter(c => c.score > 0);
  if (!top.length) return kb.chunks.slice(0, 2).map(c => `[${c.sourceName}]\n${c.content}`).join('\n\n---\n\n');
  return top.map(c => `[${c.sourceName}]\n${c.content}`).join('\n\n---\n\n');
}

// ── File parser ──
function parseFile(filename, buffer) {
  const ext = path.extname(filename).toLowerCase();
  const text = buffer.toString('utf8');
  if (ext === '.html') return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (ext === '.json') {
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch {}
  }
  return text;
}

// ── HTTP fetch helper ──
function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Demasiados redirects'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AsesorDigital/2.0)' } }, res => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchUrl(res.headers.location, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Google Drive/Docs URL converter ──
function resolveGoogleUrl(rawUrl) {
  // Google Docs: https://docs.google.com/document/d/DOC_ID/edit → export as plain text
  const docsMatch = rawUrl.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docsMatch) {
    return { url: `https://docs.google.com/document/d/${docsMatch[1]}/export?format=txt`, type: 'gdoc' };
  }

  // Google Sheets: https://docs.google.com/spreadsheets/d/SHEET_ID/edit → export as CSV
  const sheetsMatch = rawUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetsMatch) {
    return { url: `https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/export?format=csv`, type: 'gsheet' };
  }

  // Google Drive file: https://drive.google.com/file/d/FILE_ID/view → direct download
  const driveFileMatch = rawUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch) {
    return { url: `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`, type: 'gdrive_file' };
  }

  // Google Drive open: https://drive.google.com/open?id=FILE_ID
  const driveOpenMatch = rawUrl.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (driveOpenMatch) {
    return { url: `https://drive.google.com/uc?export=download&id=${driveOpenMatch[1]}`, type: 'gdrive_file' };
  }

  // Google Drive shared folder — list view (not directly downloadable, inform user)
  const driveFolderMatch = rawUrl.match(/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/);
  if (driveFolderMatch) {
    return { url: rawUrl, type: 'gdrive_folder', error: 'Las carpetas de Drive no se pueden importar directamente. Comparte cada archivo individualmente.' };
  }

  // NotebookLM — not directly accessible via API, return guidance
  if (rawUrl.includes('notebooklm.google.com')) {
    return { url: rawUrl, type: 'notebooklm', error: 'NotebookLM no permite acceso directo por URL. Exporta tu notebook como texto (.txt) y subelo como archivo.' };
  }

  // Regular URL
  return { url: rawUrl, type: 'url' };
}

// ── Import from Google Drive / Docs / generic URL ──
async function importFromUrl(rawUrl, name) {
  const resolved = resolveGoogleUrl(rawUrl);
  if (resolved.error) throw new Error(resolved.error);

  const html = await fetchUrl(resolved.url);
  let text = html;

  // Clean HTML if not already plain text
  if (!['gdoc', 'gsheet'].includes(resolved.type)) {
    text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
               .replace(/<style[\s\S]*?<\/style>/gi, '')
               .replace(/<[^>]+>/g, ' ')
               .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
               .replace(/\s+/g, ' ').trim();
  }

  if (!text || text.length < 50) throw new Error('El contenido importado esta vacio o no es accesible. Asegurate de que el documento sea publico (cualquiera con el link puede ver).');

  const friendly = resolved.type === 'gdoc' ? 'Google Docs' : resolved.type === 'gsheet' ? 'Google Sheets' : resolved.type === 'gdrive_file' ? 'Google Drive' : 'URL';
  const sourceName = name || `${friendly}: ${rawUrl.substring(0, 60)}`;
  return addSource(sourceName, text.substring(0, 500000), resolved.type === 'url' ? 'url' : 'google', resolved.type, { originalUrl: rawUrl, googleType: resolved.type });
}

function getStats() {
  return {
    sources: kb.sources.length,
    chunks: kb.chunks.length,
    totalWords: kb.chunks.reduce((sum, c) => sum + c.wordCount, 0),
    byType: {
      file: kb.sources.filter(s => s.type === 'file').length,
      text: kb.sources.filter(s => s.type === 'text').length,
      shopify: kb.sources.filter(s => s.type === 'shopify').length,
      url: kb.sources.filter(s => s.type === 'url').length,
      google: kb.sources.filter(s => s.type === 'google').length
    },
    lastUpdated: kb.lastUpdated
  };
}

function getSources() { return kb.sources; }

load();

module.exports = { addSource, removeSource, clearShopifySources, search, getStats, getSources, parseFile, importFromUrl, resolveGoogleUrl, load, save };
