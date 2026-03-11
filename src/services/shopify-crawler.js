/* ═══════════════════════════════════════════════════════════════
   Shopify Crawler — Auto-import store data for Knowledge Base
   Products, Collections, Pages, Metaobjects
   ═══════════════════════════════════════════════════════════════ */

const https = require('https');

/**
 * Fetch from Shopify Admin API
 */
function shopifyFetch(shop, token, endpoint, apiVersion = '2025-01') {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: shop,
      path: `/admin/api/${apiVersion}/${endpoint}`,
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Shopify API ${res.statusCode}: ${data.substring(0, 200)}`));
        } else {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Shopify API timeout')); });
    req.end();
  });
}

/**
 * Crawl all products and convert to indexed text
 */
async function crawlProducts(shop, token, apiVersion) {
  const data = await shopifyFetch(shop, token, 'products.json?limit=250&fields=title,body_html,vendor,product_type,tags,variants,handle', apiVersion);
  const products = data.products || [];

  return products.map(p => {
    const variants = (p.variants || []).map(v =>
      `  - ${v.title !== 'Default Title' ? v.title + ': ' : ''}S/ ${v.price}${v.compare_at_price ? ' (antes S/ ' + v.compare_at_price + ')' : ''}${v.available === false ? ' [AGOTADO]' : ''}`
    ).join('\n');

    const desc = (p.body_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    return [
      `PRODUCTO: ${p.title}`,
      p.vendor ? `Marca: ${p.vendor}` : '',
      p.product_type ? `Categoria: ${p.product_type}` : '',
      p.tags ? `Tags: ${p.tags}` : '',
      desc ? `Descripcion: ${desc.substring(0, 800)}` : '',
      variants ? `Variantes y precios:\n${variants}` : '',
      `URL: /products/${p.handle}`
    ].filter(Boolean).join('\n');
  }).join('\n\n════════════════════\n\n');
}

/**
 * Crawl all collections
 */
async function crawlCollections(shop, token, apiVersion) {
  const customs = await shopifyFetch(shop, token, 'custom_collections.json?limit=250&fields=title,body_html,handle', apiVersion).catch(() => ({ custom_collections: [] }));
  const smarts = await shopifyFetch(shop, token, 'smart_collections.json?limit=250&fields=title,body_html,handle', apiVersion).catch(() => ({ smart_collections: [] }));

  const all = [...(customs.custom_collections || []), ...(smarts.smart_collections || [])];

  return all.map(c => {
    const desc = (c.body_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return [
      `COLECCION: ${c.title}`,
      desc ? `Descripcion: ${desc.substring(0, 500)}` : '',
      `URL: /collections/${c.handle}`
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

/**
 * Crawl all pages
 */
async function crawlPages(shop, token, apiVersion) {
  const data = await shopifyFetch(shop, token, 'pages.json?limit=50&fields=title,body_html,handle', apiVersion);
  const pages = data.pages || [];

  return pages.map(p => {
    const body = (p.body_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return [
      `PAGINA: ${p.title}`,
      body ? body.substring(0, 1000) : '[sin contenido]',
      `URL: /pages/${p.handle}`
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

/**
 * Crawl metaobjects (custom data)
 */
async function crawlMetaobjects(shop, token, apiVersion) {
  try {
    const data = await shopifyFetch(shop, token, 'metaobjects.json?limit=100', apiVersion);
    const metaobjects = data.metaobjects || [];

    if (!metaobjects.length) return '';

    return metaobjects.map(mo => {
      const fields = Object.entries(mo.fields || {}).map(([k, v]) => `  ${k}: ${v}`).join('\n');
      return `METAOBJECT [${mo.type}]: ${mo.handle || mo.id}\n${fields}`;
    }).join('\n\n');
  } catch (e) {
    return ''; // Metaobjects may not be available on all plans
  }
}

/**
 * Full store crawl — returns object with text for each section
 */
async function crawlStore(shop, token, apiVersion = '2025-01') {
  const results = {};

  try {
    results.products = await crawlProducts(shop, token, apiVersion);
    console.log(`[Crawler] Products: ${(results.products || '').split('PRODUCTO:').length - 1} items`);
  } catch (e) { console.error('[Crawler] Products error:', e.message); results.products = ''; }

  try {
    results.collections = await crawlCollections(shop, token, apiVersion);
    console.log(`[Crawler] Collections: ${(results.collections || '').split('COLECCION:').length - 1} items`);
  } catch (e) { console.error('[Crawler] Collections error:', e.message); results.collections = ''; }

  try {
    results.pages = await crawlPages(shop, token, apiVersion);
    console.log(`[Crawler] Pages: ${(results.pages || '').split('PAGINA:').length - 1} items`);
  } catch (e) { console.error('[Crawler] Pages error:', e.message); results.pages = ''; }

  try {
    results.metaobjects = await crawlMetaobjects(shop, token, apiVersion);
    console.log(`[Crawler] Metaobjects: done`);
  } catch (e) { console.error('[Crawler] Metaobjects error:', e.message); results.metaobjects = ''; }

  return results;
}

module.exports = { crawlStore, crawlProducts, crawlCollections, crawlPages, crawlMetaobjects };
