/* ═══════════════════════════════════════════════════════════════
   Asesor Digital — Main Server
   Universal AI Advisor Platform for Shopify
   ═══════════════════════════════════════════════════════════════ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const llm = require('./services/llm-router');
const kb = require('./services/knowledge-base');
const crawler = require('./services/shopify-crawler');
const store = require('./services/storage');
const email = require('./services/email-service');

const app = express();
const PORT = process.env.PORT || 3000;
const SHOP = process.env.SHOPIFY_SHOP;
const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;

// ── Upload config ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.md', '.csv', '.json', '.html'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// ── Middleware ──
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CSP for Shopify iframe embedding
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', `frame-ancestors https://${SHOP} https://admin.shopify.com;`);
  res.setHeader('X-Frame-Options', `ALLOW-FROM https://${SHOP}`);
  next();
});

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 60000, max: 120, standardHeaders: true });
const chatLimiter = rateLimit({ windowMs: 60000, max: 30, message: { error: 'Too many requests' } });
app.use('/api/', apiLimiter);
app.use('/api/chat', chatLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════
// SHOPIFY OAUTH
// ══════════════════════════════════════
app.get('/auth', (req, res) => {
  const shop = req.query.shop || SHOP;
  const scopes = 'read_products,read_content,read_metaobjects';
  const redirect = `${process.env.BACKEND_URL}/auth/callback`;
  const nonce = crypto.randomBytes(16).toString('hex');
  res.redirect(`https://${shop}/admin/oauth/authorize?client_id=${API_KEY}&scope=${scopes}&redirect_uri=${redirect}&state=${nonce}`);
});

app.get('/auth/callback', async (req, res) => {
  const { shop, code } = req.query;
  try {
    const https = require('https');
    const body = JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET, code });
    const tokenRes = await new Promise((resolve, reject) => {
      const r = https.request({ hostname: shop, path: '/admin/oauth/access_token', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, resp => {
        let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve(JSON.parse(d)));
      });
      r.on('error', reject); r.write(body); r.end();
    });
    if (tokenRes.access_token) {
      process.env.SHOPIFY_ACCESS_TOKEN = tokenRes.access_token;
      store.updateConfig('shopify', { connected: true, shop, accessToken: tokenRes.access_token });
      res.redirect('/');
    } else {
      res.status(400).json({ error: 'OAuth failed', details: tokenRes });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════
// CHAT API — Main endpoint for widget
// ══════════════════════════════════════
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, sessionId } = req.body;
    if (!messages || !messages.length) return res.status(400).json({ error: 'messages required' });

    const config = store.getConfig();
    const llmConfig = config.llm;
    const behavior = config.behavior;

    // Get API key from config or env
    const provider = llmConfig.provider || 'gemini';
    let apiKey = llmConfig.apiKey;
    if (!apiKey) {
      if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
      else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
      else if (provider === 'claude') apiKey = process.env.CLAUDE_API_KEY;
    }
    if (!apiKey) return res.status(500).json({ error: 'LLM API key not configured. Go to admin settings.' });

    // Build context from knowledge base
    const lastMsg = messages[messages.length - 1]?.content || '';
    const context = kb.search(lastMsg, 6);

    // Build system prompt
    let systemPrompt = behavior.systemPrompt || '';
    if (behavior.customRules) systemPrompt += '\n\nREGLAS ADICIONALES:\n' + behavior.customRules;

    // Data collection instructions
    if (behavior.dataCollection?.enabled) {
      const fields = behavior.dataCollection.fields || ['name', 'email'];
      const fieldNames = { name: 'nombre', email: 'correo electronico', phone: 'telefono', goal: 'objetivo' };
      const askFields = fields.map(f => fieldNames[f] || f).join(', ');
      systemPrompt += `\n\nRECOLECCION DE DATOS: Despues de ${behavior.dataCollection.askAfterMessages || 2} mensajes, solicita de forma conversacional: ${askFields}. Hazlo naturalmente, no como formulario.`;
    }

    const result = await llm.chat({
      provider,
      apiKey,
      model: llmConfig.model || undefined,
      messages,
      systemPrompt,
      context,
      opts: { temperature: llmConfig.temperature, maxTokens: llmConfig.maxTokens }
    });

    // Track event
    store.addEvent({ type: 'chat_message', sessionId, data: { userMsg: lastMsg.substring(0, 100), tokensUsed: result.tokensUsed } });

    // Save conversation
    if (sessionId) {
      store.saveConversation(sessionId, [...messages, { role: 'assistant', content: result.response }]);
    }

    res.json({ response: result.response, model: result.model, provider: result.provider });
  } catch (e) {
    console.error('Chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════
// WIDGET CONFIG — Public endpoint
// ══════════════════════════════════════
app.get('/api/widget/config', (req, res) => {
  const config = store.getConfig();
  // Return only public widget config (no API keys etc)
  res.json({
    widget: config.widget,
    behavior: {
      dataCollection: config.behavior.dataCollection,
      showProducts: config.behavior.showProducts,
      maxResponseLength: config.behavior.maxResponseLength
    },
    chatEndpoint: (process.env.BACKEND_URL || '') + '/api/chat',
    trackEndpoint: (process.env.BACKEND_URL || '') + '/api/track/event'
  });
});

// ══════════════════════════════════════
// KNOWLEDGE BASE API
// ══════════════════════════════════════
app.get('/api/knowledge/stats', (req, res) => res.json(kb.getStats()));
app.get('/api/knowledge/sources', (req, res) => res.json({ sources: kb.getSources() }));

app.post('/api/knowledge/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const text = kb.parseFile(req.file.originalname, req.file.buffer);
    const source = kb.addSource(req.file.originalname, text, 'file', req.body.category || 'general');
    res.json({ success: true, source });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/knowledge/text', (req, res) => {
  try {
    const { name, content, category } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const source = kb.addSource(name || 'Texto manual', content, 'text', category || 'general');
    res.json({ success: true, source });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/knowledge/crawl', async (req, res) => {
  try {
    const token = process.env.SHOPIFY_ACCESS_TOKEN || store.getConfig().shopify?.accessToken;
    if (!token) return res.status(400).json({ error: 'Shopify not connected. Complete OAuth first.' });

    // Clear previous crawl data
    kb.clearShopifySources();

    const data = await crawler.crawlStore(SHOP, token, process.env.SHOPIFY_API_VERSION);
    const results = [];

    if (data.products) results.push(kb.addSource('Shopify - Productos', data.products, 'shopify', 'products'));
    if (data.collections) results.push(kb.addSource('Shopify - Colecciones', data.collections, 'shopify', 'collections'));
    if (data.pages) results.push(kb.addSource('Shopify - Paginas', data.pages, 'shopify', 'pages'));
    if (data.metaobjects) results.push(kb.addSource('Shopify - Metaobjects', data.metaobjects, 'shopify', 'metaobjects'));

    res.json({ success: true, sources: results, stats: kb.getStats() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/knowledge/url', async (req, res) => {
  try {
    const { url, name } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const https = url.startsWith('https') ? require('https') : require('http');
    const text = await new Promise((resolve, reject) => {
      https.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d)); }).on('error', reject);
    });
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const source = kb.addSource(name || url, cleanText, 'url');
    res.json({ success: true, source });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/knowledge/source/:id', (req, res) => {
  kb.removeSource(req.params.id);
  res.json({ success: true, stats: kb.getStats() });
});

// ══════════════════════════════════════
// CONFIG API
// ══════════════════════════════════════
app.get('/api/config', (req, res) => {
  const config = store.getFullConfig();
  // Mask API keys for display
  const safe = JSON.parse(JSON.stringify(config));
  if (safe.llm?.apiKey) safe.llm.apiKey = safe.llm.apiKey.substring(0, 8) + '...' + safe.llm.apiKey.slice(-4);
  res.json(safe);
});

app.put('/api/config/:section', (req, res) => {
  try {
    const updated = store.updateConfig(req.params.section, req.body);
    res.json({ success: true, config: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════
// LLM API
// ══════════════════════════════════════
app.get('/api/llm/providers', (req, res) => res.json({ providers: llm.getProviders() }));

app.post('/api/llm/test', async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body;
    const result = await llm.testConnection(provider, apiKey, model);
    res.json({ success: true, response: result.response, model: result.model });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════
// TRACKING API
// ══════════════════════════════════════
app.post('/api/track/event', (req, res) => {
  store.addEvent(req.body);
  res.json({ ok: true });
});

app.post('/api/track/lead', (req, res) => {
  const lead = store.addLead(req.body);
  res.json({ ok: true, leadId: lead.id });
});

app.post('/api/track/purchase', (req, res) => {
  store.addPurchase(req.body);
  res.json({ ok: true });
});

// ══════════════════════════════════════
// ANALYTICS API
// ══════════════════════════════════════
app.get('/api/analytics/summary', (req, res) => res.json(store.getSummary(req.query.period || '30d')));
app.get('/api/analytics/leads', (req, res) => res.json({ leads: store.getLeads(req.query) }));
app.get('/api/analytics/purchases', (req, res) => {
  const purchases = store.getPurchases();
  res.json({ purchases, total: purchases.length, totalRevenue: purchases.reduce((s, p) => s + (p.total || p.data?.total || 0), 0) });
});

// ══════════════════════════════════════
// LEADS
// ══════════════════════════════════════
app.get('/api/leads/export/csv', (req, res) => {
  const leads = store.getLeads();
  const csv = 'Nombre,Email,Telefono,Objetivo,Estado,Compras,Fecha\n' +
    leads.map(l => `"${l.name||''}","${l.email||''}","${l.phone||''}","${l.goal||''}","${l.status||''}","${l.purchaseTotal||0}","${l.createdAt||''}"`).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
  res.send(csv);
});

// ══════════════════════════════════════
// REMARKETING
// ══════════════════════════════════════
app.get('/api/remarketing/templates', (req, res) => res.json({ templates: email.getTemplates() }));

app.post('/api/remarketing/send', async (req, res) => {
  try {
    const { leadIds, templateId, subject, htmlBody, customData } = req.body;
    const config = store.getConfig().email;
    const leads = store.getLeads().filter(l => leadIds.includes(l.id) && l.email);
    let sent = 0;
    for (const lead of leads) {
      try {
        if (templateId) {
          await email.sendRemarketing(config, lead.email, templateId, { ...customData, name: lead.name, goal: lead.goal, storeName: store.getConfig().widget.name });
        } else {
          await email.sendCustomEmail(config, lead.email, subject, htmlBody);
        }
        store.updateLead(lead.id, { status: 'remarketed' });
        sent++;
      } catch (e) { console.error('Email error:', e.message); }
    }
    res.json({ success: true, sent, total: leads.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════
// ROUTINES
// ══════════════════════════════════════
app.post('/api/routines/send', async (req, res) => {
  try {
    const config = store.getConfig().email;
    const { to, leadId, ...routineData } = req.body;
    const recipient = to || (leadId ? store.getLeads().find(l => l.id === leadId)?.email : null);
    if (!recipient) return res.status(400).json({ error: 'Recipient email required' });
    await email.sendRoutine(config, recipient, routineData);
    if (leadId) store.updateLead(leadId, { status: 'routine_sent' });
    res.json({ success: true, sentTo: recipient });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════
// SETTINGS / HEALTH
// ══════════════════════════════════════
app.get('/api/settings', (req, res) => {
  const config = store.getConfig();
  res.json({
    shopify_connected: !!process.env.SHOPIFY_ACCESS_TOKEN || !!config.shopify?.connected,
    smtp_configured: !!(config.email?.smtpUser || process.env.SMTP_USER),
    llm_configured: !!config.llm?.apiKey || !!process.env.GEMINI_API_KEY || !!process.env.OPENAI_API_KEY || !!process.env.CLAUDE_API_KEY,
    llm_provider: config.llm?.provider || 'none',
    backend_url: process.env.BACKEND_URL || `http://localhost:${PORT}`,
    kb_stats: kb.getStats()
  });
});

app.get('/health', (req, res) => res.json({
  status: 'ok', app: 'asesor-digital', version: '1.0.0',
  uptime: process.uptime(),
  shopify: !!process.env.SHOPIFY_ACCESS_TOKEN,
  llm: store.getConfig().llm?.provider || 'none',
  kb: kb.getStats()
}));

// Serve admin dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ══════════════════════════════════════
// WIDGET SCRIPT — Served as JS
// ══════════════════════════════════════
app.get('/widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'widget.js'));
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║   Asesor Digital — AI Advisor Platform         ║`);
  console.log(`║   Running on port ${PORT}                         ║`);
  console.log(`║   Shop: ${SHOP || 'not set'}${' '.repeat(Math.max(0, 28 - (SHOP||'').length))}║`);
  console.log(`║   LLM: ${store.getConfig().llm?.provider || 'not configured'}${' '.repeat(Math.max(0, 29 - (store.getConfig().llm?.provider||'').length))}║`);
  console.log(`║   KB: ${kb.getStats().chunks} chunks indexed${' '.repeat(Math.max(0, 22 - String(kb.getStats().chunks).length))}║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);
});
