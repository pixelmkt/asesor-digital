/* ═══════════════════════════════════════════════════════════════
   Asesor Digital v3 — Main Server
   Professional AI Sports Nutrition Advisor for Shopify
   Features: Nutrition KB, Customer Memory, Goal Stacks,
   Conversational Sales Prompt, Multi-LLM Router
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
const nutritionKB = require('./services/nutrition-kb');
const exerciseKB = require('./services/exercise-kb');
const customerMemory = require('./services/customer-memory');
const pdfService = require('./services/pdf-service');

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
  storage: multer.memoryStorage(), // buffer in RAM → upload to Shopify CDN, not local disk
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

// ── Middleware ──
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
// ── CORS: allow configured shop, myshopify admin, Railway, local — reflect origin for widgets ──
const CORS_EXTRA = (process.env.CORS_ALLOWED || '').split(',').map(s => s.trim()).filter(Boolean);
// Public widget endpoints: allow any origin (widget is embed-anywhere by design).
// Rate limiters do the heavy defense. Admin endpoints sit behind same CORS but also rely on token checks.
app.use(cors({
  origin: true,
  credentials: true
}));
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
const emailLimiter = rateLimit({ windowMs: 60000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many email sends — try again in 1 minute' } });
const planLimiter = rateLimit({ windowMs: 60000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many plan requests' } });
app.use('/api/', apiLimiter);
app.use('/api/chat', chatLimiter);
app.use('/api/remarketing/send', emailLimiter);
app.use('/api/plan/send', planLimiter);
app.use('/api/routines/send', emailLimiter);
app.use('/api/leads/export', emailLimiter);
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
      // ── Restore leads from Shopify Metaobjects (survives redeploys) ──
      try {
        const savedLeads = await shopifyStorage.getLeads(shopDomain, shopToken, 250);
        if (savedLeads && savedLeads.length) {
          const existingById = new Map(store.getLeads().map(l => [l.email || l.id, l]));
          for (const sl of savedLeads) {
            const key = sl.email || sl.handle;
            if (!existingById.has(key)) existingById.set(key, { ...sl, id: sl.id || ('lead_' + (sl.createdAt || Date.now())), status: sl.status || 'new', segments: [], purchaseTotal: 0 });
          }
          store.setLeads(Array.from(existingById.values()));
          console.log(`[BOOT] ${savedLeads.length} leads restored from Shopify Metaobjects ✓`);
        }
      } catch (e) { console.error('[BOOT] Leads restore failed:', e.message); }
      // ── Restore events from Shopify metafield ──
      try {
        const savedEvents = await shopifyStorage.getEvents(shopDomain, shopToken);
        if (savedEvents && savedEvents.length) {
          const existingIds = new Set(store.getEvents().map(e => e.id));
          const merged = [...store.getEvents()];
          for (const ev of savedEvents) if (!existingIds.has(ev.id)) merged.push(ev);
          store.setEvents(merged);
          console.log(`[BOOT] ${savedEvents.length} events restored from Shopify Metafields ✓`);
        }
      } catch (e) { console.error('[BOOT] Events restore failed:', e.message); }
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
    const { messages, sessionId, customerEmail, customerName } = req.body;
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

    // ── Build system prompt — CONVERSATIONAL SALES ADVISOR ──
    let systemPrompt = `Eres Dr. Lab, nutricionista deportivo de Lab Nutrition Perú. Eres un asesor REAL en tienda — cercano, empático, profesional y con un objetivo claro: ayudar al cliente y cerrar la venta.

═══ PERSONALIDAD ═══
- Hablas como una persona real en WhatsApp: oraciones cortas, directas, con calidez
- Usas tú (informal pero respetuoso)
- NO usas asteriscos, markdown, bullets largos ni muros de texto
- Máximo 3-4 oraciones por respuesta a menos que te pidan más
- Haces UNA pregunta a la vez, no bombardees
- Usas expresiones naturales: "mira", "dale", "perfecto", "genial", "a full"

═══ FLUJO DE VENTA ═══
1. SALUDO → Personal si es cliente conocido, cálido si es nuevo
2. DIAGNÓSTICO → Pregunta su objetivo (solo si no lo sabes)
3. PERFIL → Pregunta nivel de experiencia y restricciones SI son relevantes
4. RECOMENDACIÓN → Stack de 2-3 productos con razón breve por cada uno
5. RESOLVER OBJECIONES → Precio, dudas, comparaciones
6. CIERRE → "¿Te armo el carrito con estos 3?" / "¿Le damos?"

═══ TÉCNICAS DE CIERRE ═══
- Pregunta de cierre: "¿Lo activamos?" / "¿Se los agrego al carrito?"
- Urgencia sutil (sin inventar): "Este stack es el más pedido para tu objetivo"
- Social proof: "Es lo que más recomiendo para..."
- Si duda por precio: ofrece cupón con [DISCOUNT:10]
- Si ya compró antes: "¿Cómo te fue con X? ¿Ya se te está acabando?"

═══ REGLAS ABSOLUTAS ═══
- NO inventes productos que no están en el catálogo
- NO inventes precios
- NO menciones marcas competidoras (GNC, ON, MyProtein, MuscleTech, Herbalife)
- Si preguntan por otra marca: "No la manejamos, pero tenemos opciones con excelente calidad y resultados comprobados"
- NO seas un catálogo — sé un asesor que pregunta y personaliza
- Cuando recomiendes, da un motivo PERSONAL: "Para tu objetivo de ganar músculo, esta proteína es ideal porque..."
`;

    if (behavior.customRules) systemPrompt += '\nREGLAS ADICIONALES:\n' + behavior.customRules;

    // ── Inject Customer Memory (if identified) ──
    if (customerEmail) {
      let profile = customerMemory.getProfile(customerEmail);
      // If no local profile, try restoring from Shopify
      if (!profile && shopToken && shopDomain) {
        profile = await customerMemory.restoreFromShopify(customerEmail, shopDomain, shopToken);
      }
      if (profile) {
        systemPrompt += customerMemory.getPromptContext(customerEmail);
      }
    }
    if (customerContext) systemPrompt += customerContext;

    // ── Inject Nutrition Knowledge Base ──
    systemPrompt += '\n\n' + nutritionKB.getFullNutritionContext();

    // ── Detect goal from conversation ──
    const fullConv = messages.map(m => m.content || '').join(' ');
    const detectedGoal = nutritionKB.detectGoalFromText(fullConv);

    // ── Inject Goal-specific protocol ──
    if (detectedGoal) {
      systemPrompt += nutritionKB.getContextForGoal(detectedGoal);
    }

    // ── Inject Goal Stack products by Tier (Tier 1 = Premium / Black Diamond) ──
    const goalKey = detectedGoal || 'general';
    const goalByTier = store.getGoalProductsByTier(goalKey);
    const goalProducts = [...goalByTier.tier1, ...goalByTier.tier2, ...goalByTier.tier3].slice(0, 6);
    if (goalProducts.length) {
      systemPrompt += `\n\n═══ PRODUCTOS PRIORITARIOS PARA ESTE OBJETIVO (configurados por el admin) ═══`;
      systemPrompt += '\nRecomienda SIEMPRE empezando por TIER 1 (premium). Si no hay Tier 1 o el cliente duda por precio, ofrece Tier 2. Tier 3 es opcion economica.';
      if (goalByTier.tier1.length) {
        systemPrompt += '\n\n[TIER 1 - PREMIUM / BLACK DIAMOND]';
        goalByTier.tier1.forEach((p, i) => { systemPrompt += `\n${i+1}. ${p.title || p.name} | S/ ${p.price} | variantId:${p.variantId} | url:${p.url}${p.reason ? ' | ' + p.reason : ''}`; });
      }
      if (goalByTier.tier2.length) {
        systemPrompt += '\n\n[TIER 2 - RECOMENDADO]';
        goalByTier.tier2.forEach((p, i) => { systemPrompt += `\n${i+1}. ${p.title || p.name} | S/ ${p.price} | variantId:${p.variantId} | url:${p.url}${p.reason ? ' | ' + p.reason : ''}`; });
      }
      if (goalByTier.tier3.length) {
        systemPrompt += '\n\n[TIER 3 - ESENCIAL]';
        goalByTier.tier3.forEach((p, i) => { systemPrompt += `\n${i+1}. ${p.title || p.name} | S/ ${p.price} | variantId:${p.variantId} | url:${p.url}${p.reason ? ' | ' + p.reason : ''}`; });
      }
    }

    // ── Inject Exercise KB context for goal ──
    if (detectedGoal) {
      try { systemPrompt += '\n\n' + exerciseKB.getExerciseContext(detectedGoal); } catch {}
    }

    // ── Inject Sticker commands ──
    const activeStickers = store.getStickers({ active: true });
    if (activeStickers.length && store.getConfig().stickers?.enabled !== false) {
      systemPrompt += '\n\n═══ STICKERS DISPONIBLES ═══';
      systemPrompt += '\nPuedes enviar stickers para reforzar emociones. Usa [STICKER:nombre] en tu respuesta. Stickers disponibles:';
      activeStickers.slice(0, 30).forEach(s => {
        systemPrompt += `\n- ${s.name} (${s.category})${(s.triggers || []).length ? ' - triggers: ' + s.triggers.join(', ') : ''}`;
      });
      systemPrompt += '\nUsalos con moderacion — maximo 1 por respuesta. Ideal en: bienvenida, celebracion de cierre, cuando el cliente logra su objetivo.';
    }

    // ── Inject WhatsApp CTA command ──
    const wa = store.getConfig().whatsapp || {};
    if (wa.enabled && wa.number) {
      systemPrompt += `\n\n═══ ASESOR EN TIENDA ═══\nSi el cliente pide hablar con alguien real, tiene duda compleja, o quiere coordinar entrega/pago presencial, usa el tag [WHATSAPP] en tu respuesta. El sistema agregara un boton "${wa.label || 'Hablar con un asesor en tienda'}".`;
    }

    // ── Inject Send Plan trigger ──
    systemPrompt += '\n\n═══ ENVIO DE PLAN PERSONALIZADO ═══';
    systemPrompt += '\nSi ya identificaste objetivo + nombre + email del cliente y ya recomendaste productos, propon enviarle un PLAN PDF COMPLETO (rutina + nutricion + productos + cupon + carrito listo) por correo. Usa el tag [SEND_PLAN] solo cuando el cliente acepte recibirlo. El sistema mostrara un boton "Recibir mi plan por correo".';

    // ── Inject product catalog from Shopify ──
    const stacks = store.getProductStacks().filter(s => s.active !== false);
    let allShopProducts = [];
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
              : true;
            return {
              name: p.title, price: variant.price || '', compareAtPrice: variant.compare_at_price || '',
              image: p.images?.[0]?.src || '', variantId: String(variant.id || ''), shopifyId: String(p.id),
              url: `https://${shopDomain}/products/${p.handle}`, type: p.product_type || '',
              tags: p.tags || '', inStock,
              description: (p.body_html || '').replace(/<[^>]*>/g, '').substring(0, 120)
            };
          }).filter(p => p.inStock);
        }
      } catch (e) { console.error('[Chat] Product fetch error:', e.message); }
    }

    const catalogProducts = allShopProducts.length ? allShopProducts : stacks.flatMap(s => (s.products || []).map(p => ({ ...p, stackName: s.name, segment: s.segment })));

    if (catalogProducts.length && behavior.showProducts !== false) {
      systemPrompt += `\n\n═══ CATÁLOGO COMPLETO (${catalogProducts.length} productos en stock) ═══`;
      systemPrompt += '\nCuando recomiendes productos, SIEMPRE incluye un bloque JSON al final:';
      systemPrompt += '\n<!--PRODUCTS:[{"name":"...","price":"...","compareAtPrice":"...","image":"...","variantId":"...","url":"...","description":"..."}]-->';
      systemPrompt += '\nMáximo 3 productos por respuesta. En price y compareAtPrice pon SOLO el número.';

      systemPrompt += '\n\nProductos disponibles:';
      catalogProducts.forEach(p => {
        const hasOffer = p.compareAtPrice && parseFloat(p.compareAtPrice) > parseFloat(p.price);
        systemPrompt += `\n• ${p.name} | S/ ${p.price}${hasOffer ? ' (antes S/ ' + p.compareAtPrice + ')' : ''} | variantId:${p.variantId} | url:${p.url} | img:${p.image ? 'si' : 'no'}${p.type ? ' | ' + p.type : ''}${p.tags ? ' | tags:' + p.tags : ''}`;
      });

      systemPrompt += `\n\nLink carrito: https://${shopDomain}/cart/VARIANT_ID:1`;
    }

    // ── Data collection (natural capture) ──
    if (behavior.dataCollection?.enabled) {
      systemPrompt += `\n\n═══ CAPTURA DE DATOS ═══\nDe manera natural y sin ser invasivo, después de 2-3 mensajes pregunta su nombre. Si sientes confianza, pregunta email para "enviarte info personalizada". NO pidas todo de golpe.`;
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

    // ── Handle [STICKER:name] triggers → collect sticker URLs for widget ──
    const stickers = [];
    const stickerRegex = /\[STICKER:([a-zA-Z0-9_\-]+)\]/g;
    let sMatch;
    while ((sMatch = stickerRegex.exec(responseText)) !== null) {
      const s = store.findStickerByName(sMatch[1]);
      if (s && s.url) stickers.push({ id: s.id, name: s.name, url: s.url, category: s.category });
    }
    if (stickers.length) responseText = responseText.replace(stickerRegex, '').trim();

    // ── Handle [WHATSAPP] trigger → attach WhatsApp link from config ──
    let whatsappLink = null;
    if (/\[WHATSAPP\]/.test(responseText)) {
      const wa = store.getConfig().whatsapp || {};
      if (wa.enabled && wa.number) {
        const num = String(wa.number).replace(/\D/g, '');
        const msg = encodeURIComponent(wa.message || 'Hola, necesito un asesor en tienda');
        whatsappLink = `https://wa.me/${num}?text=${msg}`;
      }
      responseText = responseText.replace(/\[WHATSAPP\]/g, '').trim();
    }

    // ── Handle [SEND_PLAN] trigger → frontend will POST /api/plan/send ──
    let sendPlanRequest = null;
    if (/\[SEND_PLAN\]/.test(responseText)) {
      sendPlanRequest = { goalId: detectedGoal || 'general', suggested: true };
      responseText = responseText.replace(/\[SEND_PLAN\]/g, '').trim();
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

    // ── Update customer memory (await so profile is consistent) ──
    if (customerEmail) {
      try {
        let profile = customerMemory.getProfile(customerEmail);
        if (!profile) profile = customerMemory.createProfile(customerEmail, { name: customerName || '' });
        if (profile) {
          customerMemory.updateProfile(customerEmail, {
            ...(customerName ? { name: customerName } : {}),
            ...(detectedGoal ? { goal: detectedGoal, goalLabel: nutritionKB.NUTRITION_KB.protocols?.[detectedGoal]?.name || detectedGoal } : {})
          });
          if (products?.length) customerMemory.addRecommendedProducts(customerEmail, products);
          if (shopToken && shopDomain && profile.shopifyCustomerId) {
            customerMemory.backupToShopify(customerEmail, shopDomain, shopToken).catch(() => {});
          }
        }
      } catch (e) { console.error('[Memory] update error:', e.message); }
    }

    res.json({
      response: responseText, products, cartLink, discountCode,
      stickers, whatsappLink, sendPlanRequest, detectedGoal,
      model: result.model, provider: result.provider
    });
  } catch (e) { console.error('Chat error:', e.message); res.status(500).json({ error: e.message }); }
});

// ═══ GOAL STACKS API ═══
app.get('/api/goal-stacks', (req, res) => res.json({ goalStacks: store.getGoalStacks() }));
app.get('/api/goal-stacks/:goalId', (req, res) => {
  const gs = store.getGoalStack(req.params.goalId);
  if (!gs) return res.status(404).json({ error: 'Goal not found' });
  res.json({ goalStack: gs });
});
app.post('/api/goal-stacks', (req, res) => {
  const { goalId, goalName, goalIcon, description, active } = req.body;
  if (!goalId) return res.status(400).json({ error: 'goalId required' });
  const gs = store.upsertGoalStack(goalId, { goalName, goalIcon, description, active });
  res.json({ success: true, goalStack: gs });
});
app.put('/api/goal-stacks/:goalId', (req, res) => {
  const gs = store.upsertGoalStack(req.params.goalId, req.body);
  res.json({ success: true, goalStack: gs });
});
app.delete('/api/goal-stacks/:goalId', (req, res) => {
  store.deleteGoalStack(req.params.goalId);
  res.json({ success: true });
});
app.post('/api/goal-stacks/:goalId/products', (req, res) => {
  const gs = store.addProductToGoalStack(req.params.goalId, req.body);
  if (!gs) return res.status(404).json({ error: 'Goal not found' });
  res.json({ success: true, goalStack: gs });
});
app.delete('/api/goal-stacks/:goalId/products/:productId', (req, res) => {
  const gs = store.removeProductFromGoalStack(req.params.goalId, req.params.productId);
  if (!gs) return res.status(404).json({ error: 'Goal not found' });
  res.json({ success: true, goalStack: gs });
});
app.put('/api/goal-stacks/:goalId/products/:productId', (req, res) => {
  const gs = store.updateGoalProduct(req.params.goalId, req.params.productId, req.body);
  if (!gs) return res.status(404).json({ error: 'Goal or product not found' });
  res.json({ success: true, goalStack: gs });
});

// ═══ CUSTOMER MEMORY API ═══
app.get('/api/customers/profiles', (req, res) => {
  res.json({ profiles: customerMemory.listProfiles(parseInt(req.query.limit) || 50), total: customerMemory.getCount() });
});
app.get('/api/customers/profiles/:email', async (req, res) => {
  let profile = customerMemory.getProfile(req.params.email);
  // Try restoring from Shopify if not found locally
  if (!profile) {
    const token = getToken();
    const shop = SHOP || store.getConfig().shopify?.shop;
    if (token && shop) profile = await customerMemory.restoreFromShopify(req.params.email, shop, token);
  }
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json({ profile });
});
app.put('/api/customers/profiles/:email', (req, res) => {
  const profile = customerMemory.updateProfile(req.params.email, req.body);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json({ success: true, profile });
});
app.post('/api/customers/profiles/:email/notes', (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: 'note required' });
  customerMemory.addNote(req.params.email, note);
  res.json({ success: true });
});
app.post('/api/customers/profiles/:email/summary', (req, res) => {
  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: 'summary required' });
  customerMemory.addConversationSummary(req.params.email, summary);
  res.json({ success: true });
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

// ── Helper: Upload buffer to Shopify Files API (GraphQL) ──
async function uploadToShopifyCDN(fileBuffer, filename, mimeType) {
  const sh = getToken();
  const domain = process.env.SHOPIFY_SHOP || store.getConfig().shopify?.shop;
  if (!sh || !domain) return null;
  const shopifyGraphQL = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const gqlHeaders = { 'X-Shopify-Access-Token': sh, 'Content-Type': 'application/json' };

  try {
    // Step 1: Create staged upload
    const stageRes = await fetch(shopifyGraphQL, {
      method: 'POST', headers: gqlHeaders,
      body: JSON.stringify({ query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`, variables: { input: [{ filename, mimeType, resource: 'FILE', fileSize: String(fileBuffer.length) }] } })
    });
    const stageData = await stageRes.json();
    const target = stageData?.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) throw new Error('Failed to get staged upload target');

    // Step 2: Upload to staged URL
    const formData = new FormData();
    (target.parameters || []).forEach(p => formData.append(p.name, p.value));
    formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename);
    await fetch(target.url, { method: 'POST', body: formData });

    // Step 3: Create file in Shopify
    const fileRes = await fetch(shopifyGraphQL, {
      method: 'POST', headers: gqlHeaders,
      body: JSON.stringify({ query: `mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files { ... on MediaImage { image { url } } ... on GenericFile { url } }
          userErrors { field message }
        }
      }`, variables: { files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE' }] } })
    });
    const fileData = await fileRes.json();
    const fileUrl = fileData?.data?.fileCreate?.files?.[0]?.image?.url
      || fileData?.data?.fileCreate?.files?.[0]?.url;
    return fileUrl || null;
  } catch (e) {
    console.error('[ShopifyCDN] Upload error:', e.message);
    return null;
  }
}

app.post('/api/upload/logo', imgUpload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo no permitido. Usa JPG, PNG, GIF, WebP, SVG' });

  // Try to upload to Shopify CDN first (permanent, survives redeploys)
  const cdnUrl = await uploadToShopifyCDN(
    req.file.buffer || fs.readFileSync(path.join(UPLOADS_DIR, req.file.filename)),
    req.file.originalname || req.file.filename,
    req.file.mimetype
  );
  const finalUrl = cdnUrl || (process.env.BACKEND_URL || `http://localhost:${PORT}`) + '/uploads/' + req.file.filename;
  const cfg = store.updateConfig('widget', { avatar: finalUrl });
  // Save to Shopify metafields so avatar URL persists across redeploys
  await saveConfigToShopify(cfg);
  res.json({ success: true, url: finalUrl, shopifyCDN: !!cdnUrl, filename: req.file.filename });
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
  const { name, image, price, url, shopifyId, tier } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre del producto requerido' });
  const stack = store.addProductToStack(req.params.id, { name, image: image || '', price: price || '', url: url || '', shopifyId: shopifyId || '', tier: parseInt(tier) || 2 });
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
  if (safe.llm?.apiKey) { safe.llm.apiKeyConfigured = true; delete safe.llm.apiKey; }
  else if (safe.llm) { safe.llm.apiKeyConfigured = false; }
  if (safe.shopify?.accessToken) { safe.shopify.accessTokenConfigured = true; delete safe.shopify.accessToken; }
  res.json(safe);
});
// ── Helper: await Shopify metafield save, return result ──
async function saveConfigToShopify(cfg) {
  const sh = getToken();
  const domain = process.env.SHOPIFY_SHOP || cfg.shopify?.shop;
  if (!sh || !domain) return { saved: false, reason: 'No Shopify credentials' };
  try {
    await shopifyStorage.saveConfig(domain, sh, cfg);
    return { saved: true };
  } catch (e) {
    console.error('[Config] Shopify save FAILED:', e.message);
    return { saved: false, reason: e.message };
  }
}

// Test persistence endpoint — call from admin to verify write access
app.get('/api/config/test-persistence', async (req, res) => {
  const sh = getToken();
  const domain = process.env.SHOPIFY_SHOP || store.getConfig().shopify?.shop;
  if (!sh || !domain) return res.json({ ok: false, reason: 'No Shopify credentials configured' });
  try {
    // Try writing a test ping metafield
    const result = await shopifyStorage.setShopMetafield
      ? null // setShopMetafield is internal, use saveConfig instead
      : null;
    const cfg = store.getFullConfig();
    await shopifyStorage.saveConfig(domain, sh, cfg);
    res.json({ ok: true, message: 'Metafield write OK – config persisted to Shopify ✓', shop: domain });
  } catch (e) {
    res.json({ ok: false, reason: e.message, hint: 'Verify SHOPIFY_ACCESS_TOKEN has write_metafields scope' });
  }
});

app.put('/api/config/:section', async (req, res) => {
  try {
    const cfg = store.updateConfig(req.params.section, req.body);
    const { saved, reason } = await saveConfigToShopify(cfg);
    if (!saved) console.warn('[Config] Local saved but Shopify sync failed:', reason);
    res.json({ success: true, shopifySaved: saved, ...(saved ? {} : { shopifyWarning: reason }), config: cfg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/config/email', async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, fromEmail } = req.body;
  const cfg = store.updateConfig('email', { smtpHost, smtpPort: smtpPort || 587, smtpUser, smtpPass, fromName: fromName || 'Asesor Digital', fromEmail: fromEmail || smtpUser });
  if (smtpHost) process.env.SMTP_HOST = smtpHost;
  if (smtpUser) process.env.SMTP_USER = smtpUser;
  if (smtpPass) process.env.SMTP_PASS = smtpPass;
  const { saved } = await saveConfigToShopify(cfg);
  res.json({ success: true, shopifySaved: saved });
});

// ═══ BRAND / IDENTITY ═══
app.put('/api/config/brand', async (req, res) => {
  const { storeName, logo, tagline, primaryLanguage, currency, timezone, whitelabelName, whitelabelLogo } = req.body;
  let cfg = store.updateConfig('brand', { storeName, logo, tagline, primaryLanguage: primaryLanguage || 'es', currency: currency || 'PEN', timezone: timezone || 'America/Lima', whitelabelName, whitelabelLogo });
  if (storeName && !req.body.keepWidgetName) cfg = store.updateConfig('widget', { name: storeName });
  const { saved } = await saveConfigToShopify(cfg);
  res.json({ success: true, shopifySaved: saved });
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
    const stored = store.getConfig().llm || {};
    const keyToUse = (apiKey && apiKey.trim() && !apiKey.includes('•')) ? apiKey : stored.apiKey;
    if (!keyToUse) return res.status(400).json({ error: 'API key no configurada. Pega una clave y guarda primero.' });
    const result = await llm.testConnection(provider || stored.provider, keyToUse, model || stored.model);
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
  // Also save lead to Shopify Metaobjects for persistence (await — crucial for surviving redeploys)
  const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
  let persisted = false;
  if (token && shop) {
    try { await shopifyStorage.saveLead(shop, token, req.body); persisted = true; }
    catch (e) { console.error('[Lead save to Shopify failed]', e.message); }
  }
  res.json({ ok: true, leadId: lead.id, persisted });
});
app.post('/api/track/purchase', (req, res) => { store.addPurchase(req.body); res.json({ ok: true }); });

// ═══ ANALYTICS ═══
app.get('/api/analytics/summary', (req, res) => res.json(store.getSummary(req.query.period || '30d')));
app.get('/api/analytics/leads', async (req, res) => {
  // Hydrate from Shopify if local cache is empty or explicitly refreshing
  const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
  if (token && shop && (req.query.refresh === '1' || store.getLeads().length === 0)) {
    try {
      const remote = await shopifyStorage.getLeads(shop, token, 250);
      if (remote?.length) {
        const map = new Map(store.getLeads().map(l => [l.email || l.id, l]));
        for (const sl of remote) {
          const key = sl.email || sl.handle;
          if (!map.has(key)) map.set(key, { ...sl, id: sl.id || ('lead_' + (sl.createdAt || Date.now())), status: sl.status || 'new', segments: [], purchaseTotal: 0 });
        }
        store.setLeads(Array.from(map.values()));
      }
    } catch (e) { console.error('[Leads] hydrate failed:', e.message); }
  }
  res.json({ leads: store.getLeads(req.query) });
});
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
    if (!email.isValidEmail(recipient)) return res.status(400).json({ error: 'Email invalido' });
    await email.sendRoutine(config, recipient, routineData);
    if (leadId) store.updateLead(leadId, { status: 'routine_sent' });
    res.json({ success: true, sentTo: recipient });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ EXERCISE KB ═══
app.get('/api/exercise-kb', (req, res) => res.json({ routines: exerciseKB.listRoutines() }));
app.get('/api/exercise-kb/:goalId', (req, res) => {
  const r = exerciseKB.getRoutine(req.params.goalId);
  if (!r) return res.status(404).json({ error: 'Routine not found' });
  res.json({ routine: r });
});

// ═══ EXERCISE STACKS (admin overrides) ═══
app.get('/api/exercise-stacks', (req, res) => res.json({ exerciseStacks: store.getExerciseStacks() }));
app.get('/api/exercise-stacks/:goalId', (req, res) => {
  const e = store.getExerciseStack(req.params.goalId);
  const base = exerciseKB.getRoutine(req.params.goalId);
  res.json({ exerciseStack: e, baseRoutine: base });
});
app.put('/api/exercise-stacks/:goalId', async (req, res) => {
  try {
    const e = store.upsertExerciseStack(req.params.goalId, req.body);
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch {} }
    res.json({ success: true, exerciseStack: e });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/exercise-stacks/:goalId', async (req, res) => {
  store.deleteExerciseStack(req.params.goalId);
  const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
  if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch {} }
  res.json({ success: true });
});

// ═══ STICKER PACK ═══
app.get('/api/stickers', (req, res) => {
  res.json({ stickers: store.getStickers(req.query || {}), categories: ['celebration','encouragement','welcome','goal-achieved','thinking','product','custom'] });
});
app.post('/api/stickers', async (req, res) => {
  try {
    const { name, url, category, triggers, active } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name y url requeridos' });
    const s = store.addSticker({ name, url, category, triggers, active });
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch {} }
    res.json({ success: true, sticker: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/stickers/upload', imgUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file requerido' });
    const { name, category, triggers } = req.body;
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    let cdnUrl = null;
    if (token && shop) {
      try {
        cdnUrl = await shopifyStorage.uploadImage(shop, token, req.file.buffer, req.file.originalname, req.file.mimetype);
      } catch (e) { console.error('[Sticker upload]', e.message); }
    }
    if (!cdnUrl) {
      const safe = Date.now() + '-' + req.file.originalname.replace(/[^a-z0-9.\-]/gi, '_');
      fs.writeFileSync(path.join(UPLOADS_DIR, safe), req.file.buffer);
      cdnUrl = `/uploads/${safe}`;
    }
    const s = store.addSticker({
      name: name || req.file.originalname,
      url: cdnUrl,
      category: category || 'custom',
      triggers: triggers ? (typeof triggers === 'string' ? triggers.split(',').map(t => t.trim()) : triggers) : []
    });
    if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch {} }
    res.json({ success: true, sticker: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/stickers/:id', async (req, res) => {
  const s = store.updateSticker(req.params.id, req.body);
  if (!s) return res.status(404).json({ error: 'Sticker not found' });
  const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
  if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch {} }
  res.json({ success: true, sticker: s });
});
app.delete('/api/stickers/:id', async (req, res) => {
  store.deleteSticker(req.params.id);
  const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
  if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch {} }
  res.json({ success: true });
});

// ═══ WHATSAPP LINK ═══
app.get('/api/whatsapp/link', (req, res) => {
  const wa = store.getConfig().whatsapp || {};
  if (!wa.enabled || !wa.number) return res.json({ enabled: false });
  const num = String(wa.number).replace(/\D/g, '');
  const msg = encodeURIComponent(req.query.message || wa.message || 'Hola, necesito un asesor en tienda');
  res.json({
    enabled: true,
    link: `https://wa.me/${num}?text=${msg}`,
    number: wa.number,
    label: wa.label || 'Hablar con un asesor en tienda'
  });
});
app.put('/api/config/whatsapp', async (req, res) => {
  try {
    const { enabled, number, message, label } = req.body;
    store.updateConfig('whatsapp', { enabled: !!enabled, number: number || '', message: message || '', label: label || 'Hablar con un asesor en tienda' });
    const token = getToken(); const shop = SHOP || store.getConfig().shopify?.shop;
    if (token && shop) { try { await shopifyStorage.saveConfig(shop, token, store.getConfig()); } catch {} }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ PLAN SEND (full personalized plan via PDF + email + cart link + discount) ═══
app.post('/api/plan/send', async (req, res) => {
  try {
    const { to, name, sessionId, goalId, nutrition, supplements, trainerNotes, products: providedProducts, applyDiscount, leadId } = req.body;
    if (!to) return res.status(400).json({ error: 'email requerido' });
    if (!email.isValidEmail(to)) return res.status(400).json({ error: 'Email invalido' });

    const cfg = store.getConfig();
    const emailCfg = cfg.email;
    const brandCfg = { storeName: cfg.brand?.storeName || cfg.widget?.name || 'Dr Lab', tagline: cfg.brand?.tagline || cfg.widget?.poweredBy || '', primaryColor: cfg.widget?.primaryColor || '#D4502A', secondaryColor: cfg.widget?.secondaryColor || '#1E1E1E' };

    const routine = goalId ? exerciseKB.getRoutine(goalId) : null;
    const goalLabel = routine?.name || (goalId ? goalId.replace(/_/g,' ') : 'Tu plan');

    // Assemble products — use provided, else Goal Stack
    let products = Array.isArray(providedProducts) && providedProducts.length ? providedProducts : [];
    if (!products.length && goalId) {
      const gs = store.getGoalProducts(goalId, 6);
      products = gs.map(p => ({ title: p.title || p.name, price: p.price, variantId: p.variantId, image: p.image, url: p.url, tier: p.tier, reason: p.reason, note: p.reason }));
    }

    const shopDomain = SHOP || cfg.shopify?.shop;
    const shopToken = getToken();
    let cartUrl = '';
    if (shopDomain && products.length) {
      const ids = products.map(p => p.variantId).filter(Boolean);
      if (ids.length) cartUrl = `https://${shopDomain}/cart/${ids.map(v => v + ':1').join(',')}`;
    }

    // Optional discount
    let discountCode = '';
    if (applyDiscount && shopToken && shopDomain) {
      try {
        const pct = parseInt(applyDiscount) || 10;
        const code = 'PLAN' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const priceRuleR = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/price_rules.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': shopToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ price_rule: {
            title: `Plan ${goalLabel} - ${pct}%`, target_type: 'line_item', target_selection: 'all',
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
        }
      } catch (e) { console.error('[Plan discount]', e.message); }
    }

    // Build PDF
    const pdfBuffer = await pdfService.generatePlanPDFBuffer({
      brand: brandCfg,
      customerName: name || 'Atleta',
      customerEmail: to,
      goalLabel,
      routine,
      nutrition,
      products,
      cartUrl,
      discountCode,
      supplementsContext: supplements
    });

    // Send email
    await email.sendPlanEmail(emailCfg, to, {
      name, goalLabel, cartUrl, discountCode, pdfBuffer, brand: brandCfg, shop: shopDomain
    });

    // Track
    store.addPlanSent({ sessionId, email: to, name, goalId, products, cartLink: cartUrl, discountCode, pdfAttached: true });
    if (leadId) store.updateLead(leadId, { status: 'plan_sent' });
    store.addEvent({ type: 'plan_sent', sessionId, data: { email: to, goalId, productsCount: products.length } });

    // Backup to Shopify (non-blocking)
    if (shopToken && shopDomain) {
      shopifyStorage.savePlanMetaobject?.(shopDomain, shopToken, { email: to, name, goalId, cartUrl, discountCode, productsCount: products.length }).catch(() => {});
    }

    res.json({ success: true, sentTo: to, cartUrl, discountCode, productsCount: products.length, goalLabel });
  } catch (e) { console.error('[Plan send]', e.message); res.status(500).json({ error: e.message }); }
});

// Generate PDF only (for download, no email)
app.post('/api/plan/pdf', async (req, res) => {
  try {
    const { name, goalId, nutrition, supplements, products: providedProducts } = req.body;
    const cfg = store.getConfig();
    const brandCfg = { storeName: cfg.brand?.storeName || cfg.widget?.name || 'Dr Lab', primaryColor: cfg.widget?.primaryColor || '#D4502A', secondaryColor: cfg.widget?.secondaryColor || '#1E1E1E' };
    const routine = goalId ? exerciseKB.getRoutine(goalId) : null;
    const goalLabel = routine?.name || (goalId ? goalId.replace(/_/g,' ') : 'Tu plan');
    let products = Array.isArray(providedProducts) && providedProducts.length ? providedProducts : [];
    if (!products.length && goalId) {
      products = store.getGoalProducts(goalId, 6).map(p => ({ title: p.title || p.name, price: p.price, variantId: p.variantId, tier: p.tier, reason: p.reason }));
    }
    const shopDomain = SHOP || cfg.shopify?.shop;
    const cartUrl = shopDomain && products.length ? `https://${shopDomain}/cart/${products.map(p => p.variantId).filter(Boolean).map(v => v + ':1').join(',')}` : '';
    const pdfStream = await pdfService.generatePlanPDF({
      brand: brandCfg, customerName: name, goalLabel, routine, nutrition,
      supplementsContext: supplements, products, cartUrl
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="plan-${(name || 'cliente').replace(/[^a-z0-9]/gi,'_')}.pdf"`);
    pdfStream.pipe(res);
  } catch (e) { console.error('[Plan PDF]', e.message); res.status(500).json({ error: e.message }); }
});

// ═══ PLANS SENT HISTORY ═══
app.get('/api/plans/sent', (req, res) => res.json({ plans: store.getPlansSent() }));

// ═══ EMBED SCRIPT (for inline section mode on Shopify pages) ═══
app.get('/embed.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const backend = process.env.BACKEND_URL || `http://localhost:${PORT}`;
  res.send(`
(function(){
  var script = document.createElement('script');
  script.src = '${backend}/widget.js';
  script.defer = true;
  script.dataset.mode = 'inline';
  script.dataset.backend = '${backend}';
  document.head.appendChild(script);
})();
`);
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
  status: 'ok', app: 'asesor-digital', version: '3.0.0',
  uptime: process.uptime(), shopify: !!getToken(), llm: store.getConfig().llm?.provider || 'none',
  kb: kb.getStats(), customerProfiles: customerMemory.getCount(), goalStacks: store.getGoalStacks().length
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
  console.log(`║   Asesor Digital v3.0 — AI Nutrition Advisor   ║`);
  console.log(`║   Port: ${PORT} | Shop: ${(SHOP || 'not set').substring(0, 25).padEnd(25)}║`);
  console.log(`║   LLM: ${(store.getConfig().llm?.provider || 'none').padEnd(10)} | KB: ${String(kb.getStats().chunks).padEnd(4)} chunks    ║`);
  console.log(`║   Goals: ${String(store.getGoalStacks().length).padEnd(3)} | Memory: ${String(customerMemory.getCount()).padEnd(4)} profiles  ║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);
});

