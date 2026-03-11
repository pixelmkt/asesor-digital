/* ═══════════════════════════════════════════════════
   Asesor Digital — Embeddable Widget
   Usage: <script src="https://your-url/widget.js"></script>
   ═══════════════════════════════════════════════════ */
(function(){
'use strict';
const SCRIPT=document.currentScript;
const BASE=SCRIPT?SCRIPT.src.replace('/widget.js',''):'';
const SES_KEY='_ad_ses';
let sid=localStorage.getItem(SES_KEY);
if(!sid){sid='s_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);localStorage.setItem(SES_KEY,sid);}
let cfg=null,messages=[],open=false;

async function init(){
  try{const r=await fetch(BASE+'/api/widget/config');cfg=await r.json();}catch(e){console.error('[AsesorDigital] Config load failed');return;}
  if(!cfg||!cfg.widget)return;
  injectStyles();buildUI();
  track('page_view',{url:location.href});
}

function track(type,data){
  try{const p=JSON.stringify({type,sessionId:sid,data:data||{},timestamp:new Date().toISOString(),page:location.pathname});
  if(navigator.sendBeacon)navigator.sendBeacon(BASE+'/api/track/event',new Blob([p],{type:'application/json'}));
  else fetch(BASE+'/api/track/event',{method:'POST',headers:{'Content-Type':'application/json'},body:p,keepalive:true}).catch(()=>{});
  }catch(e){}
}

function injectStyles(){
  const w=cfg.widget;
  const css=`
  #ad-widget-wrap{position:fixed;${w.position==='left'?'left':'right'}:20px;bottom:${w.bottomOffset||20}px;z-index:99999;font-family:'Inter',system-ui,sans-serif;}
  #ad-fab{width:56px;height:56px;border-radius:50%;background:${w.primaryColor||'#d32f2f'};color:#fff;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;transition:transform .2s;}
  #ad-fab:hover{transform:scale(1.08);}
  #ad-fab svg{width:24px;height:24px;}
  #ad-chat{display:none;width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 100px);background:${w.bgColor||'#fff'};border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);flex-direction:column;overflow:hidden;border:1px solid #e5e7eb;position:absolute;bottom:70px;${w.position==='left'?'left':'right'}:0;}
  #ad-chat.open{display:flex;}
  #ad-header{background:${w.primaryColor||'#d32f2f'};padding:16px 18px;display:flex;align-items:center;gap:10px;flex-shrink:0;}
  #ad-header-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;overflow:hidden;}
  #ad-header-avatar img{width:100%;height:100%;object-fit:cover;}
  #ad-header-info{flex:1;}
  #ad-header-name{color:#fff;font-size:14px;font-weight:700;}
  #ad-header-sub{color:rgba(255,255,255,.7);font-size:11px;font-weight:500;}
  #ad-close{background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;font-size:18px;padding:4px;}
  #ad-close:hover{color:#fff;}
  #ad-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;}
  .ad-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;word-break:break-word;animation:adFadeIn .2s;}
  .ad-msg.bot{background:#f3f4f6;color:#1f2937;border-bottom-left-radius:4px;align-self:flex-start;}
  .ad-msg.user{background:${w.primaryColor||'#d32f2f'};color:#fff;border-bottom-right-radius:4px;align-self:flex-end;}
  .ad-typing{display:flex;gap:4px;padding:12px 14px;align-self:flex-start;}
  .ad-typing span{width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:adBounce .6s infinite alternate;}
  .ad-typing span:nth-child(2){animation-delay:.2s;}.ad-typing span:nth-child(3){animation-delay:.4s;}
  #ad-chips{display:flex;gap:6px;padding:0 16px 12px;flex-wrap:wrap;}
  .ad-chip{padding:6px 12px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;font-size:12px;color:#374151;cursor:pointer;transition:all .12s;font-family:inherit;}
  .ad-chip:hover{border-color:${w.primaryColor||'#d32f2f'};color:${w.primaryColor||'#d32f2f'};}
  #ad-input-wrap{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff;}
  #ad-input{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;font-family:inherit;color:#1f2937;}
  #ad-input:focus{border-color:${w.primaryColor||'#d32f2f'};}
  #ad-input::placeholder{color:#9ca3af;}
  #ad-send{width:36px;height:36px;border-radius:8px;background:${w.primaryColor||'#d32f2f'};color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .12s;}
  #ad-send:hover{filter:brightness(.9);}
  #ad-send:disabled{opacity:.4;cursor:not-allowed;}
  @keyframes adFadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
  @keyframes adBounce{from{transform:translateY(0);}to{transform:translateY(-6px);}}
  `;
  const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);
}

function buildUI(){
  const w=cfg.widget;
  const wrap=document.createElement('div');wrap.id='ad-widget-wrap';
  const avatarHTML=w.avatar?`<img src="${w.avatar}" alt="">`:`<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;

  wrap.innerHTML=`
  <div id="ad-chat">
    <div id="ad-header">
      <div id="ad-header-avatar">${avatarHTML}</div>
      <div id="ad-header-info"><div id="ad-header-name">${esc(w.name||'Asesor Digital')}</div><div id="ad-header-sub">${esc(w.headerTitle||'Tu asesor experto')}</div></div>
      <button id="ad-close" onclick="document.getElementById('ad-chat').classList.remove('open')">&times;</button>
    </div>
    <div id="ad-messages"></div>
    <div id="ad-chips"></div>
    <div id="ad-input-wrap">
      <input type="text" id="ad-input" placeholder="Escribe tu consulta...">
      <button id="ad-send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9Z"/></svg></button>
    </div>
  </div>
  <button id="ad-fab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></button>`;

  document.body.appendChild(wrap);

  // Events
  document.getElementById('ad-fab').addEventListener('click',()=>{
    open=!open;document.getElementById('ad-chat').classList.toggle('open',open);
    if(open&&!messages.length){addBot(w.greeting||'Hola, soy tu asesor digital. ¿En que puedo ayudarte?');renderChips();track('chat_open');}
  });
  document.getElementById('ad-send').addEventListener('click',sendMessage);
  document.getElementById('ad-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey)sendMessage();});
}

function renderChips(){
  const chips=cfg.widget.chips||[];if(!chips.length)return;
  const c=document.getElementById('ad-chips');
  c.innerHTML=chips.map(ch=>`<button class="ad-chip">${esc(ch)}</button>`).join('');
  c.querySelectorAll('.ad-chip').forEach(btn=>{btn.addEventListener('click',()=>{
    document.getElementById('ad-input').value=btn.textContent;sendMessage();c.innerHTML='';
  });});
}

function addBot(text){messages.push({role:'assistant',content:text});renderMessages();}
function addUser(text){messages.push({role:'user',content:text});renderMessages();}

function renderMessages(){
  const c=document.getElementById('ad-messages');
  c.innerHTML=messages.map(m=>`<div class="ad-msg ${m.role==='user'?'user':'bot'}">${formatMsg(m.content)}</div>`).join('');
  c.scrollTop=c.scrollHeight;
}

function formatMsg(text){
  return esc(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
}

function showTyping(){
  const c=document.getElementById('ad-messages');
  c.innerHTML+=`<div class="ad-typing" id="ad-typing"><span></span><span></span><span></span></div>`;
  c.scrollTop=c.scrollHeight;
}
function hideTyping(){const t=document.getElementById('ad-typing');if(t)t.remove();}

async function sendMessage(){
  const input=document.getElementById('ad-input');
  const text=input.value.trim();if(!text)return;
  input.value='';
  addUser(text);
  document.getElementById('ad-chips').innerHTML='';
  track('message_sent',{length:text.length});
  extractLead(text);

  const sendBtn=document.getElementById('ad-send');sendBtn.disabled=true;
  showTyping();

  try{
    const r=await fetch(BASE+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:messages.filter(m=>m.role),sessionId:sid})});
    const d=await r.json();
    hideTyping();
    if(d.response)addBot(d.response); else addBot('Lo siento, no pude procesar tu consulta.');
  }catch(e){hideTyping();addBot('Error de conexion. Intenta de nuevo.');}
  sendBtn.disabled=false;document.getElementById('ad-input').focus();
}

// Lead extraction
const emailRx=/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const phoneRx=/(?:\+?51|0)?[\s-]?(?:9\d{2}[\s-]?\d{3}[\s-]?\d{3})/;
let leadData={};
try{leadData=JSON.parse(localStorage.getItem('_ad_lead')||'{}');}catch(e){}

function extractLead(text){
  let changed=false;
  const em=text.match(emailRx);if(em&&!leadData.email){leadData.email=em[0].toLowerCase();changed=true;}
  const ph=text.match(phoneRx);if(ph&&!leadData.phone){leadData.phone=ph[0].replace(/[\s-]/g,'');changed=true;}
  if(!leadData.name&&text.length<40){
    const words=text.split(/\s+/);
    if(words.length<=3&&words.every(w=>w.length>=2&&/^[a-zA-ZáéíóúñÁÉÍÓÚÑ]+$/.test(w))){
      leadData.name=words.map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');changed=true;
    }
  }
  if(changed){localStorage.setItem('_ad_lead',JSON.stringify(leadData));
    if(leadData.email||leadData.phone){
      fetch(BASE+'/api/track/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...leadData,sessionId:sid}),keepalive:true}).catch(()=>{});
    }
  }
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// Start
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,300));
else setTimeout(init,300);
})();
