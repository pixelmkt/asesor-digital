/* ═══════════════════════════════════════════════════════════════
   Shopify Crawler v2 — Full store data extraction
   Leverages: read_products, read_content, read_metaobjects,
   read_customers, read_orders, read_inventory, read_themes,
   read_online_store_navigation, read_shipping
   ═══════════════════════════════════════════════════════════════ */

const https = require('https');

function shopifyFetch(shop, token, endpoint, apiVersion = '2025-01') {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: shop,
      path: `/admin/api/${apiVersion}/${endpoint}`,
      method: 'GET',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Shopify ${res.statusCode}: ${data.substring(0, 200)}`));
        else { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function shopifyPost(shop, token, endpoint, body, apiVersion = '2025-01') {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const opts = {
      hostname: shop,
      path: `/admin/api/${apiVersion}/${endpoint}`,
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Shopify POST ${res.statusCode}: ${data.substring(0, 200)}`));
        else { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function shopifyDelete(shop, token, endpoint, apiVersion = '2025-01') {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: shop,
      path: `/admin/api/${apiVersion}/${endpoint}`,
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': token }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode < 400 ? { ok: true } : { error: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Products with inventory ──
async function crawlProducts(shop, token, v) {
  const data = await shopifyFetch(shop, token, 'products.json?limit=250&fields=id,title,body_html,vendor,product_type,tags,variants,handle,images', v);
  const products = data.products || [];
  return products.map(p => {
    const variants = (p.variants || []).map(va =>
      `  - ${va.title !== 'Default Title' ? va.title + ': ' : ''}S/ ${va.price}${va.compare_at_price ? ' (antes S/ ' + va.compare_at_price + ')' : ''}${va.inventory_quantity !== undefined ? ' [Stock: ' + va.inventory_quantity + ']' : ''}`
    ).join('\n');
    const desc = (p.body_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return [
      `PRODUCTO: ${p.title} [ID: ${p.id}]`,
      p.vendor ? `Marca: ${p.vendor}` : '', p.product_type ? `Categoria: ${p.product_type}` : '',
      p.tags ? `Tags: ${p.tags}` : '',
      desc ? `Descripcion: ${desc.substring(0, 800)}` : '',
      variants ? `Variantes y precios:\n${variants}` : '',
      p.images?.[0]?.src ? `Imagen: ${p.images[0].src}` : '',
      `URL: /products/${p.handle}`
    ].filter(Boolean).join('\n');
  }).join('\n\n════════════════════\n\n');
}

// ── Collections ──
async function crawlCollections(shop, token, v) {
  const customs = await shopifyFetch(shop, token, 'custom_collections.json?limit=250&fields=id,title,body_html,handle', v).catch(() => ({ custom_collections: [] }));
  const smarts = await shopifyFetch(shop, token, 'smart_collections.json?limit=250&fields=id,title,body_html,handle', v).catch(() => ({ smart_collections: [] }));
  const all = [...(customs.custom_collections || []), ...(smarts.smart_collections || [])];
  return all.map(c => {
    const desc = (c.body_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return [`COLECCION: ${c.title} [ID: ${c.id}]`, desc ? `Descripcion: ${desc.substring(0, 500)}` : '', `URL: /collections/${c.handle}`].filter(Boolean).join('\n');
  }).join('\n\n');
}

// ── Pages ──
async function crawlPages(shop, token, v) {
  const data = await shopifyFetch(shop, token, 'pages.json?limit=50&fields=title,body_html,handle', v);
  return (data.pages || []).map(p => {
    const body = (p.body_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return [`PAGINA: ${p.title}`, body ? body.substring(0, 1000) : '[sin contenido]', `URL: /pages/${p.handle}`].filter(Boolean).join('\n');
  }).join('\n\n');
}

// ── Metaobjects ──
async function crawlMetaobjects(shop, token, v) {
  try {
    const data = await shopifyFetch(shop, token, 'metaobjects.json?limit=100', v);
    const mos = data.metaobjects || [];
    if (!mos.length) return '';
    return mos.map(mo => {
      const fields = Object.entries(mo.fields || {}).map(([k, val]) => `  ${k}: ${val}`).join('\n');
      return `METAOBJECT [${mo.type}]: ${mo.handle || mo.id}\n${fields}`;
    }).join('\n\n');
  } catch { return ''; }
}

// ── Shipping zones ──
async function crawlShipping(shop, token, v) {
  try {
    const data = await shopifyFetch(shop, token, 'shipping_zones.json', v);
    return (data.shipping_zones || []).map(z => {
      const rates = (z.price_based_shipping_rates || []).concat(z.weight_based_shipping_rates || [])
        .map(r => `  - ${r.name}: S/ ${r.price}${r.min_order_subtotal ? ' (min S/ ' + r.min_order_subtotal + ')' : ''}`).join('\n');
      return `ZONA DE ENVIO: ${z.name}\nPaises: ${(z.countries || []).map(c => c.name).join(', ')}\n${rates || '  Sin tarifas definidas'}`;
    }).join('\n\n');
  } catch { return ''; }
}

// ── Store policies ──
async function crawlPolicies(shop, token, v) {
  try {
    const data = await shopifyFetch(shop, token, 'policies.json', v);
    return (data.policies || []).map(p => {
      const body = (p.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return `POLITICA [${p.title}]: ${body.substring(0, 800)}`;
    }).join('\n\n');
  } catch { return ''; }
}

// ── Full crawl ──
async function crawlStore(shop, token, v = '2025-01') {
  const results = {};
  const tasks = [
    ['products', () => crawlProducts(shop, token, v)],
    ['collections', () => crawlCollections(shop, token, v)],
    ['pages', () => crawlPages(shop, token, v)],
    ['metaobjects', () => crawlMetaobjects(shop, token, v)],
    ['shipping', () => crawlShipping(shop, token, v)],
    ['policies', () => crawlPolicies(shop, token, v)]
  ];
  for (const [key, fn] of tasks) {
    try { results[key] = await fn(); console.log(`[Crawler] ${key}: done`); }
    catch (e) { console.error(`[Crawler] ${key} error:`, e.message); results[key] = ''; }
  }
  return results;
}

// ── Script Tag injection ──
async function injectScriptTag(shop, token, widgetUrl, v = '2025-01') {
  // Remove existing script tags with our URL first
  const existing = await shopifyFetch(shop, token, 'script_tags.json?limit=50', v).catch(() => ({ script_tags: [] }));
  for (const st of (existing.script_tags || [])) {
    if (st.src && st.src.includes('widget.js')) {
      await shopifyDelete(shop, token, `script_tags/${st.id}.json`, v).catch(() => {});
    }
  }
  // Create new
  return shopifyPost(shop, token, 'script_tags.json', { script_tag: { event: 'onload', src: widgetUrl, display_scope: 'online_store' } }, v);
}

async function removeScriptTag(shop, token, v = '2025-01') {
  const existing = await shopifyFetch(shop, token, 'script_tags.json?limit=50', v).catch(() => ({ script_tags: [] }));
  for (const st of (existing.script_tags || [])) {
    if (st.src && st.src.includes('widget.js')) {
      await shopifyDelete(shop, token, `script_tags/${st.id}.json`, v).catch(() => {});
    }
  }
  return { ok: true };
}

// ── Discount code generation ──
async function createDiscountCode(shop, token, opts, v = '2025-01') {
  const { title, code, percentage, startsAt, endsAt } = opts;
  // 1. Create price rule
  const priceRule = await shopifyPost(shop, token, 'price_rules.json', {
    price_rule: {
      title: title || 'Asesor Digital Promo',
      target_type: 'line_item',
      target_selection: 'all',
      allocation_method: 'across',
      value_type: 'percentage',
      value: `-${percentage || 10}`,
      customer_selection: 'all',
      starts_at: startsAt || new Date().toISOString(),
      ends_at: endsAt || null,
      usage_limit: opts.usageLimit || null,
      once_per_customer: true
    }
  }, v);
  // 2. Create discount code under that price rule
  const priceRuleId = priceRule.price_rule?.id;
  if (!priceRuleId) throw new Error('Failed to create price rule');
  const discount = await shopifyPost(shop, token, `price_rules/${priceRuleId}/discount_codes.json`, {
    discount_code: { code: code || 'ASESOR' + Date.now().toString(36).toUpperCase() }
  }, v);
  return { priceRule: priceRule.price_rule, discountCode: discount.discount_code };
}

// ── Customer lookup ──
async function lookupCustomer(shop, token, query, v = '2025-01') {
  const data = await shopifyFetch(shop, token, `customers/search.json?query=${encodeURIComponent(query)}&limit=5`, v);
  return (data.customers || []).map(c => ({
    id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    email: c.email, phone: c.phone, ordersCount: c.orders_count, totalSpent: c.total_spent,
    tags: c.tags, createdAt: c.created_at, note: c.note
  }));
}

// ── Order lookup ──
async function lookupOrders(shop, token, customerId, v = '2025-01') {
  const data = await shopifyFetch(shop, token, `orders.json?customer_id=${customerId}&status=any&limit=10`, v);
  return (data.orders || []).map(o => ({
    id: o.id, name: o.name, totalPrice: o.total_price, status: o.financial_status,
    fulfillment: o.fulfillment_status || 'unfulfilled', createdAt: o.created_at,
    items: (o.line_items || []).map(li => `${li.name} x${li.quantity}`).join(', ')
  }));
}

// ── Draft order creation ──
async function createDraftOrder(shop, token, items, customer, note, v = '2025-01') {
  const lineItems = items.map(i => ({ variant_id: i.variantId, quantity: i.quantity || 1 }));
  const body = { draft_order: { line_items: lineItems, note: note || 'Creado por Asesor Digital' } };
  if (customer?.email) body.draft_order.email = customer.email;
  const result = await shopifyPost(shop, token, 'draft_orders.json', body, v);
  return result.draft_order;
}

module.exports = {
  crawlStore, crawlProducts, crawlCollections, crawlPages, crawlMetaobjects,
  crawlShipping, crawlPolicies,
  injectScriptTag, removeScriptTag,
  createDiscountCode, lookupCustomer, lookupOrders, createDraftOrder,
  shopifyFetch, shopifyPost
};
