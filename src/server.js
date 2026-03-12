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
// Allow Shopify Admin to embed the app AND allow standalone access
app.use((req, res, next) => {
  // Allow framing from Shopify admin and any myshopify.com store
  res.setHeader('Content-Security-Policy', "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com 'self';");
  res.removeHeader('X-Frame-Options'); // helmet sometimes sets this, remove it
  next();
});


app.set('trust proxy', 1); // Required for Railway / Heroku behind a proxy
const apiLimiter = rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
app.use('/api/', apiLimiter);
app.use('/api/chat', chatLimiter);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── BOOT: Sync env vars → store so Railway deployments stay connected ──
(function syncEnvToStore() {
  const cfg = store.getConfig();
  const envToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const envShop  = process.env.SHOPIFY_SHOP;
  const envGemini = process.env.GEMINI_API_KEY;
  if (envToken && envShop && !cfg.shopify?.connected) {
    store.updateConfig('shopify', { shop: envShop, accessToken: envToken, connected: true });
    console.log(`[BOOT] Shopify loaded from env vars → ${envShop}`);
  }
  if (envGemini && !cfg.llm?.apiKey) {
    store.updateConfig('llm', { ...cfg.llm, apiKey: envGemini });
    console.log('[BOOT] Gemini API key loaded from env vars');
  }
  const final = store.getConfig();
  console.log(`[BOOT] Shopify connected: ${final.shopify?.connected || false} | LLM: ${final.llm?.provider || 'gemini'} | API key: ${!!final.llm?.apiKey}`);
})();

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
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET, code })
    }).then(r => r.json());
    if (tokenRes.access_token) {
      const token = tokenRes.access_token;
      process.env.SHOPIFY_ACCESS_TOKEN = token;
      store.updateConfig('shopify', { connected: true, shop, accessToken: token, scopes: SCOPES });
      // Log clearly so it appears in Railway deployment logs
      console.log(`\n========================================`);
      console.log(`[OAuth SUCCESS] Shop: ${shop}`);
      console.log(`[OAuth] SHOPIFY_ACCESS_TOKEN=${token}`);
      console.log(`[OAuth] Add this to Railway environment variables!`);
      console.log(`========================================\n`);
      // Auto-inject widget via Script Tags
      const widgetUrl = `${process.env.BACKEND_URL}/widget.js`;
      try { await crawler.injectScriptTag(shop, token, widgetUrl, API_VERSION); console.log('[OAuth] Widget auto-injected'); }
      catch (e) { console.error('[OAuth] Script tag error:', e.message); }
      res.redirect(`/admin.html?shopify=connected&token=${encodeURIComponent(token.substring(0,8))}`);
    } else {
      res.status(400).send(`<h2>Error OAuth</h2><pre>${JSON.stringify(tokenRes)}</pre><a href="/admin.html">Volver al panel</a>`);
    }
  } catch (e) { res.status(500).send(`<h2>Error</h2><p>${e.message}</p><a href="/admin.html">Volver</a>`); }
});

// ═══ CHAT API — Enhanced with Shopify context ═══
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, sessionId, customerEmail } = req.body;
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
    if (!apiKey) return res.status(500).json({ error: 'LLM API key no configurada. Ve a LLM / IA → ingresa tu API Key.' });

    const lastMsg = messages[messages.length - 1]?.content || '';
    const context = kb.search(lastMsg, 8);

    // ── Fetch customer history from Shopify if email provided ──
    let customerContext = '';
    const shopToken = getToken();
    const shopDomain = process.env.SHOPIFY_SHOP || store.getConfig().shopify?.shop;
    if (shopToken && shopDomain && customerEmail) {
      try {
        const custR = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/customers/search.json?query=email:${encodeURIComponent(customerEmail)}&fields=id,first_name,orders_count,total_spent`, {
          headers: { 'X-Shopify-Access-Token': shopToken }
        });
        if (custR.ok) {
          const { customers } = await custR.json();
          if (customers?.length) {
            const c = customers[0];
            const ordersR = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/customers/${c.id}/orders.json?status=any&limit=5&fields=id,line_items,total_price,created_at`, {
              headers: { 'X-Shopify-Access-Token': shopToken }
            });
            if (ordersR.ok) {
              const { orders } = await ordersR.json();
              const bought = orders.flatMap(o => o.line_items.map(i => i.title)).join(', ');
              customerContext = `\n\nCLIENTE IDENTIFICADO: ${c.first_name || customerEmail} | ${c.orders_count} órdenes | Total gastado: $${c.total_spent}\nYA COMPRÓ: ${bought || 'nada aún'}\nIMPORTANTE: No recomiendes productos que ya compró. Complementa su stack actual.`;
            }
          }
        }
      } catch (e) { /* no block chat if Shopify fails */ }
    }

    // ── Build system prompt ──
    let systemPrompt = behavior.systemPrompt || 'Eres un asesor experto y conversacional de nutrición y suplementación. Recomienda productos de forma personalizada según los objetivos del cliente.';
    const toneMap = { professional: 'Usa un tono profesional y confiable.', friendly: 'Usa un tono amigable y cercano.', expert: 'Usa un tono de experto con datos y evidencia.', casual: 'Usa un tono casual y relajado.' };
    if (behavior.tone) systemPrompt += '\n' + (toneMap[behavior.tone] || '');
    const lengthMap = { short: 'Respuestas cortas y directas (máx 80 palabras).', medium: 'Respuestas moderadas (máx 150 palabras).', long: 'Puedes dar respuestas detalladas cuando ayude.' };
    systemPrompt += '\n' + (lengthMap[behavior.maxResponseLength] || lengthMap.medium);
    if (behavior.customRules) systemPrompt += '\n\nREGLAS:\n' + behavior.customRules;
    if (behavior.dataCollection?.enabled) {
      const fields = behavior.dataCollection.fields || ['name', 'email'];
      const fieldNames = { name: 'nombre', email: 'correo electrónico', phone: 'teléfono', goal: 'objetivo fitness' };
      systemPrompt += `\n\nCAPTURA DE DATOS: De manera natural, tras ${behavior.dataCollection.askAfterMessages || 2} mensajes, pregunta: ${fields.map(f => fieldNames[f] || f).join(', ')}.`;
    }
    if (customerContext) systemPrompt += customerContext;

    // ── Inject product stacks ──
    const stacks = store.getProductStacks().filter(s => s.active !== false);
    if (stacks.length && behavior.showProducts !== false) {
      systemPrompt += '\n\nPRODUCTOS DISPONIBLES — recomienda mínimo 3 productos por respuesta cuando sea relevante:';
      stacks.forEach(s => {
        systemPrompt += `\n\n[COLECCIÓN: ${s.name} | Objetivo: ${s.segment}]`;
        (s.products || []).forEach(p => {
          systemPrompt += `\n- ${p.name}${p.price ? ` ($${p.price})` : ''}${p.variantId ? ` [ID:${p.variantId}]` : ''}${p.shopifyId ? ` [ProdID:${p.shopifyId}]` : ''}`;
        });
      });
      systemPrompt += '\n\nEXPLICA brevemente por qué cada producto es ideal para el objetivo del cliente. Sé específico.';
      systemPrompt += '\n\nCUANDO EL CLIENTE ESTÉ LISTO PARA COMPRAR: Puedes incluir al final [DRAFT_ORDER:variantId1,variantId2,variantId3] para generar un link de pago directo.';
      systemPrompt += '\n\nSI EL CLIENTE DUDA O PIDE DESCUENTO: Incluye [DISCOUNT:10] para generar un cupón del 10%.';
    }

    const result = await llm.chat({ provider, apiKey, model: llmConfig.model || undefined, messages, systemPrompt, context,
      opts: { temperature: llmConfig.temperature, maxTokens: llmConfig.maxTokens }
    });

    let responseText = result.response;
    let products = null;
    let cartLink = null;
    let discountCode = null;

    // ── Handle [DRAFT_ORDER:variantIds] command ──
    const draftMatch = responseText.match(/\[DRAFT_ORDER:([\d,]+)\]/);
    if (draftMatch && shopToken && shopDomain) {
      try {
        const variantIds = draftMatch[1].split(',').filter(Boolean);
        const lineItems = variantIds.map(id => ({ variant_id: parseInt(id), quantity: 1 }));
        const draftR = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/draft_orders.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': shopToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft_order: { line_items: lineItems, note: 'Generado por Asesor Digital AI' } })
        });
        if (draftR.ok) {
          const { draft_order } = await draftR.json();
          cartLink = draft_order.invoice_url;
          responseText = responseText.replace(draftMatch[0], '').trim();
          responseText += `\n\n✅ **Link de pago listo**: ${cartLink}`;
        }
      } catch (e) { responseText = responseText.replace(draftMatch[0], '').trim(); }
    }

    // ── Handle [DISCOUNT:percent] command ──
    const discountMatch = responseText.match(/\[DISCOUNT:(\d+)\]/);
    if (discountMatch && shopToken && shopDomain) {
      try {
        const pct = parseInt(discountMatch[1]) || 10;
        const code = 'ASESOR' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const priceRuleR = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/price_rules.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': shopToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ price_rule: {
            title: `AI Asesor - ${pct}%`, target_type: 'line_item', target_selection: 'all',
            allocation_method: 'across', value_type: 'percentage', value: `-${pct}`,
            customer_selection: 'all', starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), usage_limit: 1
          }})
        });
        if (priceRuleR.ok) {
          const { price_rule } = await priceRuleR.json();
          await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/price_rules/${price_rule.id}/discount_codes.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': shopToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ discount_code: { code } })
          });
          discountCode = code;
          responseText = responseText.replace(discountMatch[0], '').trim();
          responseText += `\n\n🎁 **Cupón exclusivo**: \`${code}\` — ${pct}% de descuento (válido 24h)`;
        }
      } catch (e) { responseText = responseText.replace(discountMatch[0], '').trim(); }
    }

    // ── Product card matching ──
    const jsonBlock = responseText.match(/<!--PRODUCTS:([\s\S]*?)-->/);
    if (jsonBlock) { try { products = JSON.parse(jsonBlock[1]); responseText = responseText.replace(jsonBlock[0], '').trim(); } catch {} }
    if (!products && behavior.showProducts !== false && stacks.length) {
      const allProducts = stacks.flatMap(s => (s.products || []).map(p => ({ ...p, stackName: s.name, segment: s.segment })));
      const mentioned = allProducts.filter(p => {
        const pName = (p.name || '').toLowerCase();
        const resp = responseText.toLowerCase();
        return pName.length > 3 && resp.includes(pName);
      });
      if (mentioned.length >= 1) {
        products = mentioned.slice(0, 6).map(p => ({
          name: p.name, price: p.price || '', image: p.image || '', url: p.url || '',
          variantId: p.variantId || p.shopifyId || '', description: p.description || '', stackName: p.stackName
        }));
      }
    }

    store.addEvent({ type: 'chat_message', sessionId, data: { userMsg: lastMsg.substring(0, 100) } });
    if (sessionId) store.saveConversation(sessionId, [...messages, { role: 'assistant', content: result.response }]);
    res.json({ response: responseText, products, cartLink, discountCode, model: result.model, provider: result.provider });
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

// ═══ BRAND / IDENTITY ═══
app.put('/api/config/brand', (req, res) => {
  const { storeName, logo, tagline, primaryLanguage, currency, timezone, whitelabelName, whitelabelLogo } = req.body;
  store.updateConfig('brand', { storeName, logo, tagline, primaryLanguage: primaryLanguage || 'es', currency: currency || 'PEN', timezone: timezone || 'America/Lima', whitelabelName, whitelabelLogo });
  // Update widget name if store name changed
  if (storeName && !req.body.keepWidgetName) store.updateConfig('widget', { name: storeName });
  res.json({ success: true });
});

// ═══ ADMIN AUTH ═══
app.get('/api/admin/status', (req, res) => {
  res.json({ setupCompleted: store.isAdminSetup(), hasPassword: store.isAdminSetup() });
});
app.post('/api/admin/setup', (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
  if (store.isAdminSetup()) return res.status(400).json({ error: 'Ya configurado. Usa /api/admin/change-password' });
  store.setAdminPassword(password);
  res.json({ success: true, message: 'Contraseña configurada correctamente' });
});
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!store.isAdminSetup()) return res.json({ success: true, token: 'no-auth' }); // Open if no password set
  if (!store.checkAdminPassword(password)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  // Simple token: hash of password + date (expires daily)
  const crypto = require('crypto');
  const token = crypto.createHash('sha256').update(password + new Date().toDateString() + 'session').digest('hex');
  res.json({ success: true, token });
});
app.post('/api/admin/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (store.isAdminSetup() && !store.checkAdminPassword(currentPassword)) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Nueva contraseña mínimo 6 caracteres' });
  store.setAdminPassword(newPassword);
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

// ═══ SHOPIFY DIRECT CONNECT (no OAuth — Custom App token) ═══
app.post('/api/shopify/connect', async (req, res) => {
  try {
    const { shop, accessToken } = req.body;
    if (!shop || !accessToken) return res.status(400).json({ error: 'shop y accessToken son requeridos' });
    // Clean: strip https://, trailing slashes, spaces
    const cleanShop = shop.replace(/https?:\/\//i, '').replace(/[/\s]+$/, '').toLowerCase().trim();
    // Use native fetch (Node 18+) — no https.get issues
    const resp = await fetch(`https://${cleanShop}/admin/api/${API_VERSION}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' }
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(400).json({ error: `HTTP ${resp.status} — Token incorrecto o sin permisos. ${resp.status === 401 ? 'Verifica que el token empieza con shpat_' : ''}` });
    }
    const shopData = (await resp.json()).shop;
    const resolvedShop = shopData.myshopify_domain || cleanShop;
    store.updateConfig('shopify', { shop: resolvedShop, accessToken, connected: true, storeName: shopData.name });
    process.env.SHOPIFY_SHOP = resolvedShop;
    process.env.SHOPIFY_ACCESS_TOKEN = accessToken;
    res.json({ success: true, shop: resolvedShop, storeName: shopData.name, productsCount: shopData.product_count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/shopify/connect/test', async (req, res) => {
  try {
    const token = getToken();
    const shop = process.env.SHOPIFY_SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.json({ success: false, error: 'No hay token guardado' });
    const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/products/count.json`, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    if (!r.ok) return res.json({ success: false, error: `HTTP ${r.status}` });
    const data = await r.json();
    res.json({ success: true, shop, productsCount: data.count || 0 });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ═══ SHOPIFY CATALOG BROWSER (Products + Collections + Files) ═══
app.get('/api/shopify/products', async (req, res) => {
  try {
    const token = getToken();
    const shop = process.env.SHOPIFY_SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.status(400).json({ error: 'Shopify no conectado' });
    const { search, limit = 50, page_info } = req.query;
    let url = `https://${shop}/admin/api/${API_VERSION}/products.json?limit=${limit}&fields=id,title,variants,images,product_type,vendor,status`;
    if (search) url += `&title=${encodeURIComponent(search)}`;
    if (page_info) url += `&page_info=${page_info}`;
    const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!r.ok) return res.status(r.status).json({ error: `Shopify API error ${r.status}` });
    const data = await r.json();
    // Extract pagination link header
    const link = r.headers.get('link') || '';
    const nextMatch = link.match(/<([^>]+)>; rel="next"/);
    const nextPageInfo = nextMatch ? new URL(nextMatch[1]).searchParams.get('page_info') : null;
    res.json({ products: data.products, nextPageInfo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/shopify/collections', async (req, res) => {
  try {
    const token = getToken();
    const shop = process.env.SHOPIFY_SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.status(400).json({ error: 'Shopify no conectado' });
    const limit = req.query.limit || 50;
    const [customR, smartR] = await Promise.all([
      fetch(`https://${shop}/admin/api/${API_VERSION}/custom_collections.json?limit=${limit}&fields=id,title,image,products_count`, { headers: { 'X-Shopify-Access-Token': token } }),
      fetch(`https://${shop}/admin/api/${API_VERSION}/smart_collections.json?limit=${limit}&fields=id,title,image,products_count`, { headers: { 'X-Shopify-Access-Token': token } })
    ]);
    const custom = customR.ok ? (await customR.json()).custom_collections : [];
    const smart  = smartR.ok  ? (await smartR.json()).smart_collections  : [];
    res.json({ collections: [...custom, ...smart] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/shopify/files', async (req, res) => {
  try {
    const token = getToken();
    const shop = process.env.SHOPIFY_SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.status(400).json({ error: 'Shopify no conectado' });
    // Use GraphQL Admin API for Files (REST doesn't have Files endpoint)
    const query = `{ files(first: 50, sortKey: CREATED_AT, reverse: true) { edges { node { ... on MediaImage { id alt image { url width height } } } } } }`;
    const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!r.ok) return res.status(r.status).json({ error: `GraphQL error ${r.status}` });
    const data = await r.json();
    const files = (data.data?.files?.edges || []).filter(e => e.node?.image?.url).map(e => ({ id: e.node.id, url: e.node.image.url, alt: e.node.alt || '' }));
    res.json({ files });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
