/* ═══════════════════════════════════════════════════════════════
   Asesor Digital v2 — Main Server
   Universal AI Advisor Platform for Shopify
   Scopes: read_products, read_content, read_metaobjects,
   read_customers, read_orders, read_inventory, read_analytics,
   write_script_tags, write_price_rules, write_discounts,
   write_draft_orders, read_shipping, read_themes
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
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-01';

function getToken() { return process.env.SHOPIFY_ACCESS_TOKEN || store.getConfig().shopify?.accessToken; }

// ── Upload config (KB files) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.md', '.csv', '.json', '.html'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});
// ── Upload config (images/GIFs for avatar/logo) ──
const fs = require('fs');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const imgUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, 'logo_' + Date.now() + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

// ── Middleware ──
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const apiLimiter = rateLimit({ windowMs: 60000, max: 120, standardHeaders: true });
const chatLimiter = rateLimit({ windowMs: 60000, max: 30, message: { error: 'Too many requests' } });
app.use('/api/', apiLimiter);
app.use('/api/chat', chatLimiter);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ═══ SHOPIFY OAUTH — FULL SCOPES ═══
const SCOPES = [
  'read_products','read_product_listings','read_inventory',
  'read_content','read_online_store_pages','read_online_store_navigation',
  'read_metaobjects','read_metaobject_definitions',
  'read_customers','read_orders',
  'read_analytics','read_customer_events',
  'read_shipping','read_locales','read_markets','read_translations',
  'read_themes','write_theme_code',
  'write_script_tags',
  'write_price_rules','write_discounts',
  'write_draft_orders','read_draft_orders',
  'read_fulfillments',
  'read_files',
  'read_legal_policies',
  'read_pixels','write_pixels',
  'read_app_proxy','write_app_proxy'
].join(',');

app.get('/auth', (req, res) => {
  const shop = req.query.shop || SHOP;
  const redirect = `${process.env.BACKEND_URL}/auth/callback`;
  const nonce = crypto.randomBytes(16).toString('hex');
  res.redirect(`https://${shop}/admin/oauth/authorize?client_id=${API_KEY}&scope=${SCOPES}&redirect_uri=${redirect}&state=${nonce}`);
});

app.get('/auth/callback', async (req, res) => {
  const { shop, code } = req.query;
  try {
    const https = require('https');
    const body = JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET, code });
    const tokenRes = await new Promise((resolve, reject) => {
      const r = https.request({ hostname: shop, path: '/admin/oauth/access_token', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve(JSON.parse(d))); });
      r.on('error', reject); r.write(body); r.end();
    });
    if (tokenRes.access_token) {
      process.env.SHOPIFY_ACCESS_TOKEN = tokenRes.access_token;
      store.updateConfig('shopify', { connected: true, shop, accessToken: tokenRes.access_token, scopes: SCOPES });
      // Auto-inject widget via Script Tags
      const widgetUrl = `${process.env.BACKEND_URL}/widget.js`;
      try { await crawler.injectScriptTag(shop, tokenRes.access_token, widgetUrl, API_VERSION); console.log('[OAuth] Widget auto-injected via Script Tag'); }
      catch (e) { console.error('[OAuth] Script tag error:', e.message); }
      res.redirect('/');
    } else {
      res.status(400).json({ error: 'OAuth failed', details: tokenRes });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ CHAT API ═══
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, sessionId } = req.body;
    if (!messages || !messages.length) return res.status(400).json({ error: 'messages required' });
    const config = store.getConfig();
    const llmConfig = config.llm;
    const behavior = config.behavior;
    const provider = llmConfig.provider || 'gemini';
    let apiKey = llmConfig.apiKey;
    if (!apiKey) {
      if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
      else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
      else if (provider === 'claude') apiKey = process.env.CLAUDE_API_KEY;
    }
    if (!apiKey) return res.status(500).json({ error: 'LLM API key not configured. Ve a LLM / IA en el admin.' });

    const lastMsg = messages[messages.length - 1]?.content || '';
    const context = kb.search(lastMsg, 8);

    // ── Build system prompt ──
    let systemPrompt = behavior.systemPrompt || 'Eres un asesor experto y conversacional. Recomienda productos de forma personalizada.';
    if (behavior.tone) {
      const toneMap = { professional: 'Usa un tono profesional y confiable.', friendly: 'Usa un tono amigable y cercano.', expert: 'Usa un tono de experto con datos y evidencia.', casual: 'Usa un tono casual y relajado.' };
      systemPrompt += '\n' + (toneMap[behavior.tone] || '');
    }
    const lengthMap = { short: 'Respuestas cortas y directas (máx 80 palabras).', medium: 'Respuestas moderadas (máx 150 palabras).', long: 'Puedes dar respuestas detalladas cuando ayude.' };
    systemPrompt += '\n' + (lengthMap[behavior.maxResponseLength] || lengthMap.medium);

    if (behavior.customRules) systemPrompt += '\n\nREGLAS:\n' + behavior.customRules;
    if (behavior.dataCollection?.enabled) {
      const fields = behavior.dataCollection.fields || ['name', 'email'];
      const fieldNames = { name: 'nombre', email: 'correo', phone: 'teléfono', goal: 'objetivo' };
      systemPrompt += `\n\nDATOS: Tras ${behavior.dataCollection.askAfterMessages || 2} intercambios pide de forma natural: ${fields.map(f => fieldNames[f] || f).join(', ')}.`;
    }

    // ── Inject product stacks so AI knows what to recommend ──
    const stacks = store.getProductStacks().filter(s => s.active !== false);
    if (stacks.length && behavior.showProducts !== false) {
      systemPrompt += '\n\nPRODUCTOS DISPONIBLES (recomiéndalos cuando sea relevante, al menos 3 por stack):';
      stacks.forEach(s => {
        systemPrompt += `\n\n[COLECCIÓN: ${s.name} | Segmento: ${s.segment}]`;
        (s.products || []).forEach(p => {
          systemPrompt += `\n- ${p.name}${p.price ? ` (S/ ${p.price})` : ''}${p.description ? ': ' + p.description : ''}`;
        });
      });
      systemPrompt += '\n\nCuando recomiendes productos, SIEMPRE explica brevemente por qué cada uno es ideal para el perfil/objetivo del usuario. Sé conversacional y específico.';
    }

    const result = await llm.chat({ provider, apiKey, model: llmConfig.model || undefined, messages, systemPrompt, context,
      opts: { temperature: llmConfig.temperature, maxTokens: llmConfig.maxTokens }
    });

    // ── Enrich response with product data for cart ──
    let responseText = result.response;
    let products = null;

    // Parse explicit product JSON block if AI included one
    const jsonBlock = responseText.match(/<!--PRODUCTS:([\s\S]*?)-->/);
    if (jsonBlock) { try { products = JSON.parse(jsonBlock[1]); responseText = responseText.replace(jsonBlock[0], '').trim(); } catch {} }

    // If no JSON block, detect product mentions and auto-match from stacks
    if (!products && behavior.showProducts !== false && stacks.length) {
      const allProducts = stacks.flatMap(s => (s.products || []).map(p => ({ ...p, stackName: s.name, segment: s.segment })));
      const mentioned = allProducts.filter(p => {
        const pName = (p.name || '').toLowerCase();
        const resp = responseText.toLowerCase();
        return pName.length > 3 && resp.includes(pName);
      });
      if (mentioned.length >= 1) {
        products = mentioned.slice(0, 6).map(p => ({
          name: p.name,
          price: p.price || '',
          image: p.image || '',
          url: p.url || '',
          variantId: p.shopifyId || p.variantId || '',
          description: p.description || '',
          stackName: p.stackName
        }));
      }
    }

    store.addEvent({ type: 'chat_message', sessionId, data: { userMsg: lastMsg.substring(0, 100) } });
    if (sessionId) store.saveConversation(sessionId, [...messages, { role: 'assistant', content: result.response }]);
    res.json({ response: responseText, products, model: result.model, provider: result.provider });
  } catch (e) { console.error('Chat error:', e.message); res.status(500).json({ error: e.message }); }
});


// ═══ WIDGET CONFIG ═══
app.get('/api/widget/config', (req, res) => {
  const config = store.getConfig();
  res.json({
    widget: config.widget,
    behavior: { dataCollection: config.behavior.dataCollection, showProducts: config.behavior.showProducts, maxResponseLength: config.behavior.maxResponseLength },
    chatEndpoint: (process.env.BACKEND_URL || '') + '/api/chat',
    trackEndpoint: (process.env.BACKEND_URL || '') + '/api/track/event'
  });
});

// ═══ KNOWLEDGE BASE ═══
app.get('/api/knowledge/stats', (req, res) => res.json(kb.getStats()));
app.get('/api/knowledge/sources', (req, res) => res.json({ sources: kb.getSources() }));

app.post('/api/knowledge/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const text = kb.parseFile(req.file.originalname, req.file.buffer);
    const source = kb.addSource(req.file.originalname, text, 'file', req.body.category || 'general');
    res.json({ success: true, source });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/knowledge/text', (req, res) => {
  try {
    const { name, content, category } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    res.json({ success: true, source: kb.addSource(name || 'Texto manual', content, 'text', category || 'general') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/knowledge/crawl', async (req, res) => {
  try {
    const token = getToken();
    if (!token) return res.status(400).json({ error: 'Shopify no conectado. Completa OAuth primero.' });
    kb.clearShopifySources();
    const data = await crawler.crawlStore(SHOP, token, API_VERSION);
    const results = [];
    if (data.products) results.push(kb.addSource('Shopify - Productos', data.products, 'shopify', 'products'));
    if (data.collections) results.push(kb.addSource('Shopify - Colecciones', data.collections, 'shopify', 'collections'));
    if (data.pages) results.push(kb.addSource('Shopify - Paginas', data.pages, 'shopify', 'pages'));
    if (data.metaobjects) results.push(kb.addSource('Shopify - Metaobjects', data.metaobjects, 'shopify', 'metaobjects'));
    if (data.shipping) results.push(kb.addSource('Shopify - Envios', data.shipping, 'shopify', 'shipping'));
    if (data.policies) results.push(kb.addSource('Shopify - Politicas', data.policies, 'shopify', 'policies'));
    res.json({ success: true, sources: results, stats: kb.getStats() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/knowledge/url', async (req, res) => {
  try {
    const { url, name } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const source = await kb.importFromUrl(url, name);
    res.json({ success: true, source });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Google Drive / Docs / Sheets import
app.post('/api/knowledge/google', async (req, res) => {
  try {
    const { url, name } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });
    const source = await kb.importFromUrl(url, name);
    res.json({ success: true, source, stats: kb.getStats() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/knowledge/source/:id', (req, res) => { kb.removeSource(req.params.id); res.json({ success: true, stats: kb.getStats() }); });

// ═══ LOGO / AVATAR UPLOAD ═══
app.post('/api/upload/logo', imgUpload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo no permitido. Usa JPG, PNG, GIF, WebP, SVG' });
  const url = (process.env.BACKEND_URL || `http://localhost:${PORT}`) + '/uploads/' + req.file.filename;
  // Auto-update widget avatar in config
  store.updateConfig('widget', { avatar: url });
  res.json({ success: true, url, filename: req.file.filename });
});
// List uploaded logos
app.get('/api/upload/list', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));
    const base = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    res.json({ files: files.map(f => ({ filename: f, url: `${base}/uploads/${f}` })) });
  } catch { res.json({ files: [] }); }
});
// Delete a logo file
app.delete('/api/upload/logo/:filename', (req, res) => {
  try {
    const fp = path.join(UPLOADS_DIR, path.basename(req.params.filename));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ PRODUCT STACKS ═══
// Product stacks = manually curated recommendation packs per segment/goal
// e.g. "Bajar de Peso" → [Whey Isolate, L-Carnitine, CLA]
app.get('/api/product-stacks', (req, res) => res.json({ stacks: store.getProductStacks() }));
app.post('/api/product-stacks', (req, res) => {
  const { name, segment, description, products, active } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const stack = store.addProductStack({ name, segment: segment || 'general', description: description || '', products: products || [], active: active !== false });
  res.json({ success: true, stack });
});
app.put('/api/product-stacks/:id', (req, res) => {
  const stack = store.updateProductStack(req.params.id, req.body);
  if (!stack) return res.status(404).json({ error: 'Stack no encontrado' });
  res.json({ success: true, stack });
});
app.delete('/api/product-stacks/:id', (req, res) => {
  store.deleteProductStack(req.params.id);
  res.json({ success: true });
});
// Add product to stack
app.post('/api/product-stacks/:id/products', (req, res) => {
  const { name, image, price, url, shopifyId } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre del producto requerido' });
  const stack = store.addProductToStack(req.params.id, { name, image: image || '', price: price || '', url: url || '', shopifyId: shopifyId || '' });
  if (!stack) return res.status(404).json({ error: 'Stack no encontrado' });
  res.json({ success: true, stack });
});
app.delete('/api/product-stacks/:stackId/products/:productIndex', (req, res) => {
  const stack = store.removeProductFromStack(req.params.stackId, parseInt(req.params.productIndex));
  res.json({ success: true, stack });
});


// ═══ CONFIG ═══
app.get('/api/config', (req, res) => {
  const config = store.getFullConfig();
  const safe = JSON.parse(JSON.stringify(config));
  if (safe.llm?.apiKey) safe.llm.apiKey = safe.llm.apiKey.substring(0, 8) + '...' + safe.llm.apiKey.slice(-4);
  if (safe.shopify?.accessToken) safe.shopify.accessToken = '***';
  res.json(safe);
});
app.put('/api/config/:section', (req, res) => {
  try { res.json({ success: true, config: store.updateConfig(req.params.section, req.body) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/config/email', (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, fromEmail } = req.body;
  store.updateConfig('email', { smtpHost, smtpPort: smtpPort || 587, smtpUser, smtpPass, fromName: fromName || 'Asesor Digital', fromEmail: fromEmail || smtpUser });
  if (smtpHost) process.env.SMTP_HOST = smtpHost;
  if (smtpUser) process.env.SMTP_USER = smtpUser;
  if (smtpPass) process.env.SMTP_PASS = smtpPass;
  res.json({ success: true });
});

// ═══ LLM ═══
app.get('/api/llm/providers', (req, res) => res.json({ providers: llm.getProviders() }));
app.post('/api/llm/test', async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body;
    const result = await llm.testConnection(provider, apiKey, model);
    res.json({ success: true, response: result.response, model: result.model });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ SCRIPT TAG (auto-inject widget) ═══
app.post('/api/shopify/inject-widget', async (req, res) => {
  try {
    const token = getToken();
    if (!token) return res.status(400).json({ error: 'Shopify no conectado' });
    const widgetUrl = `${process.env.BACKEND_URL}/widget.js`;
    const result = await crawler.injectScriptTag(SHOP, token, widgetUrl, API_VERSION);
    res.json({ success: true, scriptTag: result.script_tag });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/shopify/inject-widget', async (req, res) => {
  try {
    const token = getToken();
    await crawler.removeScriptTag(SHOP, token, API_VERSION);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ SHOPIFY DIRECT CONNECT (no OAuth required) ═══
app.post('/api/shopify/connect', async (req, res) => {
  try {
    const { shop, accessToken } = req.body;
    if (!shop || !accessToken) return res.status(400).json({ error: 'shop y accessToken son requeridos' });
    const cleanShop = shop.replace(/https?:\/\//, '').replace(/\/.*$/, '').trim();
    // Test the connection first
    const https = require('https');
    const testUrl = `https://${cleanShop}/admin/api/${API_VERSION}/products/count.json`;
    const count = await new Promise((resolve, reject) => {
      const r = https.get(testUrl, { headers: { 'X-Shopify-Access-Token': accessToken } }, r2 => {
        let d = ''; r2.on('data', c => d += c); r2.on('end', () => {
          if (r2.statusCode === 200) { try { resolve(JSON.parse(d).count || 0); } catch { resolve(0); } }
          else reject(new Error(`HTTP ${r2.statusCode} — verifica el token y dominio`));
        });
      }); r.on('error', reject); r.setTimeout(8000, () => { r.destroy(); reject(new Error('Timeout al conectar')); });
    });
    // Save to env-like config + store
    store.updateConfig('shopify', { shop: cleanShop, accessToken, connected: true });
    process.env.SHOPIFY_SHOP = cleanShop;
    process.env.SHOPIFY_ACCESS_TOKEN = accessToken;
    res.json({ success: true, shop: cleanShop, productsCount: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/shopify/connect/test', async (req, res) => {
  try {
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.json({ success: false, error: 'No hay token guardado' });
    const https = require('https');
    const count = await new Promise((resolve, reject) => {
      const r = https.get(`https://${shop}/admin/api/${API_VERSION}/products/count.json`, { headers: { 'X-Shopify-Access-Token': token } }, r2 => {
        let d = ''; r2.on('data', c => d += c); r2.on('end', () => { try { resolve(JSON.parse(d).count || 0); } catch { resolve(0); } });
      }); r.on('error', reject); r.setTimeout(8000, () => { r.destroy(); reject(new Error('Timeout')); });
    });
    res.json({ success: true, shop, productsCount: count });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ═══ DISCOUNT CODES ═══
app.post('/api/shopify/discount', async (req, res) => {
  try {
    const token = getToken();
    if (!token) return res.status(400).json({ error: 'Shopify no conectado' });
    const result = await crawler.createDiscountCode(SHOP, token, req.body, API_VERSION);
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ CUSTOMER INTELLIGENCE ═══
app.get('/api/shopify/customer/search', async (req, res) => {
  try {
    const token = getToken();
    if (!token) return res.status(400).json({ error: 'Shopify no conectado' });
    const customers = await crawler.lookupCustomer(SHOP, token, req.query.q, API_VERSION);
    res.json({ customers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/shopify/customer/:id/orders', async (req, res) => {
  try {
    const token = getToken();
    if (!token) return res.status(400).json({ error: 'Shopify no conectado' });
    const orders = await crawler.lookupOrders(SHOP, token, req.params.id, API_VERSION);
    res.json({ orders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ DRAFT ORDERS ═══
app.post('/api/shopify/draft-order', async (req, res) => {
  try {
    const token = getToken();
    if (!token) return res.status(400).json({ error: 'Shopify no conectado' });
    const order = await crawler.createDraftOrder(SHOP, token, req.body.items, req.body.customer, req.body.note, API_VERSION);
    res.json({ success: true, draftOrder: order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ TRACKING ═══
app.post('/api/track/event', (req, res) => { store.addEvent(req.body); res.json({ ok: true }); });
app.post('/api/track/lead', (req, res) => { const lead = store.addLead(req.body); res.json({ ok: true, leadId: lead.id }); });
app.post('/api/track/purchase', (req, res) => { store.addPurchase(req.body); res.json({ ok: true }); });

// ═══ ANALYTICS ═══
app.get('/api/analytics/summary', (req, res) => res.json(store.getSummary(req.query.period || '30d')));
app.get('/api/analytics/leads', (req, res) => res.json({ leads: store.getLeads(req.query) }));
app.get('/api/analytics/purchases', (req, res) => {
  const p = store.getPurchases();
  res.json({ purchases: p, total: p.length, totalRevenue: p.reduce((s, x) => s + (x.total || x.data?.total || 0), 0) });
});

// ═══ SEGMENTS ═══
app.get('/api/segments', (req, res) => res.json({ segments: store.getSegmentCounts(), rules: store.SEGMENT_RULES.map(r => ({ tag: r.tag, label: r.tag.replace('_', ' ') })) }));
app.get('/api/segments/:tag/leads', (req, res) => res.json({ leads: store.getLeadsBySegment(req.params.tag), tag: req.params.tag }));

// ═══ LEADS ═══
app.get('/api/leads/export/csv', (req, res) => {
  const leads = store.getLeads();
  const csv = 'Nombre,Email,Telefono,Objetivo,Estado,Compras,Fecha\n' +
    leads.map(l => `"${l.name||''}","${l.email||''}","${l.phone||''}","${l.goal||''}","${l.status||''}","${l.purchaseTotal||0}","${l.createdAt||''}"`).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
  res.send(csv);
});

// ═══ REMARKETING ═══
app.get('/api/remarketing/templates', (req, res) => res.json({ templates: email.getTemplates() }));
app.post('/api/remarketing/send', async (req, res) => {
  try {
    const { leadIds, templateId, subject, htmlBody, customData } = req.body;
    const config = store.getConfig().email;
    const leads = store.getLeads().filter(l => leadIds.includes(l.id) && l.email);
    let sent = 0;
    for (const lead of leads) {
      try {
        if (templateId) await email.sendRemarketing(config, lead.email, templateId, { ...customData, name: lead.name, goal: lead.goal, storeName: store.getConfig().widget.name });
        else await email.sendCustomEmail(config, lead.email, subject, htmlBody);
        store.updateLead(lead.id, { status: 'remarketed' });
        sent++;
      } catch (e) { console.error('Email error:', e.message); }
    }
    res.json({ success: true, sent, total: leads.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ROUTINES ═══
app.post('/api/routines/send', async (req, res) => {
  try {
    const config = store.getConfig().email;
    const { to, leadId, ...routineData } = req.body;
    const recipient = to || (leadId ? store.getLeads().find(l => l.id === leadId)?.email : null);
    if (!recipient) return res.status(400).json({ error: 'Email requerido' });
    await email.sendRoutine(config, recipient, routineData);
    if (leadId) store.updateLead(leadId, { status: 'routine_sent' });
    res.json({ success: true, sentTo: recipient });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ SETTINGS ═══
app.get('/api/settings', (req, res) => {
  const config = store.getConfig();
  res.json({
    shopify_connected: !!getToken(),
    smtp_configured: !!(config.email?.smtpUser || process.env.SMTP_USER),
    llm_configured: !!config.llm?.apiKey || !!process.env.GEMINI_API_KEY || !!process.env.OPENAI_API_KEY || !!process.env.CLAUDE_API_KEY,
    llm_provider: config.llm?.provider || 'none',
    backend_url: process.env.BACKEND_URL || `http://localhost:${PORT}`,
    shop: SHOP,
    kb_stats: kb.getStats(),
    scopes: SCOPES.split(',').length
  });
});

app.get('/health', (req, res) => res.json({
  status: 'ok', app: 'asesor-digital', version: '2.0.0',
  uptime: process.uptime(), shopify: !!getToken(), llm: store.getConfig().llm?.provider || 'none', kb: kb.getStats()
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/widget.js', (req, res) => { res.setHeader('Content-Type', 'application/javascript'); res.sendFile(path.join(__dirname, 'public', 'widget.js')); });

app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║   Asesor Digital v2.0 — AI Advisor Platform    ║`);
  console.log(`║   Port: ${PORT} | Shop: ${(SHOP || 'not set').substring(0, 25).padEnd(25)}║`);
  console.log(`║   LLM: ${(store.getConfig().llm?.provider || 'none').padEnd(10)} | KB: ${String(kb.getStats().chunks).padEnd(4)} chunks    ║`);
  console.log(`║   Scopes: ${SCOPES.split(',').length} Shopify permissions           ║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);
});
