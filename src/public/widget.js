/* ═══════════════════════════════════════════════════════════════════
   Asesor Digital — Widget v3.0 (March 2026)
   Premium embeddable AI advisor. Zero dependencies, full branding.

   Features:
   ✓ Smooth open/close animation with spring physics
   ✓ Typing indicator with real bounce animation
   ✓ Markdown rendering: bold, italic, lists, links, product cards
   ✓ Structured lead capture flow (name → email → goal)
   ✓ Quick chip suggestions (configurable)
   ✓ Session persistence across page loads
   ✓ Conversation reset button
   ✓ Online status indicator
   ✓ Sound notification on new message (subtle)
   ✓ 100% branding via config: colors, fonts, avatar, position, size
   ✓ Mobile responsive with keyboard-aware positioning
   ✓ Graceful offline fallback
   ✓ Event tracking (page_view, open, message, lead, purchase)
   ✓ Auto lead extraction (email, phone regex + guided flow)
   ✓ Product card rendering from response metadata
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Session ──────────────────────────────────────────────────────
  const SCRIPT = document.currentScript || (() => { const s = document.querySelector('script[src*="widget.js"]'); return s; })();
  const BASE = SCRIPT ? SCRIPT.src.replace(/\/widget\.js.*$/, '') : '';
  const STORE_KEY = '_ad_v3_';
  const SES_KEY = STORE_KEY + 'session';
  const LEAD_KEY = STORE_KEY + 'lead';
  const HIST_KEY = STORE_KEY + 'hist';

  let sid = localStorage.getItem(SES_KEY);
  if (!sid) { sid = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(SES_KEY, sid); }

  let cfg = null;
  let messages = [];
  let leadData = {};
  let isOpen = false;
  let isTyping = false;
  let leadStep = null; // null | 'name' | 'email' | 'goal'
  let msgCount = 0;

  try { leadData = JSON.parse(localStorage.getItem(LEAD_KEY) || '{}'); } catch {}
  try {
    const h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
    if (Array.isArray(h) && h.length) messages = h;
  } catch {}

  // ── Tracking ──────────────────────────────────────────────────────
  function track(type, data) {
    try {
      const payload = JSON.stringify({ type, sessionId: sid, data: data || {}, timestamp: new Date().toISOString(), page: location.pathname, url: location.href });
      if (navigator.sendBeacon) navigator.sendBeacon(BASE + '/api/track/event', new Blob([payload], { type: 'application/json' }));
      else fetch(BASE + '/api/track/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => { });
    } catch {}
  }

  function saveLead(extra) {
    const merged = { ...leadData, ...extra, sessionId: sid };
    localStorage.setItem(LEAD_KEY, JSON.stringify(merged));
    leadData = merged;
    if (merged.email || merged.phone) {
      fetch(BASE + '/api/track/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged), keepalive: true }).catch(() => { });
    }
  }

  function saveHistory() {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(messages.slice(-30))); } catch {}
  }

  // ── Init ──────────────────────────────────────────────────────────
  async function init() {
    try {
      const r = await fetch(BASE + '/api/widget/config', { cache: 'no-store' });
      if (!r.ok) throw new Error('Config ' + r.status);
      cfg = await r.json();
    } catch (e) {
      console.warn('[AsesorDigital] Config failed, using defaults:', e.message);
      cfg = {
        widget: { name: 'Asesor', primaryColor: '#D4502A', secondaryColor: '#1E1E1E', bgColor: '#fff', textColor: '#2C2C2C', position: 'right', greeting: '¡Hola! ¿En qué puedo ayudarte hoy?', chips: [], mode: 'floating', headerTitle: 'Tu asesor experto', avatar: '' },
        behavior: { dataCollection: { enabled: true, fields: ['name', 'email', 'goal'], askAfterMessages: 2 } },
        chatEndpoint: BASE + '/api/chat',
        trackEndpoint: BASE + '/api/track/event'
      };
    }
    injectCSS();
    buildWidget();
    track('widget_shown', { url: location.href });
    track('page_view', { url: location.href });
  }

  // ── CSS ───────────────────────────────────────────────────────────
  function injectCSS() {
    const w = cfg.widget;
    const pri = w.primaryColor || '#D4502A';
    const sec = w.secondaryColor || '#1E1E1E';
    const bg = w.bgColor || '#fff';
    const txt = w.textColor || '#222';
    const pos = w.position === 'left' ? 'left' : 'right';
    const bot = w.bottomOffset || 20;
    const pri_rgb = hexToRgb(pri);
    const sec_rgb = hexToRgb(sec);

    const css = `
#_ad{position:fixed;${pos}:20px;bottom:${bot}px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:14px;line-height:1.5;}
/* FAB */
#_ad-fab{width:62px;height:62px;border-radius:50%;background:linear-gradient(135deg,${pri},${darken(pri,15)});color:#fff;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(${pri_rgb},.45);display:flex;align-items:center;justify-content:center;transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s;outline:none;overflow:hidden;}
#_ad-fab:hover{transform:scale(1.1) translateY(-2px);box-shadow:0 8px 28px rgba(${pri_rgb},.55);}
#_ad-fab:active{transform:scale(.95);}
#_ad-fab svg{width:26px;height:26px;transition:transform .3s ease;}
#_ad-fab._open svg{transform:rotate(90deg);}
#_ad-fab img._ad-fab-icon{width:100%;height:100%;object-fit:cover;border-radius:50%;}
#_ad-fab._open img._ad-fab-icon{display:none;}
/* Pulse ring */
#_ad-fab::after{content:'';position:absolute;width:100%;height:100%;border-radius:50%;border:2px solid ${pri};opacity:0;animation:_ad-pulse 2.5s ease-out infinite;}
@keyframes _ad-pulse{0%{transform:scale(1);opacity:.6;}100%{transform:scale(1.6);opacity:0;}}
/* UNREAD badge */
#_ad-badge{position:absolute;top:-3px;${pos === 'right' ? 'right:-3px' : 'left:-3px'};width:18px;height:18px;background:#ef4444;color:#fff;border-radius:50%;font-size:10px;font-weight:700;display:none;align-items:center;justify-content:center;border:2px solid #fff;}
#_ad-badge.show{display:flex;}
/* WINDOW */
#_ad-win{position:absolute;bottom:72px;${pos}:0;width:370px;max-width:calc(100vw - 24px);height:580px;max-height:calc(100vh - 110px);background:${bg};border-radius:20px;box-shadow:0 16px 60px rgba(${sec_rgb},.22),0 2px 8px rgba(0,0,0,.08);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(0,0,0,.07);transform-origin:bottom ${pos};transition:transform .35s cubic-bezier(.34,1.2,.64,1),opacity .3s ease;transform:scale(.85) translateY(16px);opacity:0;pointer-events:none;}
#_ad-win._open{transform:scale(1) translateY(0);opacity:1;pointer-events:all;}
/* HEADER */
#_ad-hdr{background:linear-gradient(120deg,${sec},${darken(sec,10)});padding:16px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0;}
#_ad-hdr-av{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;border:2px solid rgba(255,255,255,.2);}
#_ad-hdr-av img{width:100%;height:100%;object-fit:cover;}
#_ad-hdr-info{flex:1;min-width:0;}
#_ad-hdr-name{color:#fff;font-size:14px;font-weight:700;letter-spacing:-.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#_ad-hdr-sub{color:rgba(255,255,255,.65);font-size:11px;display:flex;align-items:center;gap:5px;margin-top:2px;}
#_ad-online{width:7px;height:7px;border-radius:50%;background:#22c55e;flex-shrink:0;box-shadow:0 0 6px rgba(34,197,94,.7);}
#_ad-hdr-actions{display:flex;gap:6px;}
#_ad-hdr-actions button{background:rgba(255,255,255,.1);border:none;color:rgba(255,255,255,.75);cursor:pointer;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;transition:background .15s;font-size:14px;padding:0;}
#_ad-hdr-actions button:hover{background:rgba(255,255,255,.2);color:#fff;}
/* MESSAGES */
#_ad-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth;}
#_ad-msgs::-webkit-scrollbar{width:4px;}
#_ad-msgs::-webkit-scrollbar-track{background:transparent;}
#_ad-msgs::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;}
._ad-msg-wrap{display:flex;flex-direction:column;gap:2px;animation:_ad-in .2s ease;}
@keyframes _ad-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
._ad-msg{max-width:84%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.55;word-break:break-word;color:${txt};}
._ad-msg.bot{background:#f4f4f5;border-bottom-left-radius:4px;align-self:flex-start;}
._ad-msg.user{background:linear-gradient(135deg,${pri},${darken(pri,12)});color:#fff;border-bottom-right-radius:4px;align-self:flex-end;}
._ad-msg.bot a{color:${pri};text-decoration:none;font-weight:600;}
._ad-msg.bot a:hover{text-decoration:underline;}
._ad-msg.bot ul{margin:6px 0 0 14px;padding:0;}
._ad-msg.bot li{margin-bottom:3px;}
._ad-msg.bot p{margin:4px 0;}
._ad-msg.bot strong{font-weight:700;color:${darken(txt,10)};}
._ad-time{font-size:10px;color:#bbb;padding:0 4px;}
._ad-time.user{text-align:right;}
/* TYPING */
._ad-typing{display:flex;align-items:center;gap:4px;padding:12px 16px;background:#f4f4f5;border-radius:14px;border-bottom-left-radius:4px;align-self:flex-start;animation:_ad-in .2s ease;}
._ad-typing span{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:_ad-dot .9s ease-in-out infinite;}
._ad-typing span:nth-child(2){animation-delay:.15s;}._ad-typing span:nth-child(3){animation-delay:.3s;}
@keyframes _ad-dot{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-5px);opacity:1;}}
/* PRODUCT CARDS */
._ad-products{display:flex;flex-direction:column;gap:10px;margin-top:10px;width:100%;}
._ad-prod-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;transition:box-shadow .2s,border-color .2s;box-shadow:0 1px 3px rgba(0,0,0,.05);}
._ad-prod-card:hover{border-color:${pri};box-shadow:0 4px 14px rgba(${pri_rgb},.12);}
._ad-prod-top{display:flex;align-items:center;gap:10px;padding:10px;}
._ad-prod-img{width:54px;height:54px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#f4f4f5;}
._ad-prod-meta{flex:1;min-width:0;}
._ad-prod-name{font-size:12.5px;font-weight:700;color:${txt};line-height:1.3;margin-bottom:2px;}
._ad-prod-why{font-size:11px;color:#666;line-height:1.4;margin-bottom:4px;}
._ad-prod-price{font-size:13px;color:${pri};font-weight:800;}
._ad-prod-price-wrap{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:2px;}
._ad-prod-compare{font-size:11px;color:#9ca3af;text-decoration:line-through;font-weight:500;}
._ad-prod-price._ad-sale{color:${pri};font-size:14px;}
._ad-prod-badge{background:#ef4444;color:#fff;font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;letter-spacing:.4px;text-transform:uppercase;}

._ad-prod-actions{display:flex;gap:6px;padding:0 10px 10px;}
._ad-btn-cart{flex:1;background:${pri};color:#fff;border:none;border-radius:7px;padding:7px 10px;font-size:11.5px;font-weight:700;cursor:pointer;transition:filter .15s;}
._ad-btn-cart:hover{filter:brightness(1.1);}
._ad-btn-cart:disabled{opacity:.5;cursor:not-allowed;}
._ad-btn-buy{background:#fff;color:${pri};border:1.5px solid ${pri};border-radius:7px;padding:7px 10px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .15s;}
._ad-btn-buy:hover{background:rgba(${pri_rgb},.06);}
._ad-stack-btn{width:100%;margin-top:4px;background:linear-gradient(135deg,${pri},${darken(pri,15)});color:#fff;border:none;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:filter .15s,transform .1s;}
._ad-stack-btn:hover{filter:brightness(1.08);transform:translateY(-1px);}
._ad-stack-btn:disabled{opacity:.5;cursor:not-allowed;}
._ad-cart-toast{position:fixed;bottom:100px;right:24px;background:#111;color:#fff;padding:10px 16px;border-radius:8px;font-size:12px;font-weight:600;z-index:2147483648;animation:_ad-in .2s ease;pointer-events:none;}
/* GOAL BUTTONS */
._ad-goal-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 14px 12px;width:100%;}
._ad-goal-btn{display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:10px;border:1.5px solid #e5e7eb;background:#fff;font-size:12px;color:#333;cursor:pointer;transition:all .15s;font-weight:600;white-space:nowrap;}
._ad-goal-btn:hover{border-color:${pri};color:${pri};background:rgba(${pri_rgb},.04);transform:translateY(-1px);box-shadow:0 3px 10px rgba(${pri_rgb},.12);}
._ad-goal-icon{font-size:16px;}
/* CHIPS */
#_ad-chips{display:flex;gap:6px;padding:0 14px 12px;flex-wrap:wrap;}
._ad-chip{padding:6px 13px;border-radius:999px;border:1.5px solid #e5e7eb;background:#fff;font-size:12px;color:#444;cursor:pointer;transition:all .15s;white-space:nowrap;}
._ad-chip:hover{border-color:${pri};color:${pri};background:rgba(${pri_rgb},.05);}
/* INPUT */
#_ad-inp-wrap{display:flex;align-items:flex-end;gap:8px;padding:12px 14px;border-top:1px solid #f0f0f0;background:${bg};flex-shrink:0;}
#_ad-inp{flex:1;border:1.5px solid #e5e7eb;border-radius:10px;padding:9px 12px;font-size:13px;outline:none;font-family:inherit;color:${txt};resize:none;max-height:100px;line-height:1.4;transition:border .15s;background:${bg};}
#_ad-inp:focus{border-color:${pri};}
#_ad-inp::placeholder{color:#b0b0b0;}
#_ad-send{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,${pri},${darken(pri,12)});color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s,filter .15s;}
#_ad-send:hover{filter:brightness(1.08);transform:scale(1.05);}
#_ad-send:disabled{opacity:.4;cursor:not-allowed;transform:none;}
/* LEAD CAPTURE HINT */
._ad-lead-hint{background:rgba(${pri_rgb},.06);border:1px solid rgba(${pri_rgb},.2);border-radius:10px;padding:10px 12px;font-size:12px;color:#555;margin-top:4px;line-height:1.5;}
/* Powered by */
#_ad-footer{text-align:center;padding:4px 0 8px;font-size:10px;color:#ccc;letter-spacing:.3px;}
/* Stickers */
._ad-stickers{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-self:flex-start;}
._ad-sticker{width:96px;height:96px;border-radius:16px;object-fit:contain;background:#fafafa;padding:4px;animation:_ad-pop .35s cubic-bezier(.34,1.56,.64,1);}
@keyframes _ad-pop{from{transform:scale(.5);opacity:0;}to{transform:scale(1);opacity:1;}}
/* Action buttons (WhatsApp, Plan) */
._ad-actions{display:flex;flex-direction:column;gap:8px;margin-top:10px;width:100%;}
._ad-wa-btn{background:#25D366;color:#fff;border:none;border-radius:10px;padding:10px 14px;font-size:12.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:filter .15s,transform .1s;text-decoration:none;}
._ad-wa-btn:hover{filter:brightness(1.08);transform:translateY(-1px);}
._ad-plan-btn{background:linear-gradient(135deg,${pri},${darken(pri,15)});color:#fff;border:none;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:filter .15s,transform .1s;}
._ad-plan-btn:hover{filter:brightness(1.1);transform:translateY(-1px);}
._ad-plan-btn:disabled{opacity:.6;cursor:not-allowed;}
._ad-plan-form{margin-top:8px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;}
._ad-plan-form input{border:1.5px solid #e5e7eb;border-radius:8px;padding:9px 11px;font-size:12.5px;outline:none;font-family:inherit;}
._ad-plan-form input:focus{border-color:${pri};}
._ad-plan-form-row{display:flex;gap:6px;}
._ad-plan-form-row .save{flex:1;background:${pri};color:#fff;border:none;border-radius:8px;padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer;}
._ad-plan-form-row .cancel{background:#fff;color:#888;border:1.5px solid #e5e7eb;border-radius:8px;padding:9px 12px;font-size:12px;cursor:pointer;}
._ad-plan-form-status{font-size:11px;color:#666;text-align:center;}
/* Inline (embedded section) mode */
#_ad._inline{position:relative;right:auto;left:auto;bottom:auto;width:100%;max-width:720px;margin:0 auto;}
#_ad._inline #_ad-fab{display:none;}
#_ad._inline #_ad-win{position:relative;bottom:auto;${pos}:auto;width:100%;max-width:100%;height:620px;max-height:80vh;transform:none;opacity:1;pointer-events:all;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);}
/* Mobile */
@media(max-width:420px){
  #_ad-win{width:calc(100vw - 16px);${pos}:8px;height:calc(100vh - 80px);border-radius:16px 16px 0 0;bottom:66px;}
  ._ad-sticker{width:80px;height:80px;}
}
`;
    const el = document.createElement('style');
    el.id = '_ad-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ── Mount target (floating default OR inline when mode='inline' or container present) ──
  function getInlineTarget() {
    // priority: data-asesor-mount attribute on script, document.querySelector('[data-asesor-embed]'), or cfg.widget.mode==='inline'
    const scriptMode = SCRIPT && SCRIPT.dataset && SCRIPT.dataset.mode;
    const mount = SCRIPT && SCRIPT.dataset && SCRIPT.dataset.mount;
    if (mount) {
      const el = document.querySelector(mount);
      if (el) return el;
    }
    const embed = document.querySelector('[data-asesor-embed]');
    if (embed) return embed;
    if ((cfg?.widget?.mode === 'inline') || scriptMode === 'inline') {
      // Create a default container at the current script position or body end
      const box = document.createElement('div');
      box.id = '_ad-inline-box';
      box.style.cssText = 'width:100%;max-width:720px;margin:24px auto;display:block;';
      if (SCRIPT && SCRIPT.parentNode) SCRIPT.parentNode.insertBefore(box, SCRIPT.nextSibling);
      else document.body.appendChild(box);
      return box;
    }
    return null;
  }

  // ── UI Builder ────────────────────────────────────────────────────
  function buildWidget() {
    const w = cfg.widget;
    const pri = w.primaryColor || '#D4502A';

    // Container
    const wrap = document.createElement('div');
    wrap.id = '_ad';

    // Avatar HTML
    const avHTML = w.avatar
      ? `<img src="${esc(w.avatar)}" alt="${esc(w.name || 'Asesor')}">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="22" height="22"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    // FAB icon (chat bubble)
    const fabSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="26" height="26"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
    const closeSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" width="22" height="22"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    const resetSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

    // FAB icon — custom image/GIF or default SVG
    const fabContent = w.fabIcon
      ? `<img class="_ad-fab-icon" src="${esc(w.fabIcon)}" alt="Chat" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span style="display:none">${fabSVG}</span>`
      : fabSVG;

    wrap.innerHTML = `
<div id="_ad-win" role="dialog" aria-label="${esc(w.name || 'Asesor Digital')}">
  <div id="_ad-hdr">
    <div id="_ad-hdr-av">${avHTML}</div>
    <div id="_ad-hdr-info">
      <div id="_ad-hdr-name">${esc(w.name || 'Asesor Digital')}</div>
      <div id="_ad-hdr-sub"><span id="_ad-online"></span>${esc(w.headerTitle || 'Tu asesor experto')}</div>
    </div>
    <div id="_ad-hdr-actions">
      <button id="_ad-reset" title="Nueva conversacion" aria-label="Reiniciar chat">${resetSVG}</button>
      <button id="_ad-close-btn" title="Cerrar" aria-label="Cerrar chat">${closeSVG}</button>
    </div>
  </div>
  <div id="_ad-msgs" role="log" aria-live="polite"></div>
  <div id="_ad-chips"></div>
  <div id="_ad-inp-wrap">
    <textarea id="_ad-inp" placeholder="Escribe aqui..." rows="1" aria-label="Mensaje"></textarea>
    <button id="_ad-send" aria-label="Enviar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9Z"/></svg>
    </button>
  </div>
  <div id="_ad-footer">Asesor Digital</div>
</div>
<button id="_ad-fab" aria-label="Abrir chat">
  ${fabContent}
  <div id="_ad-badge"></div>
</button>`;

    const inlineTarget = getInlineTarget();
    if (inlineTarget) {
      wrap.classList.add('_inline');
      inlineTarget.appendChild(wrap);
      // Force open in inline mode
      setTimeout(() => {
        const win = wrap.querySelector('#_ad-win');
        if (win) win.classList.add('_open');
        isOpen = true;
        if (!messages.length) {
          const greeting = cfg.widget.greeting || 'Hola, soy tu asesor personal. Cual es tu objetivo principal?';
          pushBot(greeting);
          setTimeout(() => showGoalSelector(), 500);
        }
      }, 100);
    } else {
      document.body.appendChild(wrap);
    }
    attachEvents(w);
    autoGrowTextarea();

    // Render existing history if any
    if (messages.length) {
      renderAllMessages();
      scrollBottom();
    }
  }

  function attachEvents(w) {
    const fab = document.getElementById('_ad-fab');
    const win = document.getElementById('_ad-win');
    const closeBtn = document.getElementById('_ad-close-btn');
    const resetBtn = document.getElementById('_ad-reset');
    const sendBtn = document.getElementById('_ad-send');
    const inp = document.getElementById('_ad-inp');

    fab.addEventListener('click', toggleWidget);
    closeBtn.addEventListener('click', closeWidget);
    sendBtn.addEventListener('click', sendMessage);
    resetBtn.addEventListener('click', resetChat);

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inp.addEventListener('input', autoGrowTextarea);

    // Close on outside click
    document.addEventListener('click', e => {
      if (isOpen && !wrap().contains(e.target)) closeWidget();
    }, true);
  }

  function wrap() { return document.getElementById('_ad'); }

  function toggleWidget() {
    if (isOpen) closeWidget();
    else openWidget();
  }

  function openWidget() {
    isOpen = true;
    const win = document.getElementById('_ad-win');
    const fab = document.getElementById('_ad-fab');
    const badge = document.getElementById('_ad-badge');
    win.classList.add('_open');
    fab.classList.add('_open');
    badge.classList.remove('show');
    if (!messages.length) {
      const greeting = cfg.widget.greeting || '¡Hola! Soy tu asesor personal. ¿Cuál es tu objetivo principal?';
      pushBot(greeting);
      // Show goal selector buttons on first open
      setTimeout(() => showGoalSelector(), 500);
      track('chat_open', {});
    }
    setTimeout(() => { const inp = document.getElementById('_ad-inp'); if (inp) inp.focus(); }, 350);
    scrollBottom();
  }

  const GOALS = [
    { id: 'bajar_peso', label: 'Bajar de peso', icon: '🔥' },
    { id: 'ganar_musculo', label: 'Ganar músculo', icon: '💪' },
    { id: 'mas_rendimiento', label: 'Más energía', icon: '⚡' },
    { id: 'salud_general', label: 'Salud general', icon: '🌿' },
    { id: 'principiante', label: 'Soy principiante', icon: '🆕' },
    { id: 'definicion', label: 'Definición', icon: '✨' }
  ];

  function showGoalSelector() {
    if (leadData.goal) return;
    const chips = document.getElementById('_ad-chips');
    if (!chips) return;
    chips.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = '_ad-goal-grid';
    GOALS.forEach(g => {
      const btn = document.createElement('button');
      btn.className = '_ad-goal-btn';
      btn.innerHTML = `<span class="_ad-goal-icon">${g.icon}</span>${g.label}`;
      btn.onclick = () => selectGoal(g);
      grid.appendChild(btn);
    });
    chips.appendChild(grid);
  }

  function selectGoal(g) {
    leadData.goal = g.id;
    leadData.goalLabel = g.label;
    localStorage.setItem(LEAD_KEY, JSON.stringify(leadData));
    // Track goal selection via API
    track('goal_selected', { goal: g.id, label: g.label });
    // Save to lead record
    saveLead({ goal: g.id, goalLabel: g.label });
    // Clear goal chips and show normal chips
    const chips = document.getElementById('_ad-chips');
    if (chips) chips.innerHTML = '';
    // Confirm selection in chat
    pushUser(g.label);
    const pri = cfg?.widget?.primaryColor || '#D4502A';
    setTimeout(() => {
      pushBot(`¡Perfecto! Voy a ayudarte con **${g.label}**. ¿Cuánto tiempo llevas entrenando o qué experiencia tienes?`);
      setTimeout(() => renderChips(), 300);
    }, 600);
  }


  function closeWidget() {
    isOpen = false;
    document.getElementById('_ad-win').classList.remove('_open');
    document.getElementById('_ad-fab').classList.remove('_open');
  }

  function resetChat() {
    messages = [];
    leadStep = null;
    msgCount = 0;
    localStorage.removeItem(HIST_KEY);
    // Reset goal so selector reappears
    delete leadData.goal;
    delete leadData.goalLabel;
    localStorage.setItem(LEAD_KEY, JSON.stringify(leadData));
    document.getElementById('_ad-msgs').innerHTML = '';
    document.getElementById('_ad-chips').innerHTML = '';
    const greeting = cfg.widget.greeting || '¡Hola! Soy tu asesor personal. ¿Cuál es tu objetivo principal?';
    pushBot(greeting);
    setTimeout(() => showGoalSelector(), 400);
    track('chat_reset', {});
  }

  // ── Messages ──────────────────────────────────────────────────────
  function pushBot(text, products, extras) {
    const m = { role: 'assistant', content: text, products: products || null, ts: new Date().toISOString() };
    if (extras && typeof extras === 'object') {
      if (extras.stickers) m.stickers = extras.stickers;
      if (extras.whatsappLink) m.whatsappLink = extras.whatsappLink;
      if (extras.whatsappLabel) m.whatsappLabel = extras.whatsappLabel;
      if (extras.sendPlanRequest) m.sendPlanRequest = extras.sendPlanRequest;
      if (extras.detectedGoal) m.detectedGoal = extras.detectedGoal;
    }
    messages.push(m);
    saveHistory();
    renderLastMessage();
    scrollBottom();
    showUnreadBadge();
  }

  function pushUser(text) {
    messages.push({ role: 'user', content: text, ts: new Date().toISOString() });
    saveHistory();
    renderLastMessage();
    scrollBottom();
  }

  function renderAllMessages() {
    const container = document.getElementById('_ad-msgs');
    container.innerHTML = '';
    messages.forEach(m => appendMsgEl(m, container));
  }

  function renderLastMessage() {
    const container = document.getElementById('_ad-msgs');
    const m = messages[messages.length - 1];
    appendMsgEl(m, container);
  }

  function appendMsgEl(m, container) {
    const isBot = m.role !== 'user';
    const wrap = document.createElement('div');
    wrap.className = '_ad-msg-wrap';

    const msgEl = document.createElement('div');
    msgEl.className = `_ad-msg ${isBot ? 'bot' : 'user'}`;
    msgEl.innerHTML = formatText(m.content || '');
    wrap.appendChild(msgEl);

    // Stickers
    if (isBot && Array.isArray(m.stickers) && m.stickers.length) {
      const sbox = document.createElement('div');
      sbox.className = '_ad-stickers';
      m.stickers.forEach(s => {
        if (!s.url) return;
        const img = document.createElement('img');
        img.className = '_ad-sticker';
        img.src = s.url;
        img.alt = s.name || 'sticker';
        img.loading = 'lazy';
        img.onerror = () => img.remove();
        sbox.appendChild(img);
      });
      if (sbox.children.length) wrap.appendChild(sbox);
    }

    // Product cards + stack button
    if (isBot && m.products && m.products.length) {
      const grid = document.createElement('div');
      grid.className = '_ad-products';
      m.products.forEach(p => { grid.appendChild(buildProductCard(p)); });
      // Add stack button if 2+ products
      if (m.products.length >= 2) {
        grid.appendChild(buildStackButton(m.products));
      }
      wrap.appendChild(grid);
    }

    // Action buttons (WhatsApp + Plan)
    if (isBot && (m.whatsappLink || m.sendPlanRequest)) {
      const actions = document.createElement('div');
      actions.className = '_ad-actions';
      if (m.whatsappLink) {
        const wa = document.createElement('a');
        wa.className = '_ad-wa-btn';
        wa.href = m.whatsappLink;
        wa.target = '_blank';
        wa.rel = 'noopener';
        wa.innerHTML = `<svg viewBox="0 0 24 24" fill="#fff" width="16" height="16"><path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.134-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.629.714.227 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>${esc(m.whatsappLabel || 'Hablar con un asesor en tienda')}`;
        wa.addEventListener('click', () => track('whatsapp_click', { href: m.whatsappLink }));
        actions.appendChild(wa);
      }
      if (m.sendPlanRequest) {
        const btn = document.createElement('button');
        btn.className = '_ad-plan-btn';
        btn.innerHTML = '📧 Recibir mi plan completo por correo';
        const goalId = m.sendPlanRequest.goalId || m.detectedGoal || leadData.goal || null;
        btn.addEventListener('click', () => showPlanForm(actions, goalId, btn));
        actions.appendChild(btn);
      }
      wrap.appendChild(actions);
    }

    // Timestamp
    if (m.ts) {
      const t = document.createElement('div');
      t.className = '_ad-time' + (isBot ? '' : ' user');
      t.textContent = formatTime(m.ts);
      wrap.appendChild(t);
    }

    container.appendChild(wrap);
  }

  function buildProductCard(p) {
    const pri = (cfg.widget || {}).primaryColor || '#D4502A';
    const card = document.createElement('div');
    card.className = '_ad-prod-card';

    const imgSrc = p.image || '';
    const why = p.description || p.why || '';
    const hasVariant = !!(p.variantId || p.shopifyId);
    const varId = p.variantId || p.shopifyId || '';
    const rawPrice   = String(p.price || '').replace(/[S\/\s$,]+/g, '').trim();
    const rawCompare = String(p.compareAtPrice || p.compare_at_price || '').replace(/[S\/\s$,]+/g, '').trim();
    const hasDiscount = rawCompare && parseFloat(rawCompare) > parseFloat(rawPrice);
    const priceText   = rawPrice ? `S/ ${esc(rawPrice)}` : '';
    const compareText = hasDiscount ? `S/ ${esc(rawCompare)}` : '';
    const productUrl = p.url || '#';

    card.innerHTML = `
      <div class="_ad-prod-top">
        ${imgSrc ? `<img class="_ad-prod-img" src="${esc(imgSrc)}" alt="${esc(p.name||'')}" onerror="this.style.display='none'">` : `<div class="_ad-prod-img" style="display:flex;align-items:center;justify-content:center;font-size:22px;">🛍️</div>`}
        <div class="_ad-prod-meta">
          <div class="_ad-prod-name">${esc(p.name || 'Producto')}</div>
          ${why ? `<div class="_ad-prod-why">✓ ${esc(why)}</div>` : ''}
          <div class="_ad-prod-price-wrap">
            ${compareText ? `<span class="_ad-prod-compare">${compareText}</span>` : ''}
            ${priceText ? `<span class="_ad-prod-price${hasDiscount ? ' _ad-sale' : ''}">${priceText}</span>` : ''}
            ${hasDiscount ? `<span class="_ad-prod-badge">OFERTA</span>` : ''}
          </div>
        </div>
      </div>
      <div class="_ad-prod-actions">
        <button class="_ad-btn-cart" data-variant="${esc(varId)}" data-name="${esc(p.name||'')}">🛒 Agregar</button>
        <button class="_ad-btn-buy" data-url="${esc(productUrl)}" data-variant="${esc(varId)}">👁 Ver producto</button>
      </div>`;

    // Agregar al carrito
    card.querySelector('._ad-btn-cart').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '⏳ Agregando...';
      const ok = await addToShopifyCart(varId, p.name);
      btn.textContent = ok ? '✓ Agregado!' : '🛒 Agregar al carrito';
      btn.disabled = false;
      track('product_click', { name: p.name, action: 'add_to_cart' });
    });

    // View / Buy Product
    card.querySelector('._ad-btn-buy').addEventListener('click', (e) => {
      e.stopPropagation();
      track('product_click', { name: p.name, action: 'view_product' });
      if (productUrl && productUrl !== '#') {
        window.open(productUrl, '_blank');
      } else if (varId) {
        window.location.href = `/cart/${varId}:1`;
      }
    });

    return card;
  }

  function buildStackButton(products) {
    const withVariant = products.filter(p => p.variantId || p.shopifyId);
    const shopDomain = cfg.shopDomain || '';
    const btn = document.createElement('button');
    btn.className = '_ad-stack-btn';
    btn.innerHTML = `🛒 Agregar ${withVariant.length > 0 ? withVariant.length : products.length} productos al carrito`;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerHTML = '⏳ Agregando todo...';
      const ok = await addStackToCart(products);
      if (ok) {
        // Create cart permalink for quick checkout
        const cartPermalink = shopDomain && withVariant.length
          ? `https://${shopDomain}/cart/${withVariant.map(p => (p.variantId || p.shopifyId) + ':1').join(',')}`
          : '/cart';
        btn.innerHTML = `✓ Agregado — <a href="${cartPermalink}" target="_blank" style="color:#fff;text-decoration:underline;">Ir al checkout →</a>`;
        track('product_click', { action: 'add_stack', count: products.length });
      } else {
        // Fallback: direct cart permalink
        if (shopDomain && withVariant.length) {
          const permalink = `https://${shopDomain}/cart/${withVariant.map(p => (p.variantId || p.shopifyId) + ':1').join(',')}`;
          window.open(permalink, '_blank');
        } else {
          window.location.href = '/cart';
        }
      }
    });
    return btn;
  }

  async function addToShopifyCart(variantId, name) {
    if (!variantId) {
      showCartToast(`"${name}" — busca en la tienda 🛍️`);
      return false;
    }
    try {
      const r = await fetch('/cart/add.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: parseInt(variantId), quantity: 1 }] })
      });
      if (r.ok) { showCartToast(`"${name}" agregado al carrito ✓`); return true; }
      return false;
    } catch { return false; }
  }

  async function addStackToCart(products) {
    const items = products
      .filter(p => p.variantId || p.shopifyId)
      .map(p => ({ id: parseInt(p.variantId || p.shopifyId), quantity: 1 }));
    if (!items.length) {
      window.location.href = '/cart';
      return false;
    }
    try {
      const r = await fetch('/cart/add.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      if (r.ok) { showCartToast(`${items.length} productos agregados ✓`); return true; }
      window.location.href = '/cart';
      return false;
    } catch { window.location.href = '/cart'; return false; }
  }

  function showPlanForm(container, goalId, triggerBtn) {
    // Don't show twice
    if (container.querySelector('._ad-plan-form')) return;
    if (triggerBtn) triggerBtn.style.display = 'none';
    const form = document.createElement('div');
    form.className = '_ad-plan-form';
    const prefillEmail = leadData.email || '';
    const prefillName = leadData.name || '';
    form.innerHTML = `
      <div style="font-size:12px;color:#555;font-weight:600;">Te armamos el plan completo en PDF con carrito listo y cupon:</div>
      <input type="text" placeholder="Tu nombre" value="${esc(prefillName)}" class="_pn">
      <input type="email" placeholder="tu@correo.com" value="${esc(prefillEmail)}" class="_pe">
      <div class="_ad-plan-form-row">
        <button class="cancel">Cancelar</button>
        <button class="save">Enviar plan</button>
      </div>
      <div class="_ad-plan-form-status"></div>`;
    container.appendChild(form);
    const status = form.querySelector('._ad-plan-form-status');
    form.querySelector('.cancel').addEventListener('click', () => {
      form.remove();
      if (triggerBtn) triggerBtn.style.display = '';
    });
    form.querySelector('.save').addEventListener('click', async () => {
      const name = form.querySelector('._pn').value.trim();
      const to = form.querySelector('._pe').value.trim();
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) { status.textContent = 'Ingresa un correo valido'; status.style.color = '#c00'; return; }
      status.textContent = 'Enviando plan...'; status.style.color = '#666';
      const saveBtn = form.querySelector('.save'); saveBtn.disabled = true;
      try {
        saveLead({ name: name || leadData.name, email: to });
        const r = await fetch(BASE + '/api/plan/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, name, sessionId: sid, goalId, applyDiscount: 10 })
        });
        const data = await r.json();
        if (r.ok && data.success) {
          status.textContent = 'Plan enviado a ' + to + ' ✓'; status.style.color = '#16a34a';
          track('plan_sent', { goalId, to });
          if (data.cartUrl) {
            setTimeout(() => pushBot(`Ya te envie el plan al correo. Mientras tanto, [puedes ver tu carrito listo](${data.cartUrl})${data.discountCode ? ' y usar el cupon **' + data.discountCode + '**' : ''}.`), 800);
          }
        } else {
          status.textContent = 'Error: ' + (data.error || 'no se pudo enviar'); status.style.color = '#c00';
          saveBtn.disabled = false;
        }
      } catch (e) { status.textContent = 'Error de conexion'; status.style.color = '#c00'; saveBtn.disabled = false; }
    });
  }

  function showCartToast(msg) {
    let t = document.getElementById('_ad-cart-toast');
    if (!t) { t = document.createElement('div'); t.id = '_ad-cart-toast'; t.className = '_ad-cart-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
  }

  // ── Typing indicator ─────────────────────────────────────────────
  function showTyping() {
    if (isTyping) return;
    isTyping = true;
    const c = document.getElementById('_ad-msgs');
    const t = document.createElement('div');
    t.id = '_ad-typing-el';
    t.className = '_ad-typing _ad-msg-wrap';
    t.innerHTML = '<span></span><span></span><span></span>';
    c.appendChild(t);
    scrollBottom();
  }

  function hideTyping() {
    isTyping = false;
    const t = document.getElementById('_ad-typing-el');
    if (t) t.remove();
  }

  // ── Chips ─────────────────────────────────────────────────────────
  function renderChips() {
    const chips = (cfg.widget.chips || []).filter(Boolean);
    if (!chips.length) return;
    const container = document.getElementById('_ad-chips');
    container.innerHTML = chips.map((ch, i) =>
      `<button class="_ad-chip" data-i="${i}">${esc(ch)}</button>`
    ).join('');
    container.querySelectorAll('._ad-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.textContent.trim();
        container.innerHTML = '';
        document.getElementById('_ad-inp').value = text;
        sendMessage();
      });
    });
  }

  // ── Lead capture ──────────────────────────────────────────────────
  const emailRx = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const phoneRx = /(?:\+?51[\s-]?)?9\d{2}[\s-]?\d{3}[\s-]?\d{3}/;

  function extractLeadFromText(text) {
    const t = text.trim();
    let changed = false;
    const em = t.match(emailRx);
    if (em && !leadData.email) { saveLead({ email: em[0].toLowerCase() }); changed = true; }
    const ph = t.match(phoneRx);
    if (ph && !leadData.phone) { saveLead({ phone: ph[0].replace(/[\s-]/g, '') }); changed = true; }
    return changed;
  }

  function checkLeadCapture(text) {
    const dc = cfg.behavior?.dataCollection;
    if (!dc || !dc.enabled) return false;
    const fields = dc.fields || ['name', 'email', 'goal'];
    const askAfter = dc.askAfterMessages || 2;
    if (msgCount < askAfter * 2) return false;
    if (fields.includes('name') && !leadData.name && leadStep !== 'name') {
      leadStep = 'name';
      setTimeout(() => pushBot('Para darte una asesoría más personalizada, ¿me podrías decir tu nombre?'), 600);
      return false;
    }
    if (leadStep === 'name' && text.length < 40 && /^[a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+$/.test(text)) {
      saveLead({ name: text.trim() }); leadStep = null; return false;
    }
    if (fields.includes('email') && !leadData.email && leadStep !== 'email') {
      leadStep = 'email';
      setTimeout(() => pushBot(`¡Gracias${leadData.name ? ' ' + leadData.name : ''}! ¿Me podrías compartir tu correo electrónico para enviarte más información?`), 600);
      return false;
    }
    if (leadStep === 'email') {
      const em = text.match(emailRx);
      if (em) { saveLead({ email: em[0].toLowerCase() }); leadStep = null; }
      return false;
    }
    return false;
  }

  // ── Intent detection ──────────────────────────────────────────────
  const INTENT_KEYWORDS = [
    { id: 'bajar_peso',      words: ['bajar de peso','perder peso','adelgazar','quemar grasa','perder grasa','corte','definicion','dieta'] },
    { id: 'ganar_musculo',   words: ['ganar musculo','musculo','masa muscular','hipertrofia','fuerza','volumen','bulk'] },
    { id: 'mas_rendimiento', words: ['rendimiento','energia','resistencia','atletismo','crossfit','correr','triathlon','deportes'] },
    { id: 'salud_general',   words: ['salud','bienestar','vitaminas','inmunidad','dormir','estres','colesterol'] },
    { id: 'principiante',    words: ['principiante','empezar','comenzar','primera vez','nunca he','nuevo en'] }
  ];

  function detectIntent(text) {
    const lower = text.toLowerCase();
    for (const intent of INTENT_KEYWORDS) {
      for (const word of intent.words) {
        if (lower.includes(word)) {
          track('intent_detected', { intent: intent.id, trigger: word, text: text.substring(0, 80) });
          if (!leadData.goal) saveLead({ goal: intent.id, goalLabel: intent.id.replace('_',' ') });
          return intent.id;
        }
      }
    }
    return null;
  }

  // ── Send ──────────────────────────────────────────────────────────
  async function sendMessage() {
    const inp = document.getElementById('_ad-inp');
    const text = inp.value.trim();
    if (!text || isTyping) return;
    inp.value = '';
    autoGrowTextarea();
    document.getElementById('_ad-chips').innerHTML = '';

    pushUser(text);
    msgCount++;
    extractLeadFromText(text);
    detectIntent(text); // track goal intent keywords

    const sendBtn = document.getElementById('_ad-send');
    sendBtn.disabled = true;
    showTyping();
    track('chat_message', { msgCount, goal: leadData.goal || null, hasLead: !!(leadData.email || leadData.name) });

    try {
      const endpoint = cfg.chatEndpoint || (BASE + '/api/chat');
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          sessionId: sid,
          customerEmail: leadData.email || null,
          customerName: leadData.name || null,
          goalContext: leadData.goalLabel ? `El cliente seleccionó su objetivo: ${leadData.goalLabel}` : null
        })
      });

      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();

      hideTyping();
      if (data.error) { pushBot('Hubo un error al conectarme con el asesor. Intenta de nuevo.'); }
      else if (data.response) {
        let responseText = data.response;
        let products = data.products || null;
        // Also parse inline product JSON
        const prodMatch = responseText.match(/<!--PRODUCTS:([\/\S\s]*?)-->/);
        if (prodMatch) { try { products = JSON.parse(prodMatch[1]); responseText = responseText.replace(prodMatch[0], '').trim(); } catch {} }

        // Persist detectedGoal locally so plan form can prefill
        if (data.detectedGoal && !leadData.goal) saveLead({ goal: data.detectedGoal, goalLabel: data.detectedGoal.replace(/_/g,' ') });

        // Resolve WhatsApp label from stored config (async fetch once)
        let waLabel = cfg?.whatsapp?.label || 'Hablar con un asesor en tienda';

        pushBot(responseText, products, {
          stickers: data.stickers || null,
          whatsappLink: data.whatsappLink || null,
          whatsappLabel: waLabel,
          sendPlanRequest: data.sendPlanRequest || null,
          detectedGoal: data.detectedGoal || leadData.goal || null
        });

        // ── REAL-TIME ADD TO CART (Shopify AJAX cart) ──
        if (Array.isArray(data.addToCart) && data.addToCart.length) {
          addToShopifyCart(data.addToCart);
          track('cart_add_live', { count: data.addToCart.length });
        }

        if (data.cartLink) {
          setTimeout(() => pushBot(`🛒 [Ver y pagar mi pedido](${data.cartLink})`), 400);
          track('draft_order_created', { cartLink: data.cartLink });
        }
        if (data.discountCode) track('discount_generated', { code: data.discountCode });
        if (data.stickers?.length) track('sticker_shown', { count: data.stickers.length });
        if (data.whatsappLink) track('whatsapp_offered', {});
        if (data.sendPlanRequest) track('plan_offered', { goalId: data.sendPlanRequest.goalId });

        setTimeout(() => checkLeadCapture(text), 800);
      }
    } catch (e) {
      hideTyping();
      pushBot('No pude conectarme. Verifica tu conexión e intenta de nuevo.');
    }

    sendBtn.disabled = false;
    inp.focus();
  }

  // ── REAL-TIME CART (Shopify AJAX) ─────────────────────────────────
  // Adds items live to the storefront cart and updates header counter.
  // Only works on the actual storefront (where /cart/add.js is hosted by Shopify Liquid).
  // No-op safely if called from admin/embedded preview (fetch will 404).
  async function addToShopifyCart(items) {
    if (!items || !items.length) return;
    const payload = { items: items.map(i => ({ id: parseInt(i.variantId) || i.variantId, quantity: i.quantity || 1 })) };
    try {
      const r = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        // 422 = variant unavailable / out of stock. Show friendly message.
        const err = await r.text();
        showCartToast('No pude agregar — verifica stock', 'err');
        console.warn('[AsesorDigital] /cart/add.js error', r.status, err.substring(0, 120));
        return;
      }
      // Update cart counter elements that storefront themes commonly use
      try {
        const cartR = await fetch('/cart.js', { headers: { 'Accept': 'application/json' } });
        if (cartR.ok) {
          const cart = await cartR.json();
          // Common theme selectors
          document.querySelectorAll('[data-cart-count],.cart-count,#CartCount,.cart-count-bubble span,.cart-link__bubble-num').forEach(el => {
            el.textContent = cart.item_count;
            el.classList.add('cart-count-bubble--visible');
            el.style.display = '';
          });
          // Trigger Shopify's own cart event so other widgets (header drawer, etc.) update
          document.dispatchEvent(new CustomEvent('cart:update', { detail: cart, bubbles: true }));
          window.dispatchEvent(new CustomEvent('cart:refresh', { detail: cart, bubbles: true }));
        }
      } catch (e) { /* counter refresh best effort */ }
      showCartToast(items.length === 1 ? '✓ Agregado al carrito' : `✓ ${items.length} productos agregados al carrito`, 'ok');
    } catch (e) {
      showCartToast('No pude agregar al carrito', 'err');
      console.warn('[AsesorDigital] addToShopifyCart failed:', e.message);
    }
  }
  function showCartToast(text, kind) {
    let t = document.getElementById('_ad-cart-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = '_ad-cart-toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:#1e1e1e;color:#fff;padding:12px 20px;border-radius:8px;font:500 14px Inter,sans-serif;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.3);opacity:0;transition:all .3s cubic-bezier(.4,0,.2,1);pointer-events:none;';
      document.body.appendChild(t);
    }
    t.style.background = kind === 'err' ? '#d4502a' : '#16a34a';
    t.textContent = text;
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)'; });
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2800);
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function scrollBottom() {
    requestAnimationFrame(() => {
      const c = document.getElementById('_ad-msgs');
      if (c) c.scrollTop = c.scrollHeight;
    });
  }

  function showUnreadBadge() {
    if (!isOpen) {
      const b = document.getElementById('_ad-badge');
      if (b) { b.textContent = '1'; b.classList.add('show'); }
    }
  }

  function autoGrowTextarea() {
    const el = document.getElementById('_ad-inp');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  function formatText(text) {
    if (!text) return '';
    let s = esc(text);
    // markdown: bold, italic, lists, dividers
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    s = s.replace(/`(.+?)`/g, '<code style="background:#f4f4f5;padding:1px 5px;border-radius:4px;font-size:12px;">$1</code>');
    // numbered lists
    s = s.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');
    s = s.replace(/^[-•]\s(.+)$/gm, '<li>$1</li>');
    s = s.replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    // Horizontal rule
    s = s.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0;">');
    // URLs as links
    s = s.replace(/(?<![">])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // Line breaks
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    try { return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  }

  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '0,0,0';
    return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
  }

  function darken(hex, pct) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 - pct / 100))));
    return `#${f(r).toString(16).padStart(2, '0')}${f(g).toString(16).padStart(2, '0')}${f(b).toString(16).padStart(2, '0')}`;
  }

  // ── Boot ──────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
  } else {
    setTimeout(init, 200);
  }

})();
