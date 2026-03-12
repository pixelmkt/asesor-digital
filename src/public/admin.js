/* Asesor Digital v2 — Admin Dashboard Logic */
const API=window.location.origin;
let currentPeriod='30d',allLeads=[],selectedIds=new Set();

// Nav
document.querySelectorAll('.nav-item').forEach(a=>{a.addEventListener('click',e=>{e.preventDefault();nav(a.dataset.s);});});
function nav(s){
  document.querySelectorAll('.section').forEach(el=>el.classList.remove('show'));
  document.querySelectorAll('.nav-item').forEach(a=>a.classList.remove('active'));
  const sec=document.getElementById('sec-'+s),n=document.querySelector(`[data-s="${s}"]`);
  if(sec)sec.classList.add('show');if(n)n.classList.add('active');
  if(s==='knowledge')loadKB();if(s==='llm')loadLLMConfig();if(s==='widget')loadWidgetConfig();
  if(s==='behavior')loadBehaviorConfig();if(s==='leads')loadLeads();if(s==='remarketing')loadRemarketing();
  if(s==='settings')loadSettings();if(s==='productos')loadProductos();
}

// Helpers
async function api(path,opts={}){try{const r=await fetch(API+path,{headers:{'Content-Type':'application/json',...opts.headers},...opts});return await r.json();}catch(e){console.error(e);return null;}}
function toast(msg,type=''){const t=document.getElementById('toast');t.textContent=msg;t.className=type;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmtDate(d){if(!d)return'-';const dt=new Date(d);return dt.toLocaleDateString('es-PE',{day:'2-digit',month:'short'})+' '+dt.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});}
function badge(status){const m={new:'b-new',purchased:'b-purchased',remarketed:'b-remarketed',routine_sent:'b-routine'};const l={new:'Nuevo',purchased:'Compro',remarketed:'Remarketed',routine_sent:'Rutina'};return`<span class="badge ${m[status]||'b-new'}">${l[status]||status||'Nuevo'}</span>`;}

// ── DASHBOARD ──
function initPeriod(){
  const c=document.getElementById('period-pills');
  ['today','7d','30d','all'].forEach(p=>{const b=document.createElement('span');b.className='pill'+(p==='30d'?' active':'');b.textContent={today:'Hoy','7d':'7 dias','30d':'30 dias',all:'Todo'}[p];b.onclick=()=>{document.querySelectorAll('.pill').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentPeriod=p;loadDashboard();};c.appendChild(b);});
}
async function loadDashboard(){
  const d=await api(`/api/analytics/summary?period=${currentPeriod}`);if(!d)return;
  const f=d.funnel||{};
  const r=d.rates||{};

  // Stats bar
  document.getElementById('dash-stats').innerHTML=[
    {l:'Impresiones',v:(f.impressions||0).toLocaleString(),c:'var(--blk)'},
    {l:'Aperturas',v:(f.opens||0).toLocaleString()+` <span style="font-size:12px;color:var(--mut);font-weight:500;">(${r.openRate||0}%)</span>`,c:'#2563eb'},
    {l:'Mensajes',v:(f.engaged||0).toLocaleString()+` <span style="font-size:12px;color:var(--mut);font-weight:500;">(${r.engageRate||0}%)</span>`,c:'#7c3aed'},
    {l:'Leads',v:(f.leads||0).toLocaleString()+` <span style="font-size:12px;color:var(--mut);font-weight:500;">(${r.leadRate||0}%)</span>`,c:'var(--red)'},
    {l:'Compras',v:(f.purchases||0).toLocaleString()+` <span style="font-size:12px;color:var(--mut);font-weight:500;">(${r.buyRate||0}%)</span>`,c:'var(--grn)'}
  ].map(s=>`<div class="stat"><div class="stat-val" style="font-size:22px;color:${s.c};">${s.v}</div><div class="stat-lbl">${s.l}</div></div>`).join('');

  // Funnel bar
  const total=f.impressions||1;
  const funnelEl=document.getElementById('chart-daily');
  const stages=[
    {label:'Impresiones',val:f.impressions||0,color:'#e5e7eb'},
    {label:'Aperturas',val:f.opens||0,color:'#3b82f6'},
    {label:'Mensajes',val:f.engaged||0,color:'#8b5cf6'},
    {label:'Leads',val:f.leads||0,color:'var(--red)'},
    {label:'Compras',val:f.purchases||0,color:'var(--grn)'}
  ];
  funnelEl.innerHTML=stages.map(s=>{
    const pct=Math.round((s.val/total)*100);
    const w=total>0?Math.max(4,pct):4;
    return`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <div style="width:80px;font-size:11px;font-weight:600;color:var(--mut);text-align:right;">${s.label}</div>
      <div style="flex:1;background:#f4f4f5;border-radius:4px;overflow:hidden;height:26px;">
        <div style="width:${w}%;height:100%;background:${s.color};border-radius:4px;display:flex;align-items:center;padding:0 8px;transition:width .5s ease;">
          <span style="font-size:11px;font-weight:700;color:${s.color==='#e5e7eb'?'#555':'#fff'};white-space:nowrap;">${s.val.toLocaleString()}</span>
        </div>
      </div>
      <div style="width:36px;font-size:11px;font-weight:700;color:var(--mut);">${pct}%</div>
    </div>`;
  }).join('');

  // KB mini
  const kb=await api('/api/knowledge/stats');
  document.getElementById('kb-mini').innerHTML=kb?`<div style="font-size:12px;color:var(--mut);line-height:2.2;">Fuentes: <strong style="color:var(--blk);">${kb.sources}</strong><br>Chunks: <strong style="color:var(--blk);">${kb.chunks}</strong><br>Palabras: <strong style="color:var(--blk);">${(kb.totalWords||0).toLocaleString()}</strong></div>`:'Sin datos';

  // Recent leads
  const ld=await api('/api/analytics/leads');
  const tb=document.getElementById('recent-leads');tb.innerHTML='';
  (ld?.leads||[]).slice(0,5).forEach(l=>{tb.innerHTML+=`<tr><td style="font-weight:600;">${esc(l.name||'-')}</td><td>${esc(l.email||'-')}</td><td>${esc(l.goal||'-')}</td><td>${badge(l.status)}</td><td style="font-size:11px;color:var(--mut);">${fmtDate(l.createdAt)}</td></tr>`;});
  if(!ld?.leads?.length)tb.innerHTML='<tr><td colspan="5" class="no-data">No hay leads</td></tr>';
  
  // Revenue stat
  if(d.revenue?.total>0){const st=document.getElementById('dash-stats');st.innerHTML+=`<div class="stat"><div class="stat-val" style="font-size:20px;color:var(--grn);">S/ ${(d.revenue.total||0).toFixed(2)}</div><div class="stat-lbl">Ingresos</div></div>`;}
}

// ── KNOWLEDGE BASE ──
async function loadKB(){
  const s=await api('/api/knowledge/stats');if(!s)return;
  document.getElementById('kb-stats-grid').innerHTML=[{l:'Fuentes',v:s.sources},{l:'Chunks',v:s.chunks},{l:'Palabras',v:(s.totalWords||0).toLocaleString()}].map(x=>`<div class="stat"><div class="stat-val">${x.v}</div><div class="stat-lbl">${x.l}</div></div>`).join('');
  const src=await api('/api/knowledge/sources');
  const tb=document.getElementById('kb-sources-table');
  tb.innerHTML=(src?.sources||[]).map(s=>`<tr><td style="font-weight:600;">${esc(s.name)}</td><td>${s.type}</td><td>${s.chunkCount}</td><td>${(s.wordCount||0).toLocaleString()}</td><td style="font-size:11px;color:var(--mut);">${fmtDate(s.createdAt)}</td><td><button class="btn btn-sm btn-g" onclick="deleteSource('${s.id}')">Eliminar</button></td></tr>`).join('');
  if(!src?.sources?.length)tb.innerHTML='<tr><td colspan="6" class="no-data">Sin fuentes. Sube archivo, pega texto o crawlea.</td></tr>';
}
const dz=document.getElementById('drop-zone'),fi=document.getElementById('kb-file');
if(dz){dz.addEventListener('click',()=>fi.click());dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover');});dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragover');if(e.dataTransfer.files[0])uploadFile(e.dataTransfer.files[0]);});fi.addEventListener('change',()=>{if(fi.files[0])uploadFile(fi.files[0]);});}
async function uploadFile(file){const fd=new FormData();fd.append('file',file);const r=await fetch(API+'/api/knowledge/upload',{method:'POST',body:fd});const d=await r.json();if(d.success){toast(d.source.chunkCount+' chunks indexados','ok');loadKB();}else toast(d.error,'err');}
async function addKBText(){const name=document.getElementById('kb-text-name').value,content=document.getElementById('kb-text-content').value;if(!content)return toast('Escribe contenido','err');const r=await api('/api/knowledge/text',{method:'POST',body:JSON.stringify({name:name||'Texto manual',content})});if(r?.success){toast(r.source.chunkCount+' chunks indexados','ok');document.getElementById('kb-text-name').value='';document.getElementById('kb-text-content').value='';loadKB();}else toast(r?.error||'Error','err');}
async function importGoogle(){const url=document.getElementById('gd-url').value.trim(),name=document.getElementById('gd-name').value.trim(),el=document.getElementById('gd-status');if(!url)return toast('Pega una URL de Google','err');el.innerHTML='<div class="info-box warn">Importando...</div>';const r=await api('/api/knowledge/google',{method:'POST',body:JSON.stringify({url,name})});if(r?.success){el.innerHTML=`<div class="info-box ok">Importado: ${r.source.chunkCount} chunks, ${(r.source.wordCount||0).toLocaleString()} palabras</div>`;document.getElementById('gd-url').value='';document.getElementById('gd-name').value='';loadKB();}else{el.innerHTML=`<div class="info-box warn">${esc(r?.error||'Error al importar')}</div>`;toast(r?.error||'Error','err');}}
async function crawlStore(){const btn=document.getElementById('btn-crawl');btn.disabled=true;btn.textContent='Importando...';document.getElementById('crawl-status').innerHTML='<div class="info-box warn">Importando datos de Shopify...</div>';const r=await api('/api/knowledge/crawl',{method:'POST'});btn.disabled=false;btn.textContent='Crawlear tienda';if(r?.success){toast(r.stats.chunks+' chunks totales','ok');document.getElementById('crawl-status').innerHTML=`<div class="info-box ok">${r.sources.length} fuentes importadas, ${r.stats.chunks} chunks indexados</div>`;loadKB();}else{document.getElementById('crawl-status').innerHTML=`<div class="info-box warn">${r?.error||'Conecta Shopify primero'}</div>`;toast(r?.error||'Error','err');}}
async function deleteSource(id){if(!confirm('Eliminar?'))return;await api('/api/knowledge/source/'+id,{method:'DELETE'});toast('Eliminado','ok');loadKB();}

// ── LLM ──
const hints={gemini:'ai.google.dev — clave gratuita',openai:'platform.openai.com',claude:'console.anthropic.com'};
const models={gemini:['gemini-2.0-flash','gemini-2.5-pro-preview-03-25','gemini-2.0-flash-lite','gemini-1.5-flash'],openai:['gpt-4o','gpt-4o-mini','gpt-4-turbo','o1-mini'],claude:['claude-3-7-sonnet-20250219','claude-3-5-haiku-20241022','claude-3-5-sonnet-20241022']};
function onProviderChange(){const p=document.getElementById('llm-provider').value;document.getElementById('llm-hint').textContent=hints[p]||'';const sel=document.getElementById('llm-model');sel.innerHTML='';(models[p]||[]).forEach((m,i)=>{const o=document.createElement('option');o.value=m;o.textContent=m;if(i===0)o.selected=true;sel.appendChild(o);});}
async function loadLLMConfig(){const c=await api('/api/config');if(!c?.llm)return;document.getElementById('llm-provider').value=c.llm.provider||'gemini';onProviderChange();if(c.llm.model)document.getElementById('llm-model').value=c.llm.model;document.getElementById('llm-temp').value=c.llm.temperature||0.7;document.getElementById('t-val').textContent=c.llm.temperature||0.7;document.getElementById('llm-maxtokens').value=c.llm.maxTokens||1800;if(c.llm.apiKey)document.getElementById('llm-apikey').value=c.llm.apiKey;}
async function saveLLMConfig(){const data={provider:document.getElementById('llm-provider').value,model:document.getElementById('llm-model').value,temperature:parseFloat(document.getElementById('llm-temp').value),maxTokens:parseInt(document.getElementById('llm-maxtokens').value)};const key=document.getElementById('llm-apikey').value;if(key&&!key.includes('...'))data.apiKey=key;await api('/api/config/llm',{method:'PUT',body:JSON.stringify(data)});toast('LLM guardado','ok');}
async function testLLM(){const btn=document.getElementById('btn-test');btn.disabled=true;btn.textContent='Probando...';const res=document.getElementById('llm-test-result');const r=await api('/api/llm/test',{method:'POST',body:JSON.stringify({provider:document.getElementById('llm-provider').value,apiKey:document.getElementById('llm-apikey').value,model:document.getElementById('llm-model').value})});btn.disabled=false;btn.textContent='Probar conexion';res.style.display='block';if(r?.success){res.className='info-box ok';res.innerHTML=`<strong>Conexion exitosa</strong> — Modelo: ${r.model}`;}else{res.className='info-box warn';res.innerHTML=`<strong>Error</strong> — ${esc(r?.error||'Fallo')}`;};}

// ── WIDGET ──
async function loadWidgetConfig(){const c=await api('/api/config');if(!c?.widget)return;const w=c.widget;document.getElementById('w-name').value=w.name||'';document.getElementById('w-avatar').value=w.avatar||'';document.getElementById('w-primary').value=w.primaryColor||'#D4502A';document.getElementById('w-secondary').value=w.secondaryColor||'#1E1E1E';document.getElementById('w-bg').value=w.bgColor||'#ffffff';document.getElementById('w-text').value=w.textColor||'#2C2C2C';document.getElementById('w-position').value=w.position||'right';document.getElementById('w-mode').value=w.mode||'floating';document.getElementById('w-greeting').value=w.greeting||'';document.getElementById('w-chips').value=(w.chips||[]).join('\n');document.getElementById('w-header').value=w.headerTitle||'';const fabEl=document.getElementById('w-fab-icon');if(fabEl)fabEl.value=w.fabIcon||'';const url=c.backend_url||location.origin;document.getElementById('embed-code').textContent=`<script src="${url}/widget.js"><\/script>`;}
async function saveWidgetConfig(){const fabEl=document.getElementById('w-fab-icon');const data={name:document.getElementById('w-name').value,avatar:document.getElementById('w-avatar').value,fabIcon:fabEl?fabEl.value:'',primaryColor:document.getElementById('w-primary').value,secondaryColor:document.getElementById('w-secondary').value,bgColor:document.getElementById('w-bg').value,textColor:document.getElementById('w-text').value,position:document.getElementById('w-position').value,mode:document.getElementById('w-mode').value,greeting:document.getElementById('w-greeting').value,chips:document.getElementById('w-chips').value.split('\n').filter(Boolean),headerTitle:document.getElementById('w-header').value};await api('/api/config/widget',{method:'PUT',body:JSON.stringify(data)});toast('Widget guardado','ok');}
function copyEmbed(){navigator.clipboard.writeText(document.getElementById('embed-code').textContent).then(()=>toast('Copiado','ok'));}
async function autoInject(){const r=await api('/api/shopify/inject-widget',{method:'POST'});if(r?.success){toast('Widget inyectado via Script Tag','ok');document.getElementById('inject-status')&&(document.getElementById('inject-status').innerHTML='<div class="info-box ok">Widget inyectado automaticamente</div>');}else toast(r?.error||'Error','err');}
async function removeInject(){const r=await api('/api/shopify/inject-widget',{method:'DELETE'});if(r?.success)toast('Widget removido','ok');else toast(r?.error||'Error','err');}

// ── BEHAVIOR ──
async function loadBehaviorConfig(){const c=await api('/api/config');if(!c?.behavior)return;const b=c.behavior;document.getElementById('b-prompt').value=b.systemPrompt||'';document.getElementById('b-tone').value=b.tone||'professional';document.getElementById('b-length').value=b.maxResponseLength||'medium';document.getElementById('b-showprod').checked=b.showProducts!==false;document.getElementById('b-rules').value=b.customRules||'';document.getElementById('b-datacollect').checked=b.dataCollection?.enabled!==false;document.getElementById('b-askafter').value=b.dataCollection?.askAfterMessages||2;document.querySelectorAll('#b-fields input').forEach(cb=>{cb.checked=(b.dataCollection?.fields||['name','email']).includes(cb.value);});document.querySelectorAll('.chip-check input').forEach(cb=>{cb.checked=(b.goals||[]).includes(cb.value);});}
async function saveBehaviorConfig(){const goals=[],fields=[];document.querySelectorAll('.chip-check input:checked').forEach(cb=>goals.push(cb.value));document.querySelectorAll('#b-fields input:checked').forEach(cb=>fields.push(cb.value));const data={systemPrompt:document.getElementById('b-prompt').value,tone:document.getElementById('b-tone').value,goals,maxResponseLength:document.getElementById('b-length').value,showProducts:document.getElementById('b-showprod').checked,customRules:document.getElementById('b-rules').value,dataCollection:{enabled:document.getElementById('b-datacollect').checked,fields,askAfterMessages:parseInt(document.getElementById('b-askafter').value),style:'conversational'}};await api('/api/config/behavior',{method:'PUT',body:JSON.stringify(data)});toast('Comportamiento guardado','ok');}

// ── LEADS ──
async function loadLeads(){const d=await api('/api/analytics/leads');allLeads=d?.leads||[];await loadSegments();renderLeads(allLeads);}
async function loadSegments(){const d=await api('/api/segments');if(!d?.segments)return;const pills=document.getElementById('segment-pills');if(!pills)return;pills.innerHTML='<span class="pill active" data-seg="" onclick="filterBySegment(this,\'\')" style="cursor:pointer;">Todos</span>';const labels={bajar_peso:'Bajar Peso',subir_peso:'Subir Peso',ganar_musculo:'Ganar Musculo',rendimiento:'Rendimiento',salud_general:'Salud',principiante:'Principiante',avanzado:'Avanzado',comprador:'Compradores'};for(const[tag,count]of Object.entries(d.segments)){if(count>0){const p=document.createElement('span');p.className='pill';p.dataset.seg=tag;p.style.cursor='pointer';p.textContent=`${labels[tag]||tag} (${count})`;p.onclick=()=>filterBySegment(p,tag);pills.appendChild(p);}}}
let activeSegment='';function filterBySegment(el,seg){activeSegment=seg;document.querySelectorAll('#segment-pills .pill').forEach(p=>p.classList.remove('active'));el.classList.add('active');if(seg){renderLeads(allLeads.filter(l=>(l.segments||[]).includes(seg)));}else{renderLeads(allLeads);}}
function renderLeads(leads){const tb=document.getElementById('leads-table'),em=document.getElementById('leads-empty');if(!leads.length){tb.innerHTML='';em.style.display='block';return;}em.style.display='none';tb.innerHTML=leads.map(l=>`<tr><td><input type="checkbox" data-id="${l.id}" onchange="toggleLead(this)" ${selectedIds.has(l.id)?'checked':''}></td><td style="font-weight:600;">${esc(l.name||'-')}</td><td>${esc(l.email||'-')}</td><td>${esc(l.phone||'-')}</td><td>${esc(l.goal||'-')}</td><td>${badge(l.status)}</td><td style="font-weight:600;color:${l.purchaseTotal>0?'var(--grn)':'var(--mut)'};">${l.purchaseTotal>0?'S/ '+l.purchaseTotal.toFixed(2):'-'}</td><td style="font-size:11px;color:var(--mut);">${fmtDate(l.createdAt)}</td></tr>`).join('');}
function filterLeads(){const q=document.getElementById('leads-search').value.toLowerCase();renderLeads(allLeads.filter(l=>(l.name||'').toLowerCase().includes(q)||(l.email||'').toLowerCase().includes(q)));}
function toggleLead(cb){if(cb.checked)selectedIds.add(cb.dataset.id);else selectedIds.delete(cb.dataset.id);document.getElementById('btn-remarket').disabled=selectedIds.size===0;document.getElementById('rm-count').textContent=selectedIds.size;}
function toggleAllLeads(cb){document.querySelectorAll('#leads-table input[type="checkbox"]').forEach(c=>{c.checked=cb.checked;toggleLead(c);});}
function exportCSV(){window.open(API+'/api/leads/export/csv','_blank');}

// ── REMARKETING ──
async function loadRemarketing(){const d=await api('/api/analytics/leads');const leads=(d?.leads||[]).filter(l=>l.email);const sel=document.getElementById('rt-lead');sel.innerHTML='<option value="">Seleccionar...</option>';leads.forEach(l=>{sel.innerHTML+=`<option value="${l.id}" data-email="${l.email||''}">${esc(l.name||l.email)}</option>`;});document.getElementById('rm-count').textContent=selectedIds.size;sel.onchange=function(){const o=sel.options[sel.selectedIndex];if(o.value)document.getElementById('rt-email').value=o.dataset.email||'';};}
async function sendRemarketing(){const ids=[...selectedIds];if(!ids.length)return toast('Selecciona leads','err');const tmpl=document.getElementById('rm-tmpl').value;const body={leadIds:ids};if(tmpl){body.templateId=tmpl;body.customData={code:document.getElementById('rm-code').value,message:document.getElementById('rm-body').value};}else{body.subject=document.getElementById('rm-subject').value;body.htmlBody='<p>'+(document.getElementById('rm-body').value||'').replace(/\n/g,'</p><p>')+'</p>';}const r=await api('/api/remarketing/send',{method:'POST',body:JSON.stringify(body)});if(r?.success){toast('Enviado a '+r.sent+' leads','ok');selectedIds.clear();loadLeads();}else toast(r?.error||'Error','err');}
async function sendRoutine(){const lid=document.getElementById('rt-lead').value,to=document.getElementById('rt-email').value;if(!to)return toast('Email requerido','err');const body={to,leadId:lid||undefined,routine:document.getElementById('rt-routine').value,nutrition:document.getElementById('rt-nutrition').value,supplements:document.getElementById('rt-supplements').value};const r=await api('/api/routines/send',{method:'POST',body:JSON.stringify(body)});if(r?.success)toast('Rutina enviada','ok');else toast(r?.error||'Error','err');}

// ── SHOPIFY OAUTH / WIDGET ──
function installViaOAuth(){
  let domain=(document.getElementById('sh-domain-oauth')?.value||'').trim().replace(/https?:\/\//i,'').replace(/\/+$/,'').toLowerCase();
  if(!domain){toast('Ingresa el dominio de tu tienda primero','err');return;}
  // Redirect to /auth?shop=... which triggers Shopify OAuth authorization screen
  window.location.href=API+'/auth?shop='+encodeURIComponent(domain);
}
async function autoInject(){
  const statusEl=document.getElementById('widget-inject-status');
  if(statusEl)statusEl.textContent='Inyectando...';
  const r=await api('/api/shopify/inject-widget',{method:'POST'});
  if(r?.success){toast('Widget inyectado en la tienda','ok');if(statusEl)statusEl.innerHTML='<span style="color:var(--grn)">Widget activo</span>';}
  else{toast(r?.error||'Error — verifica que Shopify está conectado','err');if(statusEl)statusEl.innerHTML='<span style="color:var(--red)">'+esc(r?.error||'Error')+'</span>';}
}
async function removeWidgetFromStore(){
  if(!confirm('¿Remover el widget de la tienda? Dejará de mostrarse a los visitantes.'))return;
  const statusEl=document.getElementById('widget-inject-status');
  if(statusEl)statusEl.textContent='Removiendo...';
  const r=await api('/api/shopify/inject-widget',{method:'DELETE'});
  if(r?.success){toast('Widget removido de la tienda','ok');if(statusEl)statusEl.innerHTML='<span style="color:var(--mut)">Widget removido</span>';}
  else{toast(r?.error||'Error al remover','err');if(statusEl)statusEl.innerHTML='<span style="color:var(--red)">'+esc(r?.error||'Error')+'</span>';}
}
// Detect ?shopify=connected after OAuth redirect
if(new URLSearchParams(location.search).get('shopify')==='connected'){
  history.replaceState({},'',location.pathname);
  setTimeout(()=>{
    nav('settings');
    const el=document.getElementById('sh-result');
    if(el)el.innerHTML='<div class="info-box ok" style="font-size:13px;"><strong>Shopify conectado correctamente.</strong> El widget fue inyectado automaticamente en tu tienda.</div>';
    toast('Shopify conectado','ok');
  },300);
}

// ── SHOPIFY TOOLS ──
async function createDiscount(){const code=document.getElementById('dc-code').value,pct=document.getElementById('dc-pct').value,title=document.getElementById('dc-title').value,limit=document.getElementById('dc-limit').value;if(!code)return toast('Ingresa un codigo','err');const r=await api('/api/shopify/discount',{method:'POST',body:JSON.stringify({code,percentage:pct,title:title||('Promo '+code),usageLimit:limit?parseInt(limit):null})});const el=document.getElementById('dc-result');if(r?.success){el.innerHTML=`<div class="info-box ok"><strong>Descuento creado:</strong> ${esc(r.discountCode?.code)} — ${pct}% off</div>`;}else{el.innerHTML=`<div class="info-box warn">${esc(r?.error||'Error')}</div>`;}}
async function searchCustomer(){const q=document.getElementById('cs-query').value;if(!q)return;const r=await api('/api/shopify/customer/search?q='+encodeURIComponent(q));const el=document.getElementById('cs-result');if(r?.customers?.length){el.innerHTML=r.customers.map(c=>`<div class="card" style="margin-top:8px;"><div class="card-body" style="padding:12px;"><strong>${esc(c.name)}</strong> · ${esc(c.email)}<br><span style="font-size:11px;color:var(--mut);">Pedidos: ${c.ordersCount} · Total: $${c.totalSpent} · ${esc(c.tags||'sin tags')}</span></div></div>`).join('');}else{el.innerHTML='<div class="info-box warn">No encontrado</div>';}}

// ── SETTINGS ──
async function loadSettings(){
  const s=await api('/api/settings');if(!s)return;
  document.getElementById('settings-status').innerHTML=[
    {l:'Shopify',v:s.shopify_connected,t:s.shopify_connected?'Conectado':'No conectado'},
    {l:'LLM',v:s.llm_configured,t:s.llm_provider!=='none'?s.llm_provider:'No configurado'},
    {l:'SMTP',v:s.smtp_configured,t:s.smtp_configured?'Configurado':'No configurado'},
    {l:'Knowledge Base',v:true,t:s.kb_stats?`${s.kb_stats.sources} fuentes, ${s.kb_stats.chunks} chunks`:'Vacio'},
    {l:'Permisos',v:true,t:(s.scopes||30)+' scopes Shopify'}
  ].map(x=>`<div class="stat"><div class="stat-val" style="font-size:14px;"><span class="status-dot ${x.v?'dot-ok':'dot-err'}"></span>${x.t}</div><div class="stat-lbl">${x.l}</div></div>`).join('');
  // Populate Shopify connection form if saved
  const cfg=await api('/api/config');
  if(cfg?.shopify?.shop){document.getElementById('sh-domain').value=cfg.shopify.shop;}
  if(cfg?.shopify?.accessToken){document.getElementById('sh-token').value=cfg.shopify.accessToken.substring(0,8)+'...';}
  if(cfg?.email?.smtpHost){document.getElementById('smtp-host').value=cfg.email.smtpHost;document.getElementById('smtp-port').value=cfg.email.smtpPort||587;document.getElementById('smtp-user').value=cfg.email.smtpUser||'';}
  if(s.shopify_connected){const badge=document.getElementById('shopify-conn-badge');if(badge)badge.innerHTML='<span class="badge b-purchased">Conectado</span>';}
}
async function connectShopify(){
  const domain=document.getElementById('sh-domain').value.trim().replace(/https?:\/\//,'').replace(/\//,'');
  const token=document.getElementById('sh-token').value.trim();
  if(!domain||!token)return toast('Ingresa dominio y token','err');
  const el=document.getElementById('sh-result');
  el.innerHTML='<div class="info-box warn">Conectando...</div>';
  const r=await api('/api/shopify/connect',{method:'POST',body:JSON.stringify({shop:domain,accessToken:token})});
  if(r?.success){
    el.innerHTML=`<div class="info-box ok"><strong>Conectado a ${esc(r.shop)}</strong> — ${r.productsCount||0} productos encontrados</div>`;
    toast('Shopify conectado','ok');
    const badge=document.getElementById('shopify-conn-badge');if(badge)badge.innerHTML='<span class="badge b-purchased">Conectado</span>';
  }else{
    el.innerHTML=`<div class="info-box warn"><strong>Error:</strong> ${esc(r?.error||'Token invalido o dominio incorrecto')}</div>`;
    toast(r?.error||'Error al conectar','err');
  }
}
async function testShopifyConn(){
  const r=await api('/api/shopify/connect/test');
  const el=document.getElementById('sh-result');
  if(r?.success){el.innerHTML=`<div class="info-box ok">Conexion activa — tienda: ${esc(r.shop)}</div>`;}else{el.innerHTML=`<div class="info-box warn">${esc(r?.error||'Sin conexion guardada')}</div>`;}
}
async function saveEmailConfig(){
  const data={smtpHost:document.getElementById('smtp-host').value,smtpPort:parseInt(document.getElementById('smtp-port').value)||587,smtpUser:document.getElementById('smtp-user').value,smtpPass:document.getElementById('smtp-pass').value};
  if(!data.smtpHost)return toast('Ingresa el host SMTP','err');
  await api('/api/config/email',{method:'PUT',body:JSON.stringify(data)});toast('Email guardado','ok');
}

// ── PRODUCTOS ──
async function loadProductos(){loadSavedLogos();loadStacks();const c=await api('/api/config');if(c?.widget?.avatar){setLogoPreview(c.widget.avatar);};}
async function loadSavedLogos(){const r=await api('/api/upload/list');const el=document.getElementById('logo-saved-list');if(!r?.files?.length){el.innerHTML='';return;}el.innerHTML='<p style="font-size:11px;color:var(--mut);margin-bottom:6px;">Logos subidos:</p>'+r.files.map(f=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><img src="${f.url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid var(--bdr);"><span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.filename)}</span><button class="btn btn-sm btn-r" onclick="applyLogo('${f.url}')">Usar</button><button class="btn btn-sm btn-g" onclick="deleteLogo('${f.filename}',this)">×</button></div>`).join('');}
function setLogoPreview(url){const el=document.getElementById('logo-preview');if(el)el.innerHTML=`<img src="${url}" style="width:80px;height:80px;object-fit:cover;">`;}
async function uploadLogo(input){if(!input.files[0])return;const fd=new FormData();fd.append('logo',input.files[0]);const r=await fetch(API+'/api/upload/logo',{method:'POST',body:fd});const d=await r.json();if(d.success){setLogoPreview(d.url);document.getElementById('logo-url-inp').value=d.url;loadSavedLogos();toast('Logo subido y aplicado al widget','ok');}else toast(d.error||'Error','err');}
async function setLogoUrl(){const url=document.getElementById('logo-url-inp').value.trim();if(!url)return;await api('/api/config/widget',{method:'PUT',body:JSON.stringify({avatar:url})});setLogoPreview(url);toast('Logo URL aplicado','ok');}
async function applyLogo(url){await api('/api/config/widget',{method:'PUT',body:JSON.stringify({avatar:url})});setLogoPreview(url);document.getElementById('logo-url-inp').value=url;toast('Logo aplicado','ok');}
async function deleteLogo(fn,btn){await fetch(API+'/api/upload/logo/'+encodeURIComponent(fn),{method:'DELETE'});btn.closest('div').remove();toast('Eliminado','ok');}

// Product stacks
let _selectedProducts = []; // {id, variantId, title}
let _prodSearchTimer;
async function showNewStackForm(){
  _selectedProducts=[];renderSelectedProducts();
  document.getElementById('new-stack-form').style.display='block';
  document.getElementById('ns-name').focus();
  // Load Shopify collections into segment selector (dynamic per store)
  const seg=document.getElementById('ns-segment');
  const hint=document.getElementById('ns-segment-hint');
  if(seg){
    seg.innerHTML='<option value="">Cargando colecciones...</option>';
    const r=await api('/api/shopify/collections');
    if(r?.collections?.length){
      seg.innerHTML='<option value="all">-- Todos los productos --</option>'+
        r.collections.map(c=>`<option value="${c.id}">${esc(c.title)} (${c.products_count||'?'})</option>`).join('');
      if(hint){hint.textContent=r.collections.length+' colecciones de tu tienda';hint.style.color='';}
    } else {
      seg.innerHTML='<option value="general">General</option><option value="custom">Otro</option>';
      if(hint){hint.textContent='Sin conexion Shopify — configura en Configuracion';hint.style.color='var(--red)';}
    }
  }
  loadShopifyProducts();
}
function debouncedSearchProducts(){clearTimeout(_prodSearchTimer);_prodSearchTimer=setTimeout(loadShopifyProducts,350);}
async function loadShopifyProducts(){
  const q=document.getElementById('sh-prod-search')?.value||'';
  const el=document.getElementById('sh-products-list');if(!el)return;
  el.innerHTML='<div style="padding:10px;font-size:12px;color:var(--mut);">Cargando...</div>';
  document.getElementById('sh-collections-list').style.display='none';
  const r=await api('/api/shopify/products?limit=30'+(q?'&search='+encodeURIComponent(q):''));
  if(!r?.products){el.innerHTML='<div style="padding:10px;font-size:12px;color:var(--red);">Error al cargar productos. Verifica conexion Shopify.</div>';return;}
  if(!r.products.length){el.innerHTML='<div style="padding:10px;font-size:12px;color:var(--mut);">Sin resultados</div>';return;}
  el.innerHTML=r.products.map(p=>{
    const img=p.images?.[0]?.src||'';
    const v=p.variants?.[0];
    const alreadyAdded=_selectedProducts.some(x=>x.id===p.id);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--bdr);cursor:pointer;" onclick="selectProduct(${p.id},'${esc(p.title)}',${v?.id||0},'${img}')" ${alreadyAdded?'style="opacity:0.5;"':''}>
      ${img?`<img src="${img}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;">`:           '<div style="width:36px;height:36px;background:#f0f0f0;border-radius:4px;"></div>'}
      <div style="flex:1;"><div style="font-size:12px;font-weight:600;">${esc(p.title)}</div><div style="font-size:11px;color:var(--mut);">${esc(p.product_type||'')} · $${v?.price||'-'}</div></div>
      <span style="font-size:18px;color:var(--grn);">${alreadyAdded?'✓':'+'}</span>
    </div>`;
  }).join('');
}
function selectProduct(id,title,variantId,img){
  if(_selectedProducts.some(x=>x.id===id))return;
  _selectedProducts.push({id,title,variantId,img});renderSelectedProducts();loadShopifyProducts();
}
function removeSelectedProduct(id){_selectedProducts=_selectedProducts.filter(x=>x.id!==id);renderSelectedProducts();loadShopifyProducts();}
function renderSelectedProducts(){
  const el=document.getElementById('selected-products-list');if(!el)return;
  if(!_selectedProducts.length){el.innerHTML='<span style="font-size:11px;color:var(--mut);">Ningun producto seleccionado</span>';return;}
  el.innerHTML=_selectedProducts.map(p=>`<span style="display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;border:1px solid var(--bdr);border-radius:20px;padding:3px 8px;font-size:11px;">
    ${p.img?`<img src="${p.img}" style="width:16px;height:16px;object-fit:cover;border-radius:50%;">`:''}
    ${esc(p.title)} <span onclick="removeSelectedProduct(${p.id})" style="cursor:pointer;color:var(--red);font-weight:700;margin-left:2px;">×</span>
  </span>`).join('');
}
async function loadShopifyCollections(){
  const el=document.getElementById('sh-collections-list');if(!el)return;
  el.style.display='block';
  el.innerHTML='<div style="padding:10px;font-size:12px;color:var(--mut);">Cargando colecciones...</div>';
  const r=await api('/api/shopify/collections');
  if(!r?.collections){el.innerHTML='<div style="padding:10px;font-size:12px;color:var(--red);">Error al cargar colecciones</div>';return;}
  el.innerHTML=r.collections.map(c=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--bdr);cursor:pointer;" onclick="selectCollection(${c.id},'${esc(c.title)}')">
    <div style="flex:1;"><div style="font-size:12px;font-weight:600;">${esc(c.title)}</div><div style="font-size:11px;color:var(--mut);">${c.products_count||0} productos</div></div>
    <span style="font-size:18px;color:var(--grn);">+</span>
  </div>`).join('');
}
function selectCollection(id,title){toast('Coleccion "'+title+'" vinculada al stack','ok');document.getElementById('ns-name').value=document.getElementById('ns-name').value||title;}
async function openShopifyFilePicker(){
  const grid=document.getElementById('shopify-files-grid');if(!grid)return;
  const isOpen=grid.style.display==='flex';
  if(isOpen){grid.style.display='none';return;}
  grid.style.display='flex';grid.innerHTML='<div style="font-size:12px;color:var(--mut);">Cargando archivos de Shopify...</div>';
  const r=await api('/api/shopify/files');
  if(!r?.files?.length){grid.innerHTML='<div style="font-size:12px;color:var(--mut);">No hay imagenes en Shopify Files. Sube una imagen primero desde Shopify Admin → Contenido → Archivos.</div>';return;}
  grid.innerHTML=r.files.map(f=>`<div onclick="applyShopifyFile('${esc(f.url)}')" style="cursor:pointer;border:2px solid transparent;border-radius:6px;overflow:hidden;width:60px;height:60px;" title="${esc(f.alt||'')}"><img src="${esc(f.url)}" style="width:60px;height:60px;object-fit:cover;"></div>`).join('');
}
async function applyShopifyFile(url){
  document.getElementById('logo-url-inp').value=url;
  await api('/api/config/widget',{method:'PUT',body:JSON.stringify({avatar:url})});
  setLogoPreview(url);toast('Imagen de Shopify Files aplicada al widget','ok');
  const grid=document.getElementById('shopify-files-grid');if(grid)grid.style.display='none';
}
async function createStack(){
  const name=document.getElementById('ns-name').value.trim();if(!name)return toast('Ingresa un nombre','err');
  const payload={name,segment:document.getElementById('ns-segment').value,description:document.getElementById('ns-desc').value,products:_selectedProducts.map(p=>({shopifyId:p.id,variantId:p.variantId,title:p.title}))};
  const r=await api('/api/product-stacks',{method:'POST',body:JSON.stringify(payload)});
  if(r?.success){toast('Coleccion creada','ok');document.getElementById('new-stack-form').style.display='none';document.getElementById('ns-name').value='';document.getElementById('ns-desc').value='';_selectedProducts=[];loadStacks();}else toast(r?.error,'err');
}
async function loadStacks(){const r=await api('/api/product-stacks');renderStacks(r?.stacks||[]);}
function renderStacks(stacks){const el=document.getElementById('stacks-list');if(!stacks.length){el.innerHTML='<div class="card"><div class="card-body" style="text-align:center;color:var(--mut);padding:32px;">No hay colecciones. Crea tu primera con &quot;+ Nueva coleccion&quot;</div></div>';return;}
const segLabels={general:'General',bajar_peso:'Bajar Peso',subir_peso:'Subir Peso',ganar_musculo:'Ganar Musculo',rendimiento:'Rendimiento',salud_general:'Salud General',principiante:'Principiante',avanzado:'Avanzado'};
el.innerHTML=stacks.map(s=>`<div class="card" style="margin-bottom:16px;" id="stack-${s.id}">
<div class="card-head"><span class="card-title">${esc(s.name)}</span><div style="display:flex;gap:6px;align-items:center;"><span class="badge b-new">${segLabels[s.segment]||s.segment}</span><button class="btn btn-sm btn-g" onclick="deleteStack('${s.id}')">Eliminar</button></div></div>
<div class="card-body">
${s.description?`<p style="font-size:12px;color:var(--mut);margin-bottom:12px;">${esc(s.description)}</p>`:''}
<div id="prods-${s.id}">${renderStackProducts(s)}</div>
<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--bdr);">
  <p style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mut);margin-bottom:8px;">Agregar producto</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
    <input class="fi" id="pn-${s.id}" placeholder="Nombre *" style="font-size:12px;">
    <input class="fi" id="pp-${s.id}" placeholder="Precio (ej: 89.90)" style="font-size:12px;">
    <input class="fi" id="pu-${s.id}" placeholder="URL del producto" style="font-size:12px;">
    <input class="fi" id="pi-${s.id}" placeholder="URL imagen" style="font-size:12px;">
  </div>
  <button class="btn btn-r btn-sm" style="margin-top:8px;" onclick="addProdToStack('${s.id}')">+ Agregar producto</button>
</div>
</div></div>`).join('');}
function renderStackProducts(s){if(!s.products?.length)return '<p style="font-size:12px;color:var(--mut);">Sin productos. Agrega el primero abajo.</p>';
return`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">`+s.products.map((p,i)=>`<div style="border:1px solid var(--bdr);border-radius:8px;padding:10px;display:flex;align-items:center;gap:8px;">
${p.image?`<img src="${esc(p.image)}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;">`:'<div style="width:40px;height:40px;border-radius:6px;background:#f4f4f5;flex-shrink:0;"></div>'}
<div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.name)}</div>${p.price?`<div style="font-size:11px;color:var(--red);font-weight:700;">S/ ${esc(p.price)}</div>`:''}</div>
<button style="background:none;border:none;color:#bbb;cursor:pointer;font-size:16px;flex-shrink:0;" onclick="removeProdFromStack('${s.id}',${i})" title="Eliminar">×</button></div>`).join('')+'</div>';}
async function addProdToStack(sid){const name=document.getElementById('pn-'+sid)?.value.trim();if(!name)return toast('Nombre requerido','err');
const r=await api(`/api/product-stacks/${sid}/products`,{method:'POST',body:JSON.stringify({name,price:document.getElementById('pp-'+sid)?.value.trim(),url:document.getElementById('pu-'+sid)?.value.trim(),image:document.getElementById('pi-'+sid)?.value.trim()})});
if(r?.success){document.getElementById('prods-'+sid).innerHTML=renderStackProducts(r.stack);document.getElementById('pn-'+sid).value='';document.getElementById('pp-'+sid).value='';document.getElementById('pu-'+sid).value='';document.getElementById('pi-'+sid).value='';toast('Producto agregado','ok');}else toast(r?.error,'err');}
async function removeProdFromStack(sid,idx){const r=await api(`/api/product-stacks/${sid}/products/${idx}`,{method:'DELETE'});if(r?.success){document.getElementById('prods-'+sid).innerHTML=renderStackProducts(r.stack);toast('Eliminado','ok');}else toast(r?.error,'err');}
async function deleteStack(sid){if(!confirm('Eliminar esta coleccion?'))return;await api('/api/product-stacks/'+sid,{method:'DELETE'});document.getElementById('stack-'+sid)?.remove();toast('Coleccion eliminada','ok');}

// ── SETTINGS (comprehensive) ──
const MODEL_OPTIONS = {
  gemini: ['gemini-2.0-flash','gemini-2.5-pro','gemini-2.0-flash-lite'],
  openai: ['gpt-4o','gpt-4o-mini','o3-mini'],
  claude: ['claude-3-7-sonnet-20250219','claude-3-5-haiku-20241022','claude-3-opus-20240229']
};
function updateModelList(){
  const p=document.getElementById('cfg-llm-provider')?.value||'gemini';
  const sel=document.getElementById('cfg-llm-model'); if(!sel)return;
  const opts=MODEL_OPTIONS[p]||MODEL_OPTIONS.gemini;
  sel.innerHTML=opts.map(m=>`<option value="${m}">${m}</option>`).join('');
}

async function loadSettings(){
  const r=await api('/api/config');if(!r)return;
  // Brand
  const b=r.brand||{};
  ['name->brand-name','tagline->brand-tagline','logo->brand-logo'].forEach(pair=>{
    const[key,id]=pair.split('->');
    const el=document.getElementById(id);if(el)el.value=b[key]||'';
  });
  if(r.brand?.currency)document.getElementById('brand-currency').value=r.brand.currency;
  if(r.brand?.primaryLanguage)document.getElementById('brand-lang').value=r.brand.primaryLanguage;
  if(r.brand?.timezone)document.getElementById('brand-tz').value=r.brand.timezone;
  // LLM
  const l=r.llm||{};
  if(document.getElementById('cfg-llm-provider'))document.getElementById('cfg-llm-provider').value=l.provider||'gemini';
  updateModelList();
  if(document.getElementById('cfg-llm-model')&&l.model)document.getElementById('cfg-llm-model').value=l.model;
  const keyEl=document.getElementById('cfg-llm-key');
  if(keyEl)keyEl.placeholder=l.apiKey?'API Key guardada (oculta)':'Ingresa tu API Key aquí';
  if(document.getElementById('cfg-llm-temp')){document.getElementById('cfg-llm-temp').value=l.temperature||0.7;document.getElementById('cfg-temp-val').textContent=l.temperature||0.7;}
  // Shopify
  const sh=r.shopify||{};
  const domEl=document.getElementById('sh-domain');if(domEl&&sh.shop)domEl.value=sh.shop;
  const domOAuth=document.getElementById('sh-domain-oauth');if(domOAuth&&sh.shop)domOAuth.value=sh.shop;
  const badge=document.getElementById('shopify-conn-badge');
  if(badge)badge.innerHTML=sh.connected?'<span class="badge b-purchased">✓ Conectado</span>':'<span class="badge b-new">Sin conectar</span>';
  const oauthBtn=document.getElementById('sh-oauth-btn');
  if(oauthBtn)oauthBtn.textContent=sh.connected?'Reconectar':'Instalar app en Shopify';
  const shRes=document.getElementById('sh-result');
  if(shRes&&sh.connected)shRes.innerHTML=`<div class="info-box ok">Tienda: <strong>${esc(sh.shop||'')}</strong></div>`;
  // Email
  const em=r.email||{};
  if(document.getElementById('smtp-host'))document.getElementById('smtp-host').value=em.smtpHost||'';
  if(document.getElementById('smtp-port'))document.getElementById('smtp-port').value=em.smtpPort||587;
  if(document.getElementById('smtp-user'))document.getElementById('smtp-user').value=em.smtpUser||'';
  if(document.getElementById('smtp-from-name'))document.getElementById('smtp-from-name').value=em.fromName||'';
  if(document.getElementById('smtp-from-email'))document.getElementById('smtp-from-email').value=em.fromEmail||'';
  // Admin status
  const adm=await api('/api/admin/status');
  const noPassDiv=document.getElementById('admin-no-password');
  if(noPassDiv)noPassDiv.style.display=adm?.hasPassword?'none':'block';
  // System status
  checkSystemStatus();
}

async function saveBrand(){
  const data={storeName:document.getElementById('brand-name').value,tagline:document.getElementById('brand-tagline').value,logo:document.getElementById('brand-logo').value,currency:document.getElementById('brand-currency').value,primaryLanguage:document.getElementById('brand-lang').value,timezone:document.getElementById('brand-tz').value};
  const r=await api('/api/config/brand',{method:'PUT',body:JSON.stringify(data)});
  const el=document.getElementById('brand-result');
  if(r?.success){el.innerHTML='<span style="color:var(--grn)">✓ Guardado</span>';toast('Identidad guardada','ok');}
  else{el.innerHTML='<span style="color:var(--red)">Error al guardar</span>';toast(r?.error,'err');}
}

async function saveLLMConfig(){
  const key=document.getElementById('cfg-llm-key').value.trim();
  const data={provider:document.getElementById('cfg-llm-provider').value,model:document.getElementById('cfg-llm-model').value,temperature:parseFloat(document.getElementById('cfg-llm-temp').value)||0.7};
  if(key)data.apiKey=key;
  const r=await api('/api/config/llm',{method:'PUT',body:JSON.stringify(data)});
  if(r?.success){toast('IA guardada correctamente','ok');}else toast(r?.error||'Error','err');
}

async function testLLM(){
  const key=document.getElementById('cfg-llm-key').value.trim();
  const provider=document.getElementById('cfg-llm-provider').value;
  const model=document.getElementById('cfg-llm-model').value;
  const resultEl=document.getElementById('llm-test-result');
  if(!key){resultEl.innerHTML='<span style="color:orange;">Ingresa una API Key primero</span>';return;}
  resultEl.innerHTML='<span style="color:var(--mut)">Probando conexión...</span>';
  const r=await api('/api/llm/test',{method:'POST',body:JSON.stringify({provider,apiKey:key,model})});
  if(r?.success)resultEl.innerHTML=`<span style="color:var(--grn)">✓ Conectado via ${r.model}: "${r.response?.substring(0,80)}..."</span>`;
  else resultEl.innerHTML=`<span style="color:var(--red)">✗ Error: ${esc(r?.error||'Falló')}</span>`;
}

async function changeAdminPassword(){
  const cur=document.getElementById('sec-current-pw').value;
  const nw=document.getElementById('sec-new-pw').value;
  const el=document.getElementById('sec-result');
  if(!nw||nw.length<6){el.innerHTML='<span style="color:var(--red)">Mínimo 6 caracteres</span>';return;}
  // Check if first time setup
  const status=await api('/api/admin/status');
  let r;
  if(!status?.hasPassword){r=await api('/api/admin/setup',{method:'POST',body:JSON.stringify({password:nw})});}
  else{r=await api('/api/admin/change-password',{method:'POST',body:JSON.stringify({currentPassword:cur,newPassword:nw})});}
  if(r?.success){document.getElementById('admin-no-password').style.display='none';el.innerHTML='<span style="color:var(--grn)">✓ Contraseña establecida correctamente</span>';document.getElementById('sec-current-pw').value='';document.getElementById('sec-new-pw').value='';toast('Contraseña guardada','ok');}
  else el.innerHTML=`<span style="color:var(--red)">✗ ${esc(r?.error||'Error')}</span>`;
}

async function testEmail(){
  const r=await api('/api/email/test',{method:'POST',body:JSON.stringify({to:document.getElementById('smtp-user').value})});
  const el=document.getElementById('email-result');
  if(r?.success)el.innerHTML='<span style="color:var(--grn)">✓ Email de prueba enviado</span>';
  else el.innerHTML=`<span style="color:var(--red)">✗ ${esc(r?.error||'Configura SMTP primero')}</span>`;
}

async function checkSystemStatus(){
  const el=document.getElementById('sys-status');const det=document.getElementById('sys-detail');
  if(el)el.innerHTML='Verificando...';
  const r=await fetch(API+'/health').then(x=>x.json()).catch(()=>null);
  if(!r){if(el)el.innerHTML='<span style="color:var(--red)">❌ Sin respuesta</span>';return;}
  if(el)el.innerHTML=`<span style="color:var(--grn)">✓ Online — Uptime: ${Math.round((r.uptime||0)/60)} min</span>`;
  if(det){det.style.display='block';det.innerHTML=`<strong>Shopify:</strong> ${r.shopify?'✓ Conectado':'✗ Sin conectar'} &nbsp;|&nbsp; <strong>LLM:</strong> ${r.llm||'N/A'} &nbsp;|&nbsp; <strong>KB:</strong> ${r.kb?.sources||0} fuentes, ${r.kb?.chunks||0} chunks &nbsp;|&nbsp; <strong>API:</strong> 2026-01`;}
}

// ═══ PRODUCTS & STACKS ═══
let selectedStackProducts=[];

function showNewStackForm(){
  document.getElementById('new-stack-form').style.display='block';
  selectedStackProducts=[];
  renderSelectedProducts();
  loadShopifyCollectionsDropdown();
}

async function loadShopifyCollectionsDropdown(){
  const sel=document.getElementById('ns-segment');
  if(!sel)return;
  sel.innerHTML='<option value="">Cargando...</option>';
  const r=await api('/api/shopify/collections');
  if(!r?.collections?.length){sel.innerHTML='<option value="">Sin colecciones</option>';return;}
  sel.innerHTML='<option value="">— Selecciona coleccion —</option>';
  r.collections.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.title} (${c.productsCount||'?'} productos)`;sel.appendChild(o);});
  sel.onchange=()=>{if(sel.value)loadCollectionProducts(sel.value);};
}

async function loadCollectionProducts(collectionId){
  const list=document.getElementById('sh-products-list');
  if(!list)return;
  list.innerHTML='<div style="padding:12px;color:var(--mut);font-size:12px;">Cargando productos...</div>';
  const r=await api('/api/shopify/products/search?collection_id='+collectionId);
  renderProductSearchResults(r?.products||[],list);
}

let searchTimer=null;
function debouncedSearchProducts(){clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchProducts(),400);}
async function searchProducts(){
  const q=(document.getElementById('sh-prod-search')?.value||'').trim();
  const list=document.getElementById('sh-products-list');
  if(!list)return;
  if(!q){list.innerHTML='<div style="padding:12px;color:var(--mut);font-size:12px;">Escribe para buscar...</div>';return;}
  list.innerHTML='<div style="padding:12px;color:var(--mut);font-size:12px;">Buscando...</div>';
  const r=await api('/api/shopify/products/search?q='+encodeURIComponent(q));
  renderProductSearchResults(r?.products||[],list);
}

function renderProductSearchResults(products,container){
  if(!products.length){container.innerHTML='<div style="padding:12px;color:var(--mut);font-size:12px;">No se encontraron productos</div>';return;}
  container.innerHTML=products.map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #f0f0f0;cursor:pointer;transition:background .1s;" onmouseover="this.style.background='#f0f8ff'" onmouseout="this.style.background=''" onclick="addProductToStack(${esc(JSON.stringify(JSON.stringify(p)))})"><img src="${esc(p.image||'')}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;background:#f0f0f0;" onerror="this.style.background='#e0e0e0'"><div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.title)}</div><div style="font-size:11px;color:var(--mut);">$${p.price||'0'} | ${p.type||'Sin tipo'}</div></div><span style="font-size:18px;color:var(--grn);">+</span></div>`).join('');
}

function addProductToStack(jsonStr){
  try{
    const p=JSON.parse(jsonStr);
    if(selectedStackProducts.find(x=>x.id===p.id))return;
    selectedStackProducts.push(p);
    renderSelectedProducts();
    toast(p.title+' agregado','ok');
  }catch(e){}
}

function removeFromStack(idx){selectedStackProducts.splice(idx,1);renderSelectedProducts();}

function renderSelectedProducts(){
  const c=document.getElementById('selected-products-list');
  if(!c)return;
  if(!selectedStackProducts.length){c.innerHTML='<div style="font-size:11px;color:var(--mut);">Ningun producto seleccionado</div>';return;}
  c.innerHTML=selectedStackProducts.map((p,i)=>`<div style="display:inline-flex;align-items:center;gap:4px;background:#f0f0f0;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:600;"><img src="${esc(p.image||'')}" style="width:20px;height:20px;border-radius:4px;object-fit:cover;">${esc(p.title?.substring(0,25)||'?')}<span style="cursor:pointer;color:var(--red);margin-left:2px;" onclick="removeFromStack(${i})">✕</span></div>`).join('');
}

async function createStack(){
  const name=document.getElementById('ns-name')?.value?.trim();
  const segment=document.getElementById('ns-segment');
  const segmentName=segment?.selectedOptions?.[0]?.textContent?.replace(/ \(.*\)/,'') || '';
  const desc=document.getElementById('ns-desc')?.value||'';
  if(!name){toast('Ingresa un nombre','err');return;}
  if(!selectedStackProducts.length){toast('Agrega al menos un producto','err');return;}
  const stack={name,segment:segmentName,description:desc,active:true,products:selectedStackProducts.map(p=>({name:p.title,price:p.price||'',image:p.image||'',variantId:p.variantId||'',shopifyId:p.id||'',url:`/products/${p.handle||''}`,type:p.type||'',tags:p.tags||''}))};
  const r=await api('/api/product-stacks',{method:'POST',body:JSON.stringify(stack)});
  if(r){toast('Coleccion creada','ok');document.getElementById('new-stack-form').style.display='none';selectedStackProducts=[];loadProductStacks();}
  else toast('Error al crear','err');
}

async function loadProductStacks(){
  const c=document.getElementById('stacks-list');
  if(!c)return;
  const r=await api('/api/product-stacks');
  const stacks=r?.stacks||[];
  if(!stacks.length){c.innerHTML='<div class="no-data">No hay colecciones configuradas. Crea una nueva.</div>';return;}
  c.innerHTML=stacks.map((s,i)=>`<div class="card" style="margin-bottom:10px;"><div class="card-head"><span class="card-title">${esc(s.name)} <span style="font-size:11px;color:var(--mut);font-weight:400;">(${(s.products||[]).length} productos)</span></span><div style="display:flex;gap:6px;"><button class="btn btn-sm btn-g" onclick="toggleStack('${s.id}')">${s.active!==false?'Desactivar':'Activar'}</button><button class="btn btn-sm" onclick="deleteStack('${s.id}')" style="background:var(--red);color:#fff;">Eliminar</button></div></div><div class="card-body"><div style="display:flex;flex-wrap:wrap;gap:6px;">${(s.products||[]).map(p=>`<div style="display:flex;align-items:center;gap:4px;background:#f9fafb;border:1px solid var(--bdr);border-radius:8px;padding:5px 8px;"><img src="${esc(p.image||'')}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;" onerror="this.style.background='#e0e0e0'"><div><div style="font-size:11px;font-weight:600;">${esc(p.name?.substring(0,30)||'?')}</div><div style="font-size:10px;color:var(--mut);">S/ ${p.price||'0'}</div></div></div>`).join('')}</div></div></div>`).join('');
}

async function toggleStack(id){const r=await api('/api/product-stacks/'+id,{method:'PUT',body:JSON.stringify({active:'toggle'})});if(r)loadProductStacks();}
async function deleteStack(id){if(!confirm('Eliminar esta coleccion?'))return;const r=await api('/api/product-stacks/'+id,{method:'DELETE'});if(r)loadProductStacks();}

// ═══ LOGO / FAB ICON ═══
function uploadLogo(inp){
  if(!inp.files||!inp.files[0])return;
  const file=inp.files[0];
  const reader=new FileReader();
  reader.onload=async(e)=>{
    const url=e.target.result;
    const preview=document.getElementById('logo-preview');
    if(preview)preview.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    // Save as data URL (for small files) or show it — the full save happens via setLogoUrl
    document.getElementById('logo-url-inp').value=url;
    await saveFabIcon(url);
  };
  reader.readAsDataURL(file);
}

async function setLogoUrl(){
  const url=(document.getElementById('logo-url-inp')?.value||'').trim();
  if(!url){toast('Ingresa una URL','err');return;}
  const preview=document.getElementById('logo-preview');
  if(preview)preview.innerHTML=`<img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=\\'font-size:11px;color:var(--red);\\'>URL invalida</span>'">`;
  await saveFabIcon(url);
}

async function saveFabIcon(url){
  const r=await api('/api/config/fab-icon',{method:'PUT',body:JSON.stringify({url})});
  if(r?.success)toast('Icono del widget guardado','ok');
  else toast('Error al guardar icono','err');
}

async function openShopifyFilePicker(){
  const grid=document.getElementById('shopify-files-grid');
  if(!grid)return;
  grid.style.display='flex';
  grid.innerHTML='<div style="padding:8px;font-size:11px;color:var(--mut);">Cargando archivos...</div>';
  // Uses the Shopify Admin files endpoint if available
  try{
    const r=await api('/api/shopify/files');
    if(r?.files?.length){
      grid.innerHTML=r.files.map(f=>`<div style="width:56px;cursor:pointer;" onclick="document.getElementById('logo-url-inp').value='${esc(f.url)}';setLogoUrl();"><img src="${esc(f.url)}" style="width:56px;height:56px;border-radius:6px;object-fit:cover;border:1px solid var(--bdr);"></div>`).join('');
    }else grid.innerHTML='<div style="padding:8px;font-size:11px;color:var(--mut);">No se encontraron archivos. Usa la URL directa.</div>';
  }catch(e){grid.innerHTML='<div style="padding:8px;font-size:11px;color:var(--mut);">Pega la URL directa de tu imagen o GIF.</div>';}
}

async function loadFabIconPreview(){
  const c=await api('/api/config');
  const icon=c?.widget?.fabIcon;
  if(icon){
    const preview=document.getElementById('logo-preview');
    if(preview)preview.innerHTML=`<img src="${esc(icon)}" style="width:100%;height:100%;object-fit:cover;">`;
    const inp=document.getElementById('logo-url-inp');
    if(inp)inp.value=icon;
  }
}

// ═══ SHOPIFY COLLECTIONS (for admin display) ═══
async function loadShopifyCollections(){
  const list=document.getElementById('sh-collections-list');
  if(!list)return;
  list.style.display='block';
  list.innerHTML='<div style="padding:12px;color:var(--mut);font-size:12px;">Cargando colecciones...</div>';
  const r=await api('/api/shopify/collections');
  if(!r?.collections?.length){list.innerHTML='<div style="padding:12px;color:var(--mut);font-size:12px;">No hay colecciones</div>';return;}
  list.innerHTML=r.collections.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #f0f0f0;cursor:pointer;transition:background .1s;" onmouseover="this.style.background='#f0f8ff'" onmouseout="this.style.background=''" onclick="loadCollectionProducts(${c.id})"><div style="flex:1;"><div style="font-size:12px;font-weight:600;">${esc(c.title)}</div><div style="font-size:11px;color:var(--mut);">${c.productsCount||'?'} productos</div></div></div>`).join('');
}

// Init
initPeriod();
loadDashboard();
setTimeout(()=>{loadProductStacks();loadFabIconPreview();},1000);
