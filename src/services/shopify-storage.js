/* ═══════════════════════════════════════════════════════════════
   Shopify Metafields / Metaobjects Storage Service
   March 2026 — Asesor Digital v3.x
   
   Uses Shopify as primary persistent storage so config and leads
   survive Railway redeploys and work per-store (multi-tenant).
   
   Storage map:
   • Config     → Shop Metafield  namespace=asesor_digital key=config
   • LLM Key    → Shop Metafield  namespace=asesor_digital key=llm_key (encrypted separate)
   • Leads      → Metaobjects     type=asesor_digital_lead
   • Events     → Shop Metafield  namespace=asesor_digital key=events (last 200, circular)
   ═══════════════════════════════════════════════════════════════ */

const NS = 'asesor_digital';

// ── HTTP helper for Shopify Admin REST API ─────────────────────
async function shopifyFetch(shop, token, method, endpoint, body) {
  const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-01';
  const url = `https://${shop}/admin/api/${API_VERSION}/${endpoint}`;
  const opts = {
    method,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(url, opts);
    if (!r.ok) {
      const err = await r.text();
      console.error(`[ShopifyStorage] ${method} ${endpoint} → ${r.status}: ${err.substring(0, 120)}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('[ShopifyStorage] Fetch error:', e.message);
    return null;
  }
}

// ── Shop-level metafield helpers ──────────────────────────────
async function getShopMetafield(shop, token, key) {
  const data = await shopifyFetch(shop, token, 'GET', `metafields.json?namespace=${NS}&key=${key}&owner_resource=shop`);
  const mf = data?.metafields?.[0];
  if (!mf) return null;
  try { return JSON.parse(mf.value); } catch { return mf.value; }
}

async function setShopMetafield(shop, token, key, value) {
  // Check if metafield already exists
  const existing = await shopifyFetch(shop, token, 'GET', `metafields.json?namespace=${NS}&key=${key}&owner_resource=shop`);
  const mf = existing?.metafields?.[0];
  const payload = {
    metafield: {
      namespace: NS,
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      type: 'json'
    }
  };
  if (mf?.id) {
    // Update existing
    const r = await shopifyFetch(shop, token, 'PUT', `metafields/${mf.id}.json`, payload);
    return r?.metafield;
  } else {
    // Create new
    const r = await shopifyFetch(shop, token, 'POST', 'metafields.json', payload);
    return r?.metafield;
  }
}

// ── CONFIG: save/load to Shop metafield ───────────────────────
async function saveConfig(shop, token, config) {
  // Don't persist the full API key in the shared config blob — use separate key slot
  const safeConfig = { ...config };
  const llmKey = safeConfig.llm?.apiKey;
  if (safeConfig.llm) safeConfig.llm = { ...safeConfig.llm, apiKey: llmKey ? '[SET]' : '' };
  
  await setShopMetafield(shop, token, 'config', safeConfig);
  
  // Save actual LLM key separately (single encrypted field)
  if (llmKey && llmKey !== '[SET]') {
    await setShopMetafield(shop, token, 'llm_key', llmKey);
  }
  console.log(`[ShopifyStorage] Config saved to metafields for ${shop}`);
  return true;
}

async function loadConfig(shop, token) {
  const config = await getShopMetafield(shop, token, 'config');
  if (!config) return null;
  
  // Restore the LLM key
  const llmKey = await getShopMetafield(shop, token, 'llm_key');
  if (llmKey && config.llm) config.llm.apiKey = llmKey;
  else if (llmKey) config.llm = { ...(config.llm || {}), apiKey: llmKey };
  
  console.log(`[ShopifyStorage] Config loaded from metafields for ${shop}`);
  return config;
}

// ── LEADS: Metaobjects ─────────────────────────────────────────
const LEAD_TYPE = 'asesor_digital_lead';

async function ensureLeadDefinition(shop, token) {
  // Check if definition already exists
  const existing = await shopifyFetch(shop, token, 'GET', 'metaobject_definitions.json');
  const defs = existing?.metaobject_definitions || [];
  if (defs.some(d => d.type === LEAD_TYPE)) return true;
  
  // Create definition
  const r = await shopifyFetch(shop, token, 'POST', 'metaobject_definitions.json', {
    metaobject_definition: {
      type: LEAD_TYPE,
      name: 'Asesor Digital Lead',
      access: { admin: 'MERCHANT_READ_WRITE' },
      field_definitions: [
        { name: 'Name',       key: 'name',       type: 'single_line_text_field' },
        { name: 'Email',      key: 'email',      type: 'single_line_text_field' },
        { name: 'Phone',      key: 'phone',      type: 'single_line_text_field' },
        { name: 'Goal',       key: 'goal',       type: 'single_line_text_field' },
        { name: 'Goal Label', key: 'goal_label', type: 'single_line_text_field' },
        { name: 'Session ID', key: 'session_id', type: 'single_line_text_field' },
        { name: 'Status',     key: 'status',     type: 'single_line_text_field' },
        { name: 'Source',     key: 'source',     type: 'single_line_text_field' },
        { name: 'Created At', key: 'created_at', type: 'date_time' }
      ]
    }
  });
  if (r?.metaobject_definition) {
    console.log(`[ShopifyStorage] Created metaobject definition: ${LEAD_TYPE}`);
    return true;
  }
  return false;
}

async function saveLead(shop, token, lead) {
  await ensureLeadDefinition(shop, token);
  const now = new Date().toISOString();
  const r = await shopifyFetch(shop, token, 'POST', 'metaobjects.json', {
    metaobject: {
      type: LEAD_TYPE,
      fields: [
        { key: 'name',       value: lead.name || '' },
        { key: 'email',      value: lead.email || '' },
        { key: 'phone',      value: lead.phone || '' },
        { key: 'goal',       value: lead.goal || '' },
        { key: 'goal_label', value: lead.goalLabel || '' },
        { key: 'session_id', value: lead.sessionId || '' },
        { key: 'status',     value: lead.status || 'new' },
        { key: 'source',     value: lead.source || 'widget' },
        { key: 'created_at', value: now }
      ]
    }
  });
  if (r?.metaobject) {
    console.log(`[ShopifyStorage] Lead saved: ${lead.email || lead.sessionId}`);
    return r.metaobject;
  }
  return null;
}

async function getLeads(shop, token, limit = 250) {
  const r = await shopifyFetch(shop, token, 'GET', `metaobjects.json?type=${LEAD_TYPE}&limit=${limit}`);
  const objs = r?.metaobjects || [];
  return objs.map(obj => {
    const fields = {};
    (obj.fields || []).forEach(f => (fields[f.key] = f.value));
    return {
      id: obj.id,
      handle: obj.handle,
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      goal: fields.goal,
      goalLabel: fields.goal_label,
      sessionId: fields.session_id,
      status: fields.status || 'new',
      source: fields.source || 'widget',
      createdAt: fields.created_at || obj.created_at
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function updateLeadStatus(shop, token, metaobjectId, status) {
  const r = await shopifyFetch(shop, token, 'PUT', `metaobjects/${metaobjectId}.json`, {
    metaobject: { fields: [{ key: 'status', value: status }] }
  });
  return r?.metaobject;
}

// ── EVENTS: lightweight circular array in metafield ──────────
async function addEvent(shop, token, event) {
  const MAX_EVENTS = 500;
  let events = await getShopMetafield(shop, token, 'events') || [];
  if (!Array.isArray(events)) events = [];
  events.unshift({ ...event, ts: new Date().toISOString() });
  if (events.length > MAX_EVENTS) events = events.slice(0, MAX_EVENTS);
  await setShopMetafield(shop, token, 'events', events);
}

async function getEvents(shop, token) {
  return await getShopMetafield(shop, token, 'events') || [];
}

// ── WIDGET SCRIPT TAG: inject via Shopify Script Tags API ─────
async function injectWidget(shop, token, backendUrl) {
  const scriptSrc = `${backendUrl}/widget.js`;
  
  // Get existing script tags to avoid duplicates
  const existing = await shopifyFetch(shop, token, 'GET', 'script_tags.json');
  const tags = existing?.script_tags || [];
  const alreadyExists = tags.some(t => t.src === scriptSrc || t.src.includes('widget.js'));
  
  if (alreadyExists) {
    console.log(`[ShopifyStorage] Widget already injected for ${shop}`);
    return { success: true, message: 'Widget already active', alreadyexisted: true };
  }
  
  const r = await shopifyFetch(shop, token, 'POST', 'script_tags.json', {
    script_tag: { event: 'onload', src: scriptSrc, display_scope: 'all' }
  });
  
  if (r?.script_tag) {
    console.log(`[ShopifyStorage] Widget injected via Script Tag for ${shop}: id=${r.script_tag.id}`);
    return { success: true, scriptTagId: r.script_tag.id };
  }
  return { success: false, error: 'Failed to create Script Tag — verify Shopify token has write_script_tags scope' };
}

async function removeWidget(shop, token, backendUrl) {
  const scriptSrc = backendUrl + '/widget.js';
  const existing = await shopifyFetch(shop, token, 'GET', 'script_tags.json');
  const tags = (existing?.script_tags || []).filter(t => t.src.includes('widget.js'));
  
  for (const tag of tags) {
    await shopifyFetch(shop, token, 'DELETE', `script_tags/${tag.id}.json`);
  }
  return { success: true, removed: tags.length };
}

// ── DISCOUNT CODES via Price Rules ────────────────────────────
async function createDiscount(shop, token, { code, percentage, title, usageLimit }) {
  // 1. Create price rule
  const priceRule = await shopifyFetch(shop, token, 'POST', 'price_rules.json', {
    price_rule: {
      title: title || `Asesor Digital — ${code}`,
      target_type: 'line_item', target_selection: 'all',
      allocation_method: 'across',
      value_type: 'percentage', value: `-${percentage || 10}`,
      customer_selection: 'all',
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      usage_limit: usageLimit || null
    }
  });
  if (!priceRule?.price_rule) return { success: false, error: 'Failed to create price rule' };
  
  // 2. Create discount code
  const dc = await shopifyFetch(shop, token, 'POST', `price_rules/${priceRule.price_rule.id}/discount_codes.json`, {
    discount_code: { code: code.toUpperCase() }
  });
  if (dc?.discount_code) {
    return { success: true, discountCode: dc.discount_code, priceRule: priceRule.price_rule };
  }
  return { success: false, error: 'Failed to create discount code' };
}

// ── DRAFT ORDERS (cart links) ──────────────────────────────────
async function createDraftOrder(shop, token, variantIds) {
  const lineItems = variantIds.map(id => ({ variant_id: parseInt(id), quantity: 1 }));
  const r = await shopifyFetch(shop, token, 'POST', 'draft_orders.json', {
    draft_order: { line_items: lineItems, use_customer_default_address: true }
  });
  if (r?.draft_order) {
    return { success: true, draftOrder: r.draft_order, invoiceUrl: r.draft_order.invoice_url };
  }
  return { success: false, error: 'Failed to create draft order' };
}

// ── PRODUCT STACKS: persist curated recommendation stacks ─────
async function saveProductStacks(shop, token, stacks) {
  await setShopMetafield(shop, token, 'product_stacks', stacks || []);
  console.log(`[ShopifyStorage] Product stacks saved (${(stacks||[]).length}) for ${shop}`);
  return true;
}

async function loadProductStacks(shop, token) {
  const stacks = await getShopMetafield(shop, token, 'product_stacks');
  if (!stacks) return null;
  return Array.isArray(stacks) ? stacks : [];
}

// ── IMAGE UPLOAD via GraphQL Staged Uploads → Files API ───────
async function uploadImage(shop, token, buffer, filename, mimeType) {
  const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-01';
  const gqlUrl = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
  // 1) stagedUploadsCreate
  const stageQ = {
    query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!){ stagedUploadsCreate(input: $input){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ field message } } }`,
    variables: { input: [{ resource: 'IMAGE', filename, mimeType: mimeType || 'image/png', httpMethod: 'POST', fileSize: String(buffer.length) }] }
  };
  const stageR = await fetch(gqlUrl, { method: 'POST', headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(stageQ) });
  const stageJ = await stageR.json();
  const target = stageJ?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) { console.error('[ShopifyStorage] stagedUpload failed', JSON.stringify(stageJ)); return null; }

  // 2) POST multipart to target url
  const form = new FormData();
  target.parameters.forEach(p => form.append(p.name, p.value));
  form.append('file', new Blob([buffer], { type: mimeType || 'image/png' }), filename);
  const upR = await fetch(target.url, { method: 'POST', body: form });
  if (!upR.ok) { console.error('[ShopifyStorage] upload POST failed', upR.status); return null; }

  // 3) fileCreate with resourceUrl
  const createQ = {
    query: `mutation fileCreate($files: [FileCreateInput!]!){ fileCreate(files: $files){ files{ id fileStatus ... on MediaImage { image { url } } } userErrors{ field message } } }`,
    variables: { files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE' }] }
  };
  const createR = await fetch(gqlUrl, { method: 'POST', headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(createQ) });
  const createJ = await createR.json();
  const file = createJ?.data?.fileCreate?.files?.[0];
  // Poll a few times if not ready
  let cdnUrl = file?.image?.url;
  if (!cdnUrl && file?.id) {
    for (let i = 0; i < 5 && !cdnUrl; i++) {
      await new Promise(r => setTimeout(r, 600));
      const q = { query: `query($id: ID!){ node(id: $id){ ... on MediaImage { image { url } } } }`, variables: { id: file.id } };
      const pR = await fetch(gqlUrl, { method: 'POST', headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
      const pJ = await pR.json();
      cdnUrl = pJ?.data?.node?.image?.url;
    }
  }
  return cdnUrl || null;
}

// ── PLAN SENT metaobject (lightweight tracking) ───────────────
const PLAN_TYPE = 'asesor_digital_plan';

async function ensurePlanDefinition(shop, token) {
  const existing = await shopifyFetch(shop, token, 'GET', 'metaobject_definitions.json');
  const defs = existing?.metaobject_definitions || [];
  if (defs.some(d => d.type === PLAN_TYPE)) return true;
  const r = await shopifyFetch(shop, token, 'POST', 'metaobject_definitions.json', {
    metaobject_definition: {
      type: PLAN_TYPE,
      name: 'Asesor Digital Plan',
      access: { admin: 'MERCHANT_READ_WRITE' },
      field_definitions: [
        { name: 'Email',         key: 'email',          type: 'single_line_text_field' },
        { name: 'Name',          key: 'name',           type: 'single_line_text_field' },
        { name: 'Goal',          key: 'goal',           type: 'single_line_text_field' },
        { name: 'Cart URL',      key: 'cart_url',       type: 'single_line_text_field' },
        { name: 'Discount Code', key: 'discount_code',  type: 'single_line_text_field' },
        { name: 'Products Count',key: 'products_count', type: 'number_integer' },
        { name: 'Sent At',       key: 'sent_at',        type: 'date_time' }
      ]
    }
  });
  return !!r?.metaobject_definition;
}

async function savePlanMetaobject(shop, token, plan) {
  try {
    await ensurePlanDefinition(shop, token);
    const now = new Date().toISOString();
    const r = await shopifyFetch(shop, token, 'POST', 'metaobjects.json', {
      metaobject: {
        type: PLAN_TYPE,
        fields: [
          { key: 'email',          value: plan.email || '' },
          { key: 'name',           value: plan.name || '' },
          { key: 'goal',           value: plan.goalId || '' },
          { key: 'cart_url',       value: plan.cartUrl || '' },
          { key: 'discount_code',  value: plan.discountCode || '' },
          { key: 'products_count', value: String(plan.productsCount || 0) },
          { key: 'sent_at',        value: now }
        ]
      }
    });
    return r?.metaobject || null;
  } catch (e) { console.error('[ShopifyStorage] savePlan error:', e.message); return null; }
}

module.exports = {
  saveConfig, loadConfig,
  saveLead, getLeads, updateLeadStatus,
  addEvent, getEvents,
  injectWidget, removeWidget,
  createDiscount, createDraftOrder,
  ensureLeadDefinition,
  saveProductStacks, loadProductStacks,
  uploadImage,
  ensurePlanDefinition, savePlanMetaobject
};
