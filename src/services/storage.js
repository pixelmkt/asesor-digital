/* ═══════════════════════════════════════════════════════════════
   Storage — File-persisted config, events, leads, conversations
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULT_CONFIG = {
  // LLM settings
  llm: {
    provider: 'gemini',
    apiKey: '',
    model: '',
    temperature: 0.7,
    maxTokens: 1800
  },
  // Widget appearance
  widget: {
    name: 'Asesor Digital',
    avatar: '',
    primaryColor: '#d32f2f',
    secondaryColor: '#1a1a1a',
    bgColor: '#ffffff',
    textColor: '#333333',
    position: 'right',
    bottomOffset: 20,
    greeting: 'Hola, soy tu asesor digital. ¿En que puedo ayudarte?',
    chips: ['Ver productos', 'Necesito asesoria', 'Ofertas'],
    mode: 'floating',
    headerTitle: '',
    poweredBy: 'Asesor Digital'
  },
  // Behavior
  behavior: {
    systemPrompt: 'Eres un asesor experto de la tienda. Ayudas a los clientes a encontrar productos, resuelves sus dudas y los guias hacia la compra. Responde siempre en espanol, de forma profesional pero amigable.',
    tone: 'professional',
    goals: ['sell', 'inform'],
    dataCollection: {
      enabled: true,
      fields: ['name', 'email', 'phone', 'goal'],
      askAfterMessages: 2,
      style: 'conversational'
    },
    maxResponseLength: 'medium',
    showProducts: true,
    forbiddenTopics: [],
    customRules: ''
  },
  // Email
  email: {
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    fromName: 'Asesor Digital',
    fromEmail: ''
  }
};

let store = {
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
  events: [],
  leads: [],
  purchases: [],
  conversations: []
};

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

function load() {
  ensureDir();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      store = { ...store, ...data };
      // Merge config with defaults for any new fields
      store.config = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), store.config || {});
    }
  } catch (e) { console.error('Store load error:', e.message); }
}

function save() {
  ensureDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object') {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// ── Config ──
function getConfig() { return store.config; }
function updateConfig(section, data) {
  if (store.config[section]) store.config[section] = { ...store.config[section], ...data };
  else store.config[section] = data;
  save();
  return store.config;
}
function getFullConfig() { return store.config; }

// ── Events ──
function addEvent(event) {
  store.events.push({ ...event, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), timestamp: new Date().toISOString() });
  if (store.events.length > 50000) store.events = store.events.slice(-40000);
  save();
}
function getEvents(filter = {}) {
  let events = store.events;
  if (filter.type) events = events.filter(e => e.type === filter.type);
  if (filter.since) events = events.filter(e => new Date(e.timestamp) >= new Date(filter.since));
  return events;
}

// ── Leads ──
function addLead(data) {
  const existing = store.leads.find(l => l.email && l.email === data.email);
  if (existing) {
    Object.assign(existing, { ...data, updatedAt: new Date().toISOString() });
  } else {
    store.leads.push({ ...data, id: 'lead_' + Date.now().toString(36), status: 'new', createdAt: new Date().toISOString(), purchaseTotal: 0 });
  }
  save();
  return existing || store.leads[store.leads.length - 1];
}
function getLeads(filter = {}) {
  let leads = [...store.leads].reverse();
  if (filter.status) leads = leads.filter(l => l.status === filter.status);
  if (filter.search) {
    const q = filter.search.toLowerCase();
    leads = leads.filter(l => (l.name||'').toLowerCase().includes(q) || (l.email||'').toLowerCase().includes(q) || (l.phone||'').includes(q));
  }
  return leads;
}
function updateLead(id, data) {
  const lead = store.leads.find(l => l.id === id);
  if (lead) { Object.assign(lead, data, { updatedAt: new Date().toISOString() }); save(); }
  return lead;
}

// ── Purchases ──
function addPurchase(data) {
  store.purchases.push({ ...data, id: 'pur_' + Date.now().toString(36), timestamp: new Date().toISOString() });
  // Update lead if matched
  if (data.sessionId) {
    const lead = store.leads.find(l => l.sessionId === data.sessionId);
    if (lead) { lead.status = 'purchased'; lead.purchaseTotal = (lead.purchaseTotal || 0) + (data.total || 0); }
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
function getConversation(sessionId) {
  return store.conversations.find(c => c.sessionId === sessionId);
}

// ── Analytics ──
function getSummary(period = '30d') {
  const now = new Date();
  let since;
  if (period === 'today') since = new Date(now.toDateString());
  else if (period === '7d') since = new Date(now - 7 * 86400000);
  else if (period === '30d') since = new Date(now - 30 * 86400000);
  else since = new Date(0);

  const events = store.events.filter(e => new Date(e.timestamp) >= since);
  const sessions = new Set(events.filter(e => e.type === 'chat_open' || e.type === 'page_view').map(e => e.data?.sessionId || e.sessionId)).size;
  const leads = store.leads.filter(l => new Date(l.createdAt) >= since);
  const purchases = store.purchases.filter(p => new Date(p.timestamp) >= since);
  const totalRevenue = purchases.reduce((s, p) => s + (p.total || p.data?.total || 0), 0);

  // Daily breakdown
  const days = {};
  for (let d = new Date(since); d <= now; d = new Date(d.getTime() + 86400000)) {
    const key = d.toISOString().split('T')[0];
    days[key] = { date: key, sessions: 0, leads: 0, purchases: 0 };
  }
  events.forEach(e => {
    const key = new Date(e.timestamp).toISOString().split('T')[0];
    if (days[key] && (e.type === 'chat_open' || e.type === 'page_view')) days[key].sessions++;
  });
  leads.forEach(l => {
    const key = new Date(l.createdAt).toISOString().split('T')[0];
    if (days[key]) days[key].leads++;
  });

  return {
    traffic: { uniqueSessions: sessions, totalEvents: events.length },
    leads: { total: leads.length },
    purchases: { count: purchases.length, totalRevenue },
    conversionRate: sessions > 0 ? Math.round((purchases.length / sessions) * 100) : 0,
    dailyBreakdown: Object.values(days).slice(-7)
  };
}

// Init
load();

module.exports = {
  getConfig, updateConfig, getFullConfig,
  addEvent, getEvents,
  addLead, getLeads, updateLead,
  addPurchase, getPurchases,
  saveConversation, getConversation,
  getSummary, save, load
};
