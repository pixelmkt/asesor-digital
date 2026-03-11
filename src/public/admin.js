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
  if(s==='settings')loadSettings();
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
  document.getElementById('dash-stats').innerHTML=[
    {l:'Sesiones',v:(d.traffic?.uniqueSessions||0).toLocaleString()},
    {l:'Leads',v:(d.leads?.total||0).toLocaleString()},
    {l:'Compras',v:d.purchases?.count||0},
    {l:'Ingresos',v:'S/ '+(d.purchases?.totalRevenue||0).toFixed(2)},
    {l:'Conversion',v:(d.conversionRate||0)+'%'}
  ].map(s=>`<div class="stat"><div class="stat-val">${s.v}</div><div class="stat-lbl">${s.l}</div></div>`).join('');
  const daily=d.dailyBreakdown||[],chart=document.getElementById('chart-daily');
  if(!daily.length){chart.innerHTML='<p style="color:var(--mut);font-size:12px;text-align:center;width:100%;">Sin datos</p>';}else{
    const mx=Math.max(...daily.map(x=>x.sessions||0),1);
    chart.innerHTML=daily.map(x=>{const h=Math.max(3,((x.sessions||0)/mx)*120);const day=new Date(x.date).toLocaleDateString('es-PE',{weekday:'short'});
      return`<div class="chart-col"><div class="chart-val">${x.sessions||0}</div><div class="chart-bar" style="height:${h}px;"></div><div class="chart-label">${day}</div></div>`;}).join('');
  }
  const kb=await api('/api/knowledge/stats');
  document.getElementById('kb-mini').innerHTML=kb?`<div style="font-size:12px;color:var(--mut);line-height:2.2;">Fuentes: <strong style="color:var(--blk);">${kb.sources}</strong><br>Chunks: <strong style="color:var(--blk);">${kb.chunks}</strong><br>Palabras: <strong style="color:var(--blk);">${(kb.totalWords||0).toLocaleString()}</strong></div>`:'Sin datos';
  const ld=await api('/api/analytics/leads');
  const tb=document.getElementById('recent-leads');tb.innerHTML='';
  (ld?.leads||[]).slice(0,5).forEach(l=>{tb.innerHTML+=`<tr><td style="font-weight:600;">${esc(l.name||'-')}</td><td>${esc(l.email||'-')}</td><td>${esc(l.goal||'-')}</td><td>${badge(l.status)}</td><td style="font-size:11px;color:var(--mut);">${fmtDate(l.createdAt)}</td></tr>`;});
  if(!ld?.leads?.length)tb.innerHTML='<tr><td colspan="5" class="no-data">No hay leads</td></tr>';
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
const hints={gemini:'ai.google.dev',openai:'platform.openai.com',claude:'console.anthropic.com'};
const models={gemini:['gemini-2.0-flash','gemini-2.0-pro','gemini-1.5-flash'],openai:['gpt-4o','gpt-4o-mini','gpt-4-turbo'],claude:['claude-sonnet-4-20250514','claude-3-5-haiku-20241022','claude-3-5-sonnet-20241022']};
function onProviderChange(){const p=document.getElementById('llm-provider').value;document.getElementById('llm-hint').textContent=hints[p]||'';const sel=document.getElementById('llm-model');sel.innerHTML='';(models[p]||[]).forEach((m,i)=>{const o=document.createElement('option');o.value=m;o.textContent=m;if(i===0)o.selected=true;sel.appendChild(o);});}
async function loadLLMConfig(){const c=await api('/api/config');if(!c?.llm)return;document.getElementById('llm-provider').value=c.llm.provider||'gemini';onProviderChange();if(c.llm.model)document.getElementById('llm-model').value=c.llm.model;document.getElementById('llm-temp').value=c.llm.temperature||0.7;document.getElementById('t-val').textContent=c.llm.temperature||0.7;document.getElementById('llm-maxtokens').value=c.llm.maxTokens||1800;if(c.llm.apiKey)document.getElementById('llm-apikey').value=c.llm.apiKey;}
async function saveLLMConfig(){const data={provider:document.getElementById('llm-provider').value,model:document.getElementById('llm-model').value,temperature:parseFloat(document.getElementById('llm-temp').value),maxTokens:parseInt(document.getElementById('llm-maxtokens').value)};const key=document.getElementById('llm-apikey').value;if(key&&!key.includes('...'))data.apiKey=key;await api('/api/config/llm',{method:'PUT',body:JSON.stringify(data)});toast('LLM guardado','ok');}
async function testLLM(){const btn=document.getElementById('btn-test');btn.disabled=true;btn.textContent='Probando...';const res=document.getElementById('llm-test-result');const r=await api('/api/llm/test',{method:'POST',body:JSON.stringify({provider:document.getElementById('llm-provider').value,apiKey:document.getElementById('llm-apikey').value,model:document.getElementById('llm-model').value})});btn.disabled=false;btn.textContent='Probar conexion';res.style.display='block';if(r?.success){res.className='info-box ok';res.innerHTML=`<strong>Conexion exitosa</strong> — Modelo: ${r.model}`;}else{res.className='info-box warn';res.innerHTML=`<strong>Error</strong> — ${esc(r?.error||'Fallo')}`;};}

// ── WIDGET ──
async function loadWidgetConfig(){const c=await api('/api/config');if(!c?.widget)return;const w=c.widget;document.getElementById('w-name').value=w.name||'';document.getElementById('w-avatar').value=w.avatar||'';document.getElementById('w-primary').value=w.primaryColor||'#D4502A';document.getElementById('w-secondary').value=w.secondaryColor||'#1E1E1E';document.getElementById('w-bg').value=w.bgColor||'#ffffff';document.getElementById('w-text').value=w.textColor||'#2C2C2C';document.getElementById('w-position').value=w.position||'right';document.getElementById('w-mode').value=w.mode||'floating';document.getElementById('w-greeting').value=w.greeting||'';document.getElementById('w-chips').value=(w.chips||[]).join('\n');document.getElementById('w-header').value=w.headerTitle||'';const url=c.backend_url||location.origin;document.getElementById('embed-code').textContent=`<script src="${url}/widget.js"><\/script>`;}
async function saveWidgetConfig(){const data={name:document.getElementById('w-name').value,avatar:document.getElementById('w-avatar').value,primaryColor:document.getElementById('w-primary').value,secondaryColor:document.getElementById('w-secondary').value,bgColor:document.getElementById('w-bg').value,textColor:document.getElementById('w-text').value,position:document.getElementById('w-position').value,mode:document.getElementById('w-mode').value,greeting:document.getElementById('w-greeting').value,chips:document.getElementById('w-chips').value.split('\n').filter(Boolean),headerTitle:document.getElementById('w-header').value};await api('/api/config/widget',{method:'PUT',body:JSON.stringify(data)});toast('Widget guardado','ok');}
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

// ── SHOPIFY TOOLS ──
async function createDiscount(){const code=document.getElementById('dc-code').value,pct=document.getElementById('dc-pct').value,title=document.getElementById('dc-title').value,limit=document.getElementById('dc-limit').value;if(!code)return toast('Ingresa un codigo','err');const r=await api('/api/shopify/discount',{method:'POST',body:JSON.stringify({code,percentage:pct,title:title||('Promo '+code),usageLimit:limit?parseInt(limit):null})});const el=document.getElementById('dc-result');if(r?.success){el.innerHTML=`<div class="info-box ok"><strong>Descuento creado:</strong> ${esc(r.discountCode?.code)} — ${pct}% off</div>`;}else{el.innerHTML=`<div class="info-box warn">${esc(r?.error||'Error')}</div>`;}}
async function searchCustomer(){const q=document.getElementById('cs-query').value;if(!q)return;const r=await api('/api/shopify/customer/search?q='+encodeURIComponent(q));const el=document.getElementById('cs-result');if(r?.customers?.length){el.innerHTML=r.customers.map(c=>`<div class="card" style="margin-top:8px;"><div class="card-body" style="padding:12px;"><strong>${esc(c.name)}</strong> · ${esc(c.email)}<br><span style="font-size:11px;color:var(--mut);">Pedidos: ${c.ordersCount} · Total: $${c.totalSpent} · ${esc(c.tags||'sin tags')}</span></div></div>`).join('');}else{el.innerHTML='<div class="info-box warn">No encontrado</div>';}}

// ── SETTINGS ──
async function loadSettings(){const s=await api('/api/settings');if(!s)return;document.getElementById('settings-status').innerHTML=[
  {l:'Shopify',v:s.shopify_connected,t:s.shopify_connected?'Conectado':'No conectado'},
  {l:'LLM',v:s.llm_configured,t:s.llm_provider!=='none'?s.llm_provider:'No configurado'},
  {l:'SMTP',v:s.smtp_configured,t:s.smtp_configured?'Configurado':'No configurado'},
  {l:'Knowledge Base',v:true,t:s.kb_stats?`${s.kb_stats.sources} fuentes, ${s.kb_stats.chunks} chunks`:'Vacio'},
  {l:'Permisos',v:true,t:s.scopes+' scopes Shopify'}
].map(x=>`<div class="stat"><div class="stat-val" style="font-size:14px;"><span class="status-dot ${x.v?'dot-ok':'dot-err'}"></span>${x.t}</div><div class="stat-lbl">${x.l}</div></div>`).join('');}

// Init
initPeriod();
loadDashboard();
