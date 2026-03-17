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
const shopifyStorage = require('./services/shopify-storage');

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

// ── BOOT: Sync env vars → store AND load config from Shopify Metafields ──
(async function syncEnvToStore() {
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
  // ── Load persisted config from Shopify Metafields (survives redeploys) ──
  const shopToken = envToken || store.getConfig().shopify?.accessToken;
  const shopDomain = envShop || store.getConfig().shopify?.shop;
  if (shopToken && shopDomain) {
    try {
      const metaConfig = await shopifyStorage.loadConfig(shopDomain, shopToken);
      if (metaConfig) {
        // Merge metafield config into local store (metafields take priority)
        if (metaConfig.llm?.apiKey && !envGemini) {
          store.updateConfig('llm', { ...cfg.llm, ...metaConfig.llm });
          console.log('[BOOT] LLM config restored from Shopify Metafields');
        }
        if (metaConfig.widget)   store.updateConfig('widget',   metaConfig.widget);
        if (metaConfig.behavior) store.updateConfig('behavior', metaConfig.behavior);
        if (metaConfig.brand)    store.updateConfig('brand',    metaConfig.brand);
        if (metaConfig.email)    store.updateConfig('email',    metaConfig.email);
        console.log('[BOOT] Config restored from Shopify Metafields ✓');
      }
      // ── Restore product stacks ──
      const savedStacks = await shopifyStorage.loadProductStacks(shopDomain, shopToken);
      if (savedStacks && savedStacks.length) {
        store.setProductStacks(savedStacks);
        console.log(`[BOOT] ${savedStacks.length} product stacks restored from Shopify Metafields ✓`);
      }
    } catch (e) { console.error('[BOOT] Failed to load config from metafields:', e.message); }
  }
  const final = store.getConfig();
  console.log(`[BOOT] Shopify connected: ${final.shopify?.connected || false} | LLM: ${final.llm?.provider || 'gemini'} | API key: ${!!final.llm?.apiKey}`);
})();

// ═══ SHOPIFY OAUTH — FULL SCOPES ═══
const SCOPES = [
  'read_products','read_product_listings','read_inventory',
  'read_content','read_online_store_pages','read_online_store_navigation',
  'read_metaobjects','read_metaobject_definitions',
  'write_metaobjects','write_metaobject_definitions',
  'read_metafields','write_metafields',
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
      console.log(`\n========================================`);
      console.log(`[OAuth SUCCESS] Shop: ${shop}`);
      console.log(`[OAuth] SHOPIFY_ACCESS_TOKEN=${token}`);
      console.log(`[OAuth] Add this to Railway environment variables!`);
      console.log(`========================================\n`);
      // Auto-inject widget via shopifyStorage (reliable)
      const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
      try {
        const injectResult = await shopifyStorage.injectWidget(shop, token, backendUrl);
        console.log('[OAuth] Widget inject:', injectResult.success ? 'OK' : injectResult.error);
      } catch (e) { console.error('[OAuth] Script tag error:', e.message); }
      // Persist current config to Shopify Metafields so it survives redeploys
      try {
        const cfgToSave = store.getConfig();
        await shopifyStorage.saveConfig(shop, token, cfgToSave);
        console.log('[OAuth] Config saved to Shopify Metafields');
      } catch (e) { console.error('[OAuth] Metafield save error:', e.message); }
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
              customerContext = `\n\nCLIENTE IDENTIFICADO: ${c.first_name || customerEmail} | ${c.orders_count} órdenes | Total gastado: S/ ${c.total_spent}\nYA COMPRÓ: ${bought || 'nada aún'}\nIMPORTANTE: No recomiendes productos que ya compró. Complementa su stack actual.`;
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

    // ── REGLA: No-Competencia ──────────────────────────────────────
    systemPrompt += `\n\n═══ REGLA — NO COMPETENCIA (OBLIGATORIO) ═══
- NUNCA menciones, compares ni recomiendes marcas externas al portáfolio (GNC, Optimum Nutrition, MyProtein, MuscleTech, Herbalife, BSN, Dymatize, etc.).
- Si el cliente menciona o pregunta por una marca rival, responde amablemente: \u201cNo manejamos esa marca, pero tenemos opciones igual o más efectivas en nuestro portáfolio con excelente calidad y resultados comprobados.\u201d
- Siempre redirige hacia las líneas propias, resaltando certificaciones, calidad, pureza e ingredientes.
- NO hagas comparaciones directas tipo \u201cnosotros somos mejor que X\u201d. En cambio, habla de los beneficios propios.`;

    // ── REGLA: Stack Obligatorio por Objetivo ─────────────────────
    systemPrompt += `\n\n═══ REGLA — STACK POR OBJETIVO (OBLIGATORIO) ═══
Para CADA objetivo del cliente, tu recomendación DEBE incluir exactamente estos 3 componentes:
  1. UNA PROTEÍNA — base del stack (Whey, Caína, Vegana, Iso-whey, Mass-gainer según objetivo)
  2. UNA CREATINA — potenciador universal de rendimiento y masa muscular (Monohidratada, HCL, Micronizada)
  3. UN COMPLEMENTARIO — según objetivo específico:
     • Bajar de peso / Definicón: L-Carnitina, Termogénico, CLA
     • Ganar músculo / Volumen: BCAA, Pre-Workout, Glutamina
     • Rendimiento / Atletismo: Electrolitos, BCAAs, Pre-Workout
     • Salud general / Bienestar: Omega-3, Multivitamínico, Colagéno
     • Principiante: Multivitamínico, Omega-3 (empezar con fundamentos)
Si el catálogo no tiene los 3, recomienda los disponibles y explica qué faltaría para completar el stack ideal.
Esto es obligatorio: no recomiendes solo 1 producto. Siempre construye el stack completo.`;

    // ── Inject product catalog from Shopify ──
    const stacks = store.getProductStacks().filter(s => s.active !== false);
    let allShopProducts = [];
    // Auto-fetch real products from Shopify with images + inventory
    if (shopToken && shopDomain) {
      try {
        const prodR = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products.json?status=active&limit=250&fields=id,title,body_html,vendor,product_type,handle,images,variants,tags`, {
          headers: { 'X-Shopify-Access-Token': shopToken }
        });
        if (prodR.ok) {
          const { products: shopProducts } = await prodR.json();
          allShopProducts = (shopProducts || []).map(p => {
            const variant = p.variants?.[0] || {};
            const inStock = variant.inventory_management
              ? (variant.inventory_quantity > 0 || variant.inventory_policy === 'continue')
              : true; // no tracking = always available
            return {
              name: p.title,
              price: variant.price || '',
              compareAtPrice: variant.compare_at_price || '',
              image: p.images?.[0]?.src || '',
              variantId: String(variant.id || ''),
              shopifyId: String(p.id),
              url: `https://${shopDomain}/products/${p.handle}`,
              type: p.product_type || '',
              tags: p.tags || '',
              inStock,
              description: (p.body_html || '').replace(/<[^>]*>/g, '').substring(0, 120)
            };
          }).filter(p => p.inStock); // ✅ solo productos en stock
        }
      } catch (e) { console.error('[Chat] Product fetch error:', e.message); }
    }

    // Merge manual stacks + Shopify products
    const catalogProducts = allShopProducts.length ? allShopProducts : stacks.flatMap(s => (s.products || []).map(p => ({ ...p, stackName: s.name, segment: s.segment })));
    
    if (catalogProducts.length && behavior.showProducts !== false) {
      // ── Detect dietary restrictions from conversation ──
      const fullConv = messages.map(m => m.content || '').join(' ').toLowerCase();
      const isVegan = /(vegano|vegana|plant.based|proteina vegetal|organico|organica|sin lacteos.*vegano)/i.test(fullConv);
      const isLactoseIntol = /(intolerante.{0,10}lactosa|sin lactosa|no tolero lacteos|no puedo tomar lacteos)/i.test(fullConv);

      systemPrompt += `\n\n═══ CATÁLOGO DE PRODUCTOS (${catalogProducts.length} en stock) ═══`;
      systemPrompt += '\nCuando recomiendes productos, SIEMPRE incluye un bloque JSON al final de tu respuesta así:';
      systemPrompt += '\n<!--PRODUCTS:[{"name":"...","price":"...","compareAtPrice":"...","image":"...","variantId":"...","url":"...","description":"..."}]-->';
      systemPrompt += '\nEsto es OBLIGATORIO cada vez que menciones productos. Máximo 3 productos por respuesta.';
      systemPrompt += '\nIMPORTANTE: En "price" y "compareAtPrice" pon SOLO el número sin símbolo (ej: "149.00"). Si no hay precio anterior, deja compareAtPrice en "".';
      systemPrompt += '\nEl widget mostrará: precio tachado (compareAtPrice), precio actual (S/), badge OFERTA si aplica.';

      // ── Segment priority rules based on dietary detection ──
      if (isVegan) {
        systemPrompt += '\n\n═══ FILTRO: VEGANO/PLANT-BASED ═══';
        systemPrompt += '\nPRIORIZA productos veganos/orgánicos. NUNCA recomiendes Whey ni caseína animal.';
        systemPrompt += '\n  1. PROTEÍNA vegana (guisante, arroz, cáñamo, soja) o Orgánica.';
        systemPrompt += '\n  2. CREATINA Monohidratada (vegana por naturaleza).';
        systemPrompt += '\n  3. COMPLEMENTARIO: Omega-3 de algas, B12, hierro vegetal, multivitamínico vegano.';
        systemPrompt += '\n  Prioriza tags: vegano, vegan, plant-based, organic, orgánico.';
      } else if (isLactoseIntol) {
        systemPrompt += '\n\n═══ FILTRO: INTOLERANTE A LA LACTOSA ═══';
        systemPrompt += '\n  1. PROTEÍNA: Whey Isolate (0 lactosa), Hidrolizada, Vegana o Proteína de Carne. EVITA Whey Concentrate y Caseína.';
        systemPrompt += '\n  2. CREATINA: Monohidratada (sin lactosa). ✓';
        systemPrompt += '\n  3. COMPLEMENTARIO: Enzimas digestivas, Omega-3, BCAA.';
      } else {
        systemPrompt += '\n\n═══ PRIORIDAD DE SEGMENTO ═══';
        systemPrompt += '\n  1. PROTEÍNA: Whey Isolate o Whey Concentrada como base principal.';
        systemPrompt += '\n  2. CREATINA: Monohidratada (maxima evidencia científica).';
        systemPrompt += '\n  3. COMPLEMENTARIO según objetivo (según reglas de stack definidas arriba).';
      }

      systemPrompt += '\n\nProductos disponibles en stock:';
      catalogProducts.forEach(p => {
        const hasOffer = p.compareAtPrice && parseFloat(p.compareAtPrice) > parseFloat(p.price);
        const priceStr = hasOffer
          ? `OFERTA S/ ${p.price} (antes S/ ${p.compareAtPrice})`
          : `S/ ${p.price}`;
        systemPrompt += `\n• ${p.name} | ${priceStr} | variantId:${p.variantId} | url:${p.url} | img:${p.image ? 'si' : 'no'}${p.type ? ` | tipo:${p.type}` : ''}${p.tags ? ` | tags:${p.tags}` : ''}`;
      });
      systemPrompt += '\n\nREGLAS FINALES:';
      systemPrompt += '\n1. Máximo 3 productos por respuesta';
      systemPrompt += '\n2. SIEMPRE incluye <!--PRODUCTS:[...]-->  con name, price, compareAtPrice, image, variantId, url, description';
      systemPrompt += '\n3. Conversacional: responde primero, luego recomienda';
      systemPrompt += '\n4. Precios en Soles (S/). Muestra como "S/ 149.00"';
      systemPrompt += `\n5. Link de carrito: https://${shopDomain}/cart/VARIANT_ID:1`;
      systemPrompt += '\n6. Si el cliente duda, ofrece cupón con [DISCOUNT:10]';
    }


    const result = await llm.chat({ provider, apiKey, model: llmConfig.model || undefined, messages, systemPrompt, context,
      opts: { temperature: llmConfig.temperature, maxTokens: llmConfig.maxTokens }
    });

    let responseText = result.response;
    let products = null;
    let cartLink = null;
    let discountCode = null;

    // ── Handle cart permalink [CART_LINK:variantId1,variantId2] ──
    const cartMatch = responseText.match(/\[CART_LINK:([\d,]+)\]/);
    if (cartMatch && shopDomain) {
      const variantIds = cartMatch[1].split(',').filter(Boolean);
      cartLink = `https://${shopDomain}/cart/${variantIds.map(v => v + ':1').join(',')}`;
      responseText = responseText.replace(cartMatch[0], '').trim();
      responseText += `\n\n🛒 **Tu carrito está listo**: [Ir al checkout](${cartLink})`;
    }
    // Legacy: Handle [DRAFT_ORDER:variantIds] — convert to cart permalink
    const draftMatch = responseText.match(/\[DRAFT_ORDER:([\d,]+)\]/);
    if (draftMatch && shopDomain) {
      const variantIds = draftMatch[1].split(',').filter(Boolean);
      if (!cartLink) cartLink = `https://${shopDomain}/cart/${variantIds.map(v => v + ':1').join(',')}`;
      responseText = responseText.replace(draftMatch[0], '').trim();
      if (!responseText.includes('carrito')) responseText += `\n\n🛒 **Tu carrito está listo**: [Ir al checkout](${cartLink})`;
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
  const shopDomain = SHOP || config.shopify?.shop || '';
  res.json({
    widget: config.widget,
    behavior: { dataCollection: config.behavior?.dataCollection, showProducts: config.behavior?.showProducts, maxResponseLength: config.behavior?.maxResponseLength, goals: config.behavior?.goals },
    shopDomain,
    chatEndpoint: (process.env.BACKEND_URL || '') + '/api/chat',
    trackEndpoint: (process.env.BACKEND_URL || '') + '/api/track/event',
    productsEndpoint: (process.env.BACKEND_URL || '') + '/api/products/by-goal',
    catalogEndpoint: (process.env.BACKEND_URL || '') + '/api/catalog'
  });
});

// ═══ PRODUCTS BY GOAL ═══
app.get('/api/products/by-goal', async (req, res) => {
  try {
    const token = getToken();
    const shop = SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.status(400).json({ error: 'Shopify no conectado' });
    const goal = req.query.goal || '';
    // Fetch collections to find matching one
    const colR = await fetch(`https://${shop}/admin/api/${API_VERSION}/custom_collections.json?limit=50`, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    let products = [];
    if (colR.ok) {
      const { custom_collections } = await colR.json();
      // Find collection matching goal name
      const match = custom_collections.find(c => {
        const t = (c.title || '').toLowerCase();
        const g = goal.toLowerCase();
        return t.includes(g) || g.includes(t);
      });
      if (match) {
        const pR = await fetch(`https://${shop}/admin/api/${API_VERSION}/products.json?collection_id=${match.id}&limit=20&fields=id,title,handle,images,variants,product_type,body_html`, {
          headers: { 'X-Shopify-Access-Token': token }
        });
        if (pR.ok) {
          const { products: prods } = await pR.json();
          products = (prods || []).map(p => ({
            name: p.title, price: p.variants?.[0]?.price || '',
            image: p.images?.[0]?.src || '', variantId: String(p.variants?.[0]?.id || ''),
            url: `https://${shop}/products/${p.handle}`,
            description: (p.body_html || '').replace(/<[^>]*>/g, '').substring(0, 100)
          }));
        }
      }
    }
    // Fallback: get all products if no matching collection
    if (!products.length) {
      const allR = await fetch(`https://${shop}/admin/api/${API_VERSION}/products.json?status=active&limit=20&fields=id,title,handle,images,variants,product_type,body_html`, {
        headers: { 'X-Shopify-Access-Token': token }
      });
      if (allR.ok) {
        const { products: prods } = await allR.json();
        products = (prods || []).map(p => ({
          name: p.title, price: p.variants?.[0]?.price || '',
          image: p.images?.[0]?.src || '', variantId: String(p.variants?.[0]?.id || ''),
          url: `https://${shop}/products/${p.handle}`,
          description: (p.body_html || '').replace(/<[^>]*>/g, '').substring(0, 100)
        }));
      }
    }
    res.json({ products, goal, count: products.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ FULL CATALOG (ALL products for widget) ═══
app.get('/api/catalog', async (req, res) => {
  try {
    const token = getToken();
    const shop = SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.status(400).json({ error: 'Shopify no conectado', products: [] });

    // Fetch ALL collections (custom + smart)
    const [customR, smartR] = await Promise.all([
      fetch(`https://${shop}/admin/api/${API_VERSION}/custom_collections.json?limit=250`, { headers: { 'X-Shopify-Access-Token': token } }),
      fetch(`https://${shop}/admin/api/${API_VERSION}/smart_collections.json?limit=250`, { headers: { 'X-Shopify-Access-Token': token } })
    ]);
    const custom = customR.ok ? (await customR.json()).custom_collections || [] : [];
    const smart = smartR.ok ? (await smartR.json()).smart_collections || [] : [];
    const allCollections = [...custom, ...smart].map(c => ({ id: c.id, title: c.title, handle: c.handle }));

    // Fetch ALL products with pagination
    let allProducts = [], pageInfo = null, url = `https://${shop}/admin/api/${API_VERSION}/products.json?status=active&limit=250&fields=id,title,handle,body_html,vendor,product_type,tags,images,variants,metafields`;
    for (let page = 0; page < 5; page++) {
      const pUrl = pageInfo ? `https://${shop}/admin/api/${API_VERSION}/products.json?limit=250&page_info=${pageInfo}&fields=id,title,handle,body_html,vendor,product_type,tags,images,variants` : url;
      const pR = await fetch(pUrl, { headers: { 'X-Shopify-Access-Token': token } });
      if (!pR.ok) break;
      const { products: prods } = await pR.json();
      if (!prods?.length) break;
      allProducts = allProducts.concat(prods);
      // Check Link header for next page
      const link = pR.headers.get('Link') || '';
      const nextMatch = link.match(/page_info=([^>&]+)>;\s*rel="next"/);
      if (nextMatch) pageInfo = nextMatch[1]; else break;
    }

    // Map to catalog format
    const catalog = allProducts.map(p => ({
      id: String(p.id),
      title: p.title,
      handle: p.handle,
      url: `https://${shop}/products/${p.handle}`,
      image: p.images?.[0]?.src || '',
      images: (p.images || []).map(i => i.src),
      price: p.variants?.[0]?.price || '0',
      compareAtPrice: p.variants?.[0]?.compare_at_price || '',
      variantId: String(p.variants?.[0]?.id || '0'),
      available: p.variants?.some(v => v.available) || false,
      vendor: p.vendor || '',
      type: p.product_type || '',
      tags: (p.tags || '').split(',').map(t => t.trim()).filter(Boolean),
      description: (p.body_html || '').replace(/<[^>]*>/g, '').substring(0, 200),
      variants: (p.variants || []).map(v => ({ id: String(v.id), title: v.title, price: v.price, available: v.available }))
    }));

    res.json({ products: catalog, collections: allCollections, count: catalog.length, shop });
  } catch (e) { console.error('[Catalog]', e.message); res.status(500).json({ error: e.message, products: [] }); }
});

// ═══ SHOPIFY COLLECTIONS ═══
app.get('/api/shopify/collections', async (req, res) => {
  try {
    const token = getToken();
    const shop = SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.json({ collections: [] });
    const [customR, smartR] = await Promise.all([
      fetch(`https://${shop}/admin/api/${API_VERSION}/custom_collections.json?limit=100`, { headers: { 'X-Shopify-Access-Token': token } }),
      fetch(`https://${shop}/admin/api/${API_VERSION}/smart_collections.json?limit=100`, { headers: { 'X-Shopify-Access-Token': token } })
    ]);
    const custom = customR.ok ? (await customR.json()).custom_collections || [] : [];
    const smart = smartR.ok ? (await smartR.json()).smart_collections || [] : [];
    const collections = [...custom, ...smart].map(c => ({ id: c.id, title: c.title, handle: c.handle, productsCount: c.products_count || 0, image: c.image?.src || '' }));
    res.json({ collections });
  } catch (e) { res.json({ collections: [], error: e.message }); }
});

// ═══ SHOPIFY PRODUCT SEARCH ═══
app.get('/api/shopify/products/search', async (req, res) => {
  try {
    const token = getToken();
    const shop = SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.json({ products: [] });
    const q = req.query.q || '';
    const collectionId = req.query.collection_id || '';
    let url = `https://${shop}/admin/api/${API_VERSION}/products.json?status=active&limit=50&fields=id,title,handle,images,variants,product_type,body_html,tags`;
    if (q) url += `&title=${encodeURIComponent(q)}`;
    if (collectionId) url += `&collection_id=${collectionId}`;
    const pR = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!pR.ok) return res.json({ products: [] });
    const { products: prods } = await pR.json();
    const products = (prods || []).map(p => ({
      id: String(p.id), title: p.title, handle: p.handle,
      image: p.images?.[0]?.src || '', variantId: String(p.variants?.[0]?.id || ''),
      price: p.variants?.[0]?.price || '', type: p.product_type || '',
      tags: p.tags || '', available: p.variants?.some(v => v.available) || false
    }));
    res.json({ products });
  } catch (e) { res.json({ products: [], error: e.message }); }
});

// ═══ FAB ICON CONFIG ═══
app.put('/api/config/fab-icon', (req, res) => {
  try {
    const config = store.getConfig();
    config.widget = config.widget || {};
    config.widget.fabIcon = req.body.url || '';
    store.updateConfig(config);
    res.json({ success: true, fabIcon: config.widget.fabIcon });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


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
// Helper: persist stacks to Shopify metafields after every mutation
function syncStacksToShopify() {
  const sh = getToken();
  const domain = process.env.SHOPIFY_SHOP || store.getConfig().shopify?.shop;
  if (sh && domain) shopifyStorage.saveProductStacks(domain, sh, store.getProductStacks()).catch(e => console.error('[Stacks] Shopify sync error:', e.message));
}

app.get('/api/product-stacks', (req, res) => res.json({ stacks: store.getProductStacks() }));
app.post('/api/product-stacks', (req, res) => {
  const { name, segment, description, products, active } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const stack = store.addProductStack({ name, segment: segment || 'general', description: description || '', products: products || [], active: active !== false });
  syncStacksToShopify();
  res.json({ success: true, stack });
});
app.put('/api/product-stacks/:id', (req, res) => {
  // Toggle active OR full update
  const existing = store.getProductStacks().find(s => s.id === req.params.id);
  const updateData = req.body.active === 'toggle' && existing
    ? { ...existing, active: !existing.active }
    : req.body;
  const stack = store.updateProductStack(req.params.id, updateData);
  if (!stack) return res.status(404).json({ error: 'Stack no encontrado' });
  syncStacksToShopify();
  res.json({ success: true, stack });
});
app.delete('/api/product-stacks/:id', (req, res) => {
  store.deleteProductStack(req.params.id);
  syncStacksToShopify();
  res.json({ success: true });
});
// Add product to stack
app.post('/api/product-stacks/:id/products', (req, res) => {
  const { name, image, price, url, shopifyId } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre del producto requerido' });
  const stack = store.addProductToStack(req.params.id, { name, image: image || '', price: price || '', url: url || '', shopifyId: shopifyId || '' });
  if (!stack) return res.status(404).json({ error: 'Stack no encontrado' });
  syncStacksToShopify();
  res.json({ success: true, stack });
});
app.delete('/api/product-stacks/:stackId/products/:productIndex', (req, res) => {
  const stack = store.removeProductFromStack(req.params.stackId, parseInt(req.params.productIndex));
  syncStacksToShopify();
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
app.put('/api/config/:section', async (req, res) => {
  try {
    const cfg = store.updateConfig(req.params.section, req.body);
    // Async-persist to Shopify metafields (survives Railway redeploys)
    const sh = getToken();
    const domain = process.env.SHOPIFY_SHOP || cfg.shopify?.shop;
    if (sh && domain) shopifyStorage.saveConfig(domain, sh, cfg).catch(e => console.error('[Config] Shopify save error:', e.message));
    res.json({ success: true, config: cfg });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const shop = SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.status(400).json({ error: 'Shopify no conectado. Ve a Configuracion → Shopify para conectar.' });
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    const result = await shopifyStorage.injectWidget(shop, token, backendUrl);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/shopify/inject-widget', async (req, res) => {
  try {
    const token = getToken();
    const shop = SHOP || store.getConfig().shopify?.shop;
    if (!token || !shop) return res.status(400).json({ error: 'Shopify no conectado' });
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    const result = await shopifyStorage.removeWidget(shop, token, backendUrl);
    res.json(result);
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
app.post('/api/track/event', async (req, res) => {
  store.addEvent(req.body);
  // Also persist to Shopify metafields (async, non-blocking)
  const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
  if (token && shop) shopifyStorage.addEvent(shop, token, req.body).catch(() => {});
  res.json({ ok: true });
});
app.post('/api/track/lead', async (req, res) => {
  const lead = store.addLead(req.body);
  // Also save lead to Shopify Metaobjects for persistence
  const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
  if (token && shop) shopifyStorage.saveLead(shop, token, req.body).catch(() => {});
  res.json({ ok: true, leadId: lead.id });
});
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
    llm_provider: config.llm?.provider || 'gemini',
    backend_url: process.env.BACKEND_URL || `http://localhost:${PORT}`,
    shop: SHOP || config.shopify?.shop,
    kb_stats: kb.getStats(),
    scopes: SCOPES.split(',').length,
    storage: 'shopify_metafields'
  });
});

// ═══ CONFIG SAVE (persists to Shopify Metafields) ═══
app.put('/api/config/llm', async (req, res) => {
  try {
    const { provider, model, temperature, maxTokens, apiKey } = req.body;
    const cfg = store.getConfig().llm || {};
    const updated = { ...cfg, provider: provider || cfg.provider, model: model || cfg.model, temperature: temperature ?? cfg.temperature, maxTokens: maxTokens || cfg.maxTokens };
    if (apiKey) updated.apiKey = apiKey;
    store.updateConfig('llm', updated);
    // Persist to Shopify Metafields
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    if (token && shop) {
      try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch (e) { console.error('[Config] Metafield save error:', e.message); }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/config/brand', async (req, res) => {
  try {
    const { storeName, tagline, logo, currency, primaryLanguage, timezone } = req.body;
    store.updateConfig('brand', { name: storeName, tagline, logo, currency, primaryLanguage, timezone });
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch (e) {} }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/config/widget', async (req, res) => {
  try {
    store.updateConfig('widget', req.body);
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch (e) {} }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/config/behavior', async (req, res) => {
  try {
    store.updateConfig('behavior', req.body);
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch (e) {} }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/config/email', async (req, res) => {
  try {
    store.updateConfig('email', req.body);
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch (e) {} }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (req, res) => res.json({
  status: 'ok', app: 'asesor-digital', version: '2.0.0',
  uptime: process.uptime(), shopify: !!getToken(), llm: store.getConfig().llm?.provider || 'none', kb: kb.getStats()
}));

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/admin.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/widget.js', (req, res) => { res.setHeader('Content-Type', 'application/javascript'); res.sendFile(path.join(__dirname, 'public', 'widget.js')); });

app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║   Asesor Digital v2.0 — AI Advisor Platform    ║`);
  console.log(`║   Port: ${PORT} | Shop: ${(SHOP || 'not set').substring(0, 25).padEnd(25)}║`);
  console.log(`║   LLM: ${(store.getConfig().llm?.provider || 'none').padEnd(10)} | KB: ${String(kb.getStats().chunks).padEnd(4)} chunks    ║`);
  console.log(`║   Scopes: ${SCOPES.split(',').length} Shopify permissions           ║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);
});
