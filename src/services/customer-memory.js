/* ═══════════════════════════════════════════════════════════════
   Customer Memory v1 — Asesor Digital
   Persistent customer profiles with conversation memory
   Stores: local JSON + Shopify Customer Metafields backup
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'customer-memory.json');
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-01';

let profiles = {}; // keyed by email

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

function load() {
  ensureDir();
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      profiles = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    }
  } catch (e) { console.error('[Memory] Load error:', e.message); profiles = {}; }
}

function save() {
  ensureDir();
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(profiles, null, 2)); }
  catch (e) { console.error('[Memory] Save error:', e.message); }
}

// ── Get or create customer profile ──
function getProfile(email) {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  return profiles[key] || null;
}

function createProfile(email, data = {}) {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  if (profiles[key]) return profiles[key]; // already exists
  profiles[key] = {
    email: key,
    name: data.name || '',
    goal: data.goal || '',
    goalLabel: data.goalLabel || '',
    experience: data.experience || '', // principiante, intermedio, avanzado
    restrictions: data.restrictions || [], // vegano, lactosa, etc.
    bodyType: data.bodyType || '', // ectomorfo, mesomorfo, endomorfo
    trainingFrequency: data.trainingFrequency || '',
    notes: [], // Dr. Lab's notes about this customer
    conversationSummaries: [], // AI-generated summaries of past sessions
    productsRecommended: [], // products recommended in past sessions
    productsPurchased: [], // products actually purchased
    lastInteraction: new Date().toISOString(),
    firstInteraction: new Date().toISOString(),
    totalSessions: 0,
    shopifyCustomerId: data.shopifyCustomerId || null,
    createdAt: new Date().toISOString()
  };
  save();
  return profiles[key];
}

// ── Update profile with new data ──
function updateProfile(email, data) {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  if (!profiles[key]) createProfile(email);
  const p = profiles[key];

  // Merge data carefully
  if (data.name) p.name = data.name;
  if (data.goal) p.goal = data.goal;
  if (data.goalLabel) p.goalLabel = data.goalLabel;
  if (data.experience) p.experience = data.experience;
  if (data.bodyType) p.bodyType = data.bodyType;
  if (data.trainingFrequency) p.trainingFrequency = data.trainingFrequency;
  if (data.shopifyCustomerId) p.shopifyCustomerId = data.shopifyCustomerId;
  if (data.restrictions) {
    p.restrictions = [...new Set([...(p.restrictions || []), ...data.restrictions])];
  }

  p.lastInteraction = new Date().toISOString();
  save();
  return p;
}

// ── Add a note from Dr. Lab ──
function addNote(email, note) {
  if (!email || !note) return;
  const key = email.toLowerCase().trim();
  if (!profiles[key]) return;
  profiles[key].notes.push({
    text: note,
    date: new Date().toISOString()
  });
  // Keep last 20 notes
  if (profiles[key].notes.length > 20) {
    profiles[key].notes = profiles[key].notes.slice(-20);
  }
  save();
}

// ── Add conversation summary ──
function addConversationSummary(email, summary) {
  if (!email || !summary) return;
  const key = email.toLowerCase().trim();
  if (!profiles[key]) return;
  profiles[key].conversationSummaries.push({
    summary,
    date: new Date().toISOString()
  });
  profiles[key].totalSessions = (profiles[key].totalSessions || 0) + 1;
  // Keep last 10 summaries
  if (profiles[key].conversationSummaries.length > 10) {
    profiles[key].conversationSummaries = profiles[key].conversationSummaries.slice(-10);
  }
  save();
}

// ── Track recommended products ──
function addRecommendedProducts(email, products) {
  if (!email || !products?.length) return;
  const key = email.toLowerCase().trim();
  if (!profiles[key]) return;
  const names = products.map(p => p.name || p.title || '').filter(Boolean);
  profiles[key].productsRecommended = [...new Set([
    ...(profiles[key].productsRecommended || []),
    ...names
  ])].slice(-30);
  save();
}

// ── Track purchased products ──
function addPurchasedProducts(email, products) {
  if (!email || !products?.length) return;
  const key = email.toLowerCase().trim();
  if (!profiles[key]) return;
  profiles[key].productsPurchased = [...new Set([
    ...(profiles[key].productsPurchased || []),
    ...products
  ])].slice(-50);
  save();
}

// ── Generate context for system prompt ──
function getPromptContext(email) {
  const p = getProfile(email);
  if (!p) return '';

  const daysSinceLast = Math.floor((Date.now() - new Date(p.lastInteraction).getTime()) / 86400000);
  let ctx = `\n═══ PERFIL DEL CLIENTE (MEMORIA) ═══\n`;
  ctx += `Nombre: ${p.name || 'No proporcionado'}\n`;
  ctx += `Email: ${p.email}\n`;
  if (p.goal) ctx += `Objetivo: ${p.goalLabel || p.goal}\n`;
  if (p.experience) ctx += `Nivel: ${p.experience}\n`;
  if (p.trainingFrequency) ctx += `Frecuencia de entrenamiento: ${p.trainingFrequency}\n`;
  if (p.restrictions?.length) ctx += `Restricciones: ${p.restrictions.join(', ')}\n`;
  if (p.bodyType) ctx += `Tipo de cuerpo: ${p.bodyType}\n`;
  ctx += `Sesiones anteriores: ${p.totalSessions || 0}\n`;
  ctx += `Días desde última visita: ${daysSinceLast}\n`;

  if (p.productsPurchased?.length) {
    ctx += `Ya compró: ${p.productsPurchased.slice(-10).join(', ')}\n`;
    ctx += `IMPORTANTE: No recomiendes estos productos de nuevo (a menos que se le acaben). Complementa su stack.\n`;
  }
  if (p.productsRecommended?.length) {
    ctx += `Se le recomendó antes: ${p.productsRecommended.slice(-10).join(', ')}\n`;
  }

  // Last conversation summaries (last 3)
  if (p.conversationSummaries?.length) {
    ctx += `\n── Resumen de conversaciones anteriores ──\n`;
    p.conversationSummaries.slice(-3).forEach(s => {
      ctx += `[${s.date.split('T')[0]}]: ${s.summary}\n`;
    });
  }

  // Dr. Lab notes (last 5)
  if (p.notes?.length) {
    ctx += `\n── Notas del Dr. Lab ──\n`;
    p.notes.slice(-5).forEach(n => {
      ctx += `[${n.date.split('T')[0]}]: ${n.text}\n`;
    });
  }

  // Personalized greeting instruction
  if (daysSinceLast > 0 && p.name) {
    ctx += `\n═══ INSTRUCCIÓN DE SALUDO ═══\n`;
    if (daysSinceLast <= 1) {
      ctx += `Salúdalo por nombre. Es un cliente que regresó hoy.\n`;
    } else if (daysSinceLast <= 7) {
      ctx += `Salúdalo por nombre y pregúntale cómo va con sus avances. Han pasado ${daysSinceLast} días desde su última visita.\n`;
    } else if (daysSinceLast <= 30) {
      ctx += `Salúdalo con entusiasmo — han pasado ${daysSinceLast} días. Pregúntale cómo le ha ido y si necesita reabastecer sus suplementos.\n`;
    } else {
      ctx += `¡Un cliente que regresa después de ${daysSinceLast} días! Salúdalo calurosamente, pregúntale cómo le fue y motívalo a retomar.\n`;
    }
  }

  return ctx;
}

// ── Backup profile to Shopify Customer Metafield ──
async function backupToShopify(email, shopDomain, shopToken) {
  const p = getProfile(email);
  if (!p || !shopDomain || !shopToken || !p.shopifyCustomerId) return;

  try {
    // Store compressed profile as customer metafield
    const compressed = {
      goal: p.goal,
      exp: p.experience,
      restr: p.restrictions,
      notes: (p.notes || []).slice(-5).map(n => n.text),
      summaries: (p.conversationSummaries || []).slice(-3).map(s => s.summary),
      purchased: (p.productsPurchased || []).slice(-10),
      sessions: p.totalSessions,
      lastSeen: p.lastInteraction
    };

    await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': shopToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id }
            userErrors { field message }
          }
        }`,
        variables: {
          metafields: [{
            ownerId: `gid://shopify/Customer/${p.shopifyCustomerId}`,
            namespace: 'asesor_digital',
            key: 'profile',
            type: 'json',
            value: JSON.stringify(compressed)
          }]
        }
      })
    });
  } catch (e) {
    console.error('[Memory] Shopify backup error:', e.message);
  }
}

// ── Restore profile from Shopify Customer Metafield ──
async function restoreFromShopify(email, shopDomain, shopToken) {
  if (!email || !shopDomain || !shopToken) return null;
  const key = email.toLowerCase().trim();

  try {
    // Find customer by email
    const searchR = await fetch(
      `https://${shopDomain}/admin/api/${API_VERSION}/customers/search.json?query=email:${encodeURIComponent(key)}&fields=id,first_name,last_name,email,orders_count,total_spent,tags,metafields`,
      { headers: { 'X-Shopify-Access-Token': shopToken } }
    );
    if (!searchR.ok) return null;
    const { customers } = await searchR.json();
    if (!customers?.length) return null;

    const customer = customers[0];

    // Get metafield
    const mfR = await fetch(
      `https://${shopDomain}/admin/api/${API_VERSION}/customers/${customer.id}/metafields.json?namespace=asesor_digital`,
      { headers: { 'X-Shopify-Access-Token': shopToken } }
    );
    let savedProfile = null;
    if (mfR.ok) {
      const { metafields } = await mfR.json();
      const profileMf = (metafields || []).find(m => m.key === 'profile');
      if (profileMf) {
        try { savedProfile = JSON.parse(profileMf.value); } catch {}
      }
    }

    // Get recent orders
    const ordersR = await fetch(
      `https://${shopDomain}/admin/api/${API_VERSION}/customers/${customer.id}/orders.json?status=any&limit=10&fields=line_items,created_at`,
      { headers: { 'X-Shopify-Access-Token': shopToken } }
    );
    let purchasedProducts = [];
    if (ordersR.ok) {
      const { orders } = await ordersR.json();
      purchasedProducts = (orders || []).flatMap(o =>
        (o.line_items || []).map(li => li.title)
      );
    }

    // Create/update local profile with Shopify data
    if (!profiles[key]) createProfile(email, { name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(), shopifyCustomerId: customer.id });
    const p = profiles[key];
    p.shopifyCustomerId = customer.id;
    p.name = p.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

    // Merge Shopify backup
    if (savedProfile) {
      if (savedProfile.goal && !p.goal) p.goal = savedProfile.goal;
      if (savedProfile.exp && !p.experience) p.experience = savedProfile.exp;
      if (savedProfile.restr?.length) p.restrictions = [...new Set([...(p.restrictions || []), ...savedProfile.restr])];
      if (savedProfile.sessions) p.totalSessions = Math.max(p.totalSessions || 0, savedProfile.sessions);
      if (savedProfile.summaries?.length && !p.conversationSummaries?.length) {
        p.conversationSummaries = savedProfile.summaries.map(s => ({ summary: s, date: savedProfile.lastSeen || new Date().toISOString() }));
      }
    }

    // Merge purchased products
    if (purchasedProducts.length) {
      p.productsPurchased = [...new Set([...(p.productsPurchased || []), ...purchasedProducts])];
    }

    save();
    console.log(`[Memory] Restored profile for ${key} from Shopify (customer #${customer.id})`);
    return p;
  } catch (e) {
    console.error('[Memory] Shopify restore error:', e.message);
    return null;
  }
}

// ── List all profiles (for admin) ──
function listProfiles(limit = 50) {
  return Object.values(profiles)
    .sort((a, b) => new Date(b.lastInteraction) - new Date(a.lastInteraction))
    .slice(0, limit);
}

// ── Get profile count ──
function getCount() { return Object.keys(profiles).length; }

load();

module.exports = {
  getProfile, createProfile, updateProfile,
  addNote, addConversationSummary,
  addRecommendedProducts, addPurchasedProducts,
  getPromptContext, backupToShopify, restoreFromShopify,
  listProfiles, getCount
};
