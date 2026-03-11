/* ═══════════════════════════════════════════════════════════════
   Storage v2 — With lead segmentation, goal tagging, and
   full-segment remarketing support
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

// Segment classifier — maps goal text to segment tags
const SEGMENT_RULES = [
  { tag: 'bajar_peso',    keywords: ['bajar','perder','adelgazar','fat loss','reducir grasa','corte','definicion','quemar','flaco','delgado','dieta','peso'] },
  { tag: 'subir_peso',    keywords: ['subir','ganar peso','engordar','aumentar peso','volumen','bulk','voluminizar'] },
  { tag: 'ganar_musculo', keywords: ['musculo','masa muscular','hipertrofia','fuerza','tonificar','definir','ganar musculo','aumentar musculo'] },
  { tag: 'rendimiento',   keywords: ['rendimiento','atletismo','resistencia','velocidad','deporte','competencia','carrera','triathlon','crossfit','funcional'] },
  { tag: 'salud_general', keywords: ['salud','bienestar','energia','vitalidad','inmunidad','dormir','estres','ansiedad','colesterol','diabetes','articulaciones'] },
  { tag: 'principiante',  keywords: ['principiante','nuevo','empezar','comenzar','primera vez','nunca he'] },
  { tag: 'avanzado',      keywords: ['avanzado','competidor','bodybuilder','atleta','experiencia'] }
];

function classifyGoal(goalText = '', conversationText = '') {
  const text = (goalText + ' ' + conversationText).toLowerCase();
  const tags = [];
  for (const rule of SEGMENT_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) tags.push(rule.tag);
  }
  return tags;
}

const DEFAULT_CONFIG = {
  llm: { provider: 'gemini', apiKey: '', model: 'gemini-2.0-flash', temperature: 0.7, maxTokens: 1800 },
  widget: {
    name: 'Asesor Digital', avatar: '', primaryColor: '#D4502A', secondaryColor: '#1E1E1E',
    bgColor: '#ffffff', textColor: '#2C2C2C', position: 'right', bottomOffset: 20,
    greeting: 'Hola, soy tu asesor digital. ¿En que puedo ayudarte?',
    chips: ['Ver productos', 'Necesito asesoria', 'Ofertas'], mode: 'floating', headerTitle: '', poweredBy: 'Asesor Digital'
  },
  behavior: {
    systemPrompt: 'Eres un asesor experto de la tienda. Ayudas a los clientes a encontrar productos, resuelves sus dudas y los guias hacia la compra. Responde siempre en espanol, de forma profesional pero amigable.',
    tone: 'professional', goals: ['sell', 'inform'],
    dataCollection: { enabled: true, fields: ['name', 'email', 'phone', 'goal'], askAfterMessages: 2, style: 'conversational' },
    maxResponseLength: 'medium', showProducts: true, forbiddenTopics: [], customRules: ''
  },
  email: { smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', fromName: 'Asesor Digital', fromEmail: '' },
  shopify: { connected: false, shop: '', accessToken: '', scopes: '' },
  brand: { storeName: '', logo: '', tagline: '', primaryLanguage: 'es', currency: 'PEN', timezone: 'America/Lima' },
  admin: { password: '', setupCompleted: false }
};

let store = { config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)), events: [], leads: [], purchases: [], conversations: [], productStacks: [] };

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

function load() {
  ensureDir();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      store = { ...store, ...data };
      store.config = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), store.config || {});
    }
  } catch (e) { console.error('Store load error:', e.message); }
}

function save() {
  ensureDir();
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2)); }
  catch (e) { console.error('Store save error:', e.message); }
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object') {
      deepMerge(target[key], source[key]);
    } else { target[key] = source[key]; }
  }
  return target;
}

// ── Config ──
function getConfig() { return store.config; }
function getFullConfig() { return store.config; }
function updateConfig(section, data) {
  if (store.config[section]) store.config[section] = { ...store.config[section], ...data };
  else store.config[section] = data;
  save();
  return store.config;
}

// ── Events ──
function addEvent(event) {
  store.events.push({ ...event, id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), timestamp: new Date().toISOString() });
  if (store.events.length > 50000) store.events = store.events.slice(-40000);
  save();
}
function getEvents(filter = {}) {
  let events = store.events;
  if (filter.type) events = events.filter(e => e.type === filter.type);
  if (filter.since) events = events.filter(e => new Date(e.timestamp) >= new Date(filter.since));
  return events;
}

// ── Leads (with auto-segmentation) ──
function addLead(data) {
  // Auto-classify segments from goal text
  const segments = classifyGoal(data.goal || '', data.conversationContext || '');
  const existing = store.leads.find(l => l.email && l.email === data.email);
  if (existing) {
    const mergedSegments = [...new Set([...(existing.segments || []), ...segments])];
    Object.assign(existing, { ...data, segments: mergedSegments, updatedAt: new Date().toISOString() });
    save();
    return existing;
  }
  const lead = { ...data, id: 'lead_' + Date.now().toString(36), status: 'new', segments, createdAt: new Date().toISOString(), purchaseTotal: 0 };
  store.leads.push(lead);
  save();
  return lead;
}

function getLeads(filter = {}) {
  let leads = [...store.leads].reverse();
  if (filter.status) leads = leads.filter(l => l.status === filter.status);
  if (filter.segment) leads = leads.filter(l => (l.segments || []).includes(filter.segment));
  if (filter.hasEmail) leads = leads.filter(l => !!l.email);
  if (filter.search) {
    const q = filter.search.toLowerCase();
    leads = leads.filter(l => (l.name||'').toLowerCase().includes(q) || (l.email||'').toLowerCase().includes(q) || (l.goal||'').toLowerCase().includes(q));
  }
  return leads;
}

function updateLead(id, data) {
  const lead = store.leads.find(l => l.id === id);
  if (lead) {
    // Re-classify if goal updated
    if (data.goal) {
      const newSegs = classifyGoal(data.goal, '');
      data.segments = [...new Set([...(lead.segments || []), ...newSegs])];
    }
    Object.assign(lead, data, { updatedAt: new Date().toISOString() });
    save();
  }
  return lead;
}

function getSegmentCounts() {
  const counts = {};
  for (const rule of SEGMENT_RULES) counts[rule.tag] = 0;
  for (const lead of store.leads) {
    for (const seg of (lead.segments || [])) {
      if (counts[seg] !== undefined) counts[seg]++;
    }
  }
  return counts;
}

function getLeadsBySegment(segment) {
  return store.leads.filter(l => (l.segments || []).includes(segment));
}

// ── Purchases ──
function addPurchase(data) {
  store.purchases.push({ ...data, id: 'pur_' + Date.now().toString(36), timestamp: new Date().toISOString() });
  if (data.sessionId || data.email) {
    const lead = store.leads.find(l => l.sessionId === data.sessionId || (data.email && l.email === data.email));
    if (lead) {
      lead.status = 'purchased';
      lead.purchaseTotal = (lead.purchaseTotal || 0) + (data.total || 0);
      if (!lead.segments) lead.segments = [];
      if (!lead.segments.includes('comprador')) lead.segments.push('comprador');
    }
  }
  save();
}
function getPurchases() { return [...store.purchases].reverse(); }

// ── Conversations ──
function saveConversation(sessionId, messages) {
  const existing = store.conversations.find(c => c.sessionId === sessionId);
  if (existing) { existing.messages = messages; existing.updatedAt = new Date().toISOString(); }
  else store.conversations.push({ sessionId, messages, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (store.conversations.length > 5000) store.conversations = store.conversations.slice(-4000);
  save();
}
function getConversation(sessionId) { return store.conversations.find(c => c.sessionId === sessionId); }

// ── Analytics ──
function getSummary(period = '30d') {
  const now = new Date();
  let since;
  if (period === 'today') since = new Date(now.toDateString());
  else if (period === '7d') since = new Date(now - 7 * 86400000);
  else if (period === '30d') since = new Date(now - 30 * 86400000);
  else since = new Date(0);

  const events = store.events.filter(e => new Date(e.timestamp) >= since);

  // ── Funnel: unique sessionIds per stage ──
  function uniq(evts, types) {
    const arr = Array.isArray(types) ? types : [types];
    return new Set(
      events.filter(e => arr.includes(e.type)).map(e => e.sessionId || e.data?.sessionId).filter(Boolean)
    ).size;
  }

  const impressions = uniq(events, ['page_view', 'widget_shown']);
  const opens      = uniq(events, 'chat_open');
  const engaged    = uniq(events, 'chat_message');
  const leadsCount = store.leads.filter(l => new Date(l.createdAt) >= since).length;
  const prodClicks = events.filter(e => e.type === 'product_click').length;
  const purchases  = store.purchases.filter(p => new Date(p.timestamp) >= since);
  const revenue    = purchases.reduce((s, p) => s + (p.total || p.data?.total || 0), 0);

  // ── Daily breakdown (last 7 days) ──
  const days = {};
  for (let d = new Date(Math.max(since, now - 7 * 86400000)); d <= now; d = new Date(d.getTime() + 86400000)) {
    const key = d.toISOString().split('T')[0];
    days[key] = { date: key, impressions: 0, opens: 0, messages: 0, leads: 0, purchases: 0 };
  }
  events.forEach(e => {
    const key = new Date(e.timestamp).toISOString().split('T')[0];
    if (!days[key]) return;
    if (['page_view', 'widget_shown'].includes(e.type)) days[key].impressions++;
    if (e.type === 'chat_open') days[key].opens++;
    if (e.type === 'chat_message') days[key].messages++;
  });
  store.leads.forEach(l => {
    const key = new Date(l.createdAt).toISOString().split('T')[0];
    if (days[key]) days[key].leads++;
  });
  store.purchases.forEach(p => {
    const key = new Date(p.timestamp).toISOString().split('T')[0];
    if (days[key]) days[key].purchases++;
  });

  const openRate    = impressions > 0 ? Math.round((opens / impressions) * 100) : 0;
  const engageRate  = opens > 0 ? Math.round((engaged / opens) * 100) : 0;
  const leadRate    = engaged > 0 ? Math.round((leadsCount / engaged) * 100) : 0;
  const buyRate     = leadsCount > 0 ? Math.round((purchases.length / leadsCount) * 100) : 0;

  return {
    funnel: {
      impressions,
      opens,
      engaged,
      leads: leadsCount,
      productClicks: prodClicks,
      purchases: purchases.length
    },
    rates: { openRate, engageRate, leadRate, buyRate },
    revenue: { total: revenue, count: purchases.length },
    conversionRate: impressions > 0 ? Math.round((purchases.length / impressions) * 100) : 0,
    // Legacy fields (for backwards compat)
    traffic: { uniqueSessions: impressions, totalEvents: events.length },
    leads: { total: leadsCount },
    purchases: { count: purchases.length, totalRevenue: revenue },
    dailyBreakdown: Object.values(days),
    segments: getSegmentCounts()
  };
}

load();

// ── Product Stacks ──
function getProductStacks() { return store.productStacks || []; }
function addProductStack(data) {
  if (!store.productStacks) store.productStacks = [];
  const stack = { id: 'stk_' + Date.now().toString(36), ...data, products: data.products || [], createdAt: new Date().toISOString() };
  store.productStacks.push(stack); save(); return stack;
}
function updateProductStack(id, data) {
  const s = (store.productStacks || []).find(x => x.id === id);
  if (!s) return null;
  Object.assign(s, data, { id, updatedAt: new Date().toISOString() }); save(); return s;
}
function deleteProductStack(id) {
  store.productStacks = (store.productStacks || []).filter(s => s.id !== id); save();
}
function addProductToStack(stackId, product) {
  const s = (store.productStacks || []).find(x => x.id === stackId); if (!s) return null;
  if (!s.products) s.products = [];
  s.products.push({ ...product, id: 'p_' + Date.now().toString(36) }); save(); return s;
}
function removeProductFromStack(stackId, idx) {
  const s = (store.productStacks || []).find(x => x.id === stackId); if (!s) return null;
  s.products.splice(idx, 1); save(); return s;
}

function setAdminPassword(password) {
  if (!store.config.admin) store.config.admin = {};
  // Simple hash using built-in crypto
  const crypto = require('crypto');
  store.config.admin.password = crypto.createHash('sha256').update(password + 'asesor_salt_2026').digest('hex');
  store.config.admin.setupCompleted = true;
  save();
}
function checkAdminPassword(password) {
  if (!store.config.admin?.password) return true; // No password set = open
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(password + 'asesor_salt_2026').digest('hex');
  return hash === store.config.admin.password;
}
function isAdminSetup() { return !!(store.config.admin?.password); }

module.exports = {
  getConfig, getFullConfig, updateConfig,
  addEvent, getEvents,
  addLead, getLeads, updateLead, getSegmentCounts, getLeadsBySegment,
  addPurchase, getPurchases,
  saveConversation, getConversation,
  getSummary, save, load,
  SEGMENT_RULES, classifyGoal,
  getProductStacks, addProductStack, updateProductStack, deleteProductStack, addProductToStack, removeProductFromStack,
  setAdminPassword, checkAdminPassword, isAdminSetup
};
