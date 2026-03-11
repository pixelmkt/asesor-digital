/* Asesor Digital — Admin Dashboard Logic */
const API = window.location.origin;
let currentPeriod='30d', allLeads=[], selectedLeadIds=new Set();

// Navigation
document.querySelectorAll('.nav a').forEach(a=>{a.addEventListener('click',e=>{e.preventDefault();navigate(a.dataset.section);});});
function navigate(s){
  document.querySelectorAll('.section').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  const sec=document.getElementById('sec-'+s), nav=document.querySelector(`[data-section="${s}"]`);
  if(sec)sec.classList.add('active'); if(nav)nav.classList.add('active');
  if(s==='knowledge')loadKB(); if(s==='llm')loadLLMConfig(); if(s==='widget')loadWidgetConfig();
  if(s==='behavior')loadBehaviorConfig(); if(s==='leads')loadLeads(); if(s==='remarketing')loadRemarketing();
  if(s==='settings')loadSettings();
}

// Period
document.querySelectorAll('.period-btn').forEach(b=>{b.addEventListener('click',()=>{
  document.querySelectorAll('.period-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); currentPeriod=b.dataset.period; loadDashboard();
});});

// Helpers
async function api(path,opts={}){try{const r=await fetch(API+path,{headers:{'Content-Type':'application/json',...opts.headers},...opts});return await r.json();}catch(e){console.error(e);return null;}}
function toast(msg,err=false){const c=document.getElementById('toast'),i=document.createElement('div');i.className='toast-item'+(err?' error':'');i.textContent=msg;c.appendChild(i);setTimeout(()=>i.remove(),4000);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmtDate(d){if(!d)return'—';const dt=new Date(d);return dt.toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'2-digit'})+' '+dt.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});}
function badge(status){const m={new:'badge-new',purchased:'badge-purchased',remarketed:'badge-remarketed',routine_sent:'badge-routine'};const l={new:'Nuevo',purchased:'Compro',remarketed:'Remarketed',routine_sent:'Rutina'};return`<span class="badge ${m[status]||'badge-new'}">${l[status]||status||'Nuevo'}</span>`;}

// ══════ DASHBOARD ══════
async function loadDashboard(){
  const d=await api(`/api/analytics/summary?period=${currentPeriod}`); if(!d)return;
  document.getElementById('m-sessions').textContent=(d.traffic?.uniqueSessions||0).toLocaleString();
  document.getElementById('m-leads').textContent=(d.leads?.total||0).toLocaleString();
  document.getElementById('m-purchases').textContent=(d.purchases?.count||0).toLocaleString();
  document.getElementById('m-revenue').textContent='S/ '+(d.purchases?.totalRevenue||0).toFixed(2);
  document.getElementById('m-conversion').textContent=(d.conversionRate||0)+'%';
  // Chart
  const daily=d.dailyBreakdown||[], chart=document.getElementById('chart-daily');
  if(!daily.length){chart.innerHTML='<p style="color:var(--text4);font-size:13px;text-align:center;width:100%;">Sin datos</p>';} else {
    const maxS=Math.max(...daily.map(x=>x.sessions||0),1);
    chart.innerHTML=daily.map(x=>{const h=Math.max(3,((x.sessions||0)/maxS)*120);const day=new Date(x.date).toLocaleDateString('es-PE',{weekday:'short'});
      return`<div class="chart-col"><div class="chart-val">${x.sessions||0}</div><div class="chart-bar primary" style="height:${h}px;"></div><div class="chart-label">${day}</div></div>`;}).join('');
  }
  // KB mini
  const kb=await api('/api/knowledge/stats');
  document.getElementById('kb-mini-stats').innerHTML=kb?`Fuentes: <strong>${kb.sources}</strong><br>Chunks: <strong>${kb.chunks}</strong><br>Palabras: <strong>${kb.totalWords?.toLocaleString()}</strong>`:'Sin datos';
  // Recent leads
  const ld=await api('/api/analytics/leads?limit=5');
  const tb=document.getElementById('recent-leads'); tb.innerHTML='';
  (ld?.leads||[]).slice(0,5).forEach(l=>{tb.innerHTML+=`<tr><td class="strong">${esc(l.name||'—')}</td><td>${esc(l.email||'—')}</td><td>${esc(l.goal||'—')}</td><td>${badge(l.status)}</td><td style="font-size:12px;color:var(--text3);">${fmtDate(l.createdAt)}</td></tr>`;});
  if(!ld?.leads?.length) tb.innerHTML='<tr><td colspan="5" class="no-data">No hay leads</td></tr>';
}

// ══════ KNOWLEDGE BASE ══════
async function loadKB(){
  const s=await api('/api/knowledge/stats'); if(!s)return;
  document.getElementById('kb-sources').textContent=s.sources;
  document.getElementById('kb-chunks').textContent=s.chunks;
  document.getElementById('kb-words').textContent=(s.totalWords||0).toLocaleString();
  const src=await api('/api/knowledge/sources');
  const tb=document.getElementById('kb-sources-table');
  tb.innerHTML=(src?.sources||[]).map(s=>`<tr><td class="strong">${esc(s.name)}</td><td>${s.type}</td><td>${s.chunkCount}</td><td>${s.wordCount?.toLocaleString()}</td><td style="font-size:12px;color:var(--text3);">${fmtDate(s.createdAt)}</td><td><button class="btn btn-sm btn-secondary" onclick="deleteSource('${s.id}')">Eliminar</button></td></tr>`).join('');
  if(!src?.sources?.length) tb.innerHTML='<tr><td colspan="6" class="no-data">No hay fuentes. Sube un archivo, pega texto o crawlea tu tienda.</td></tr>';
}
// File upload
const dropZone=document.getElementById('drop-zone'), fileInput=document.getElementById('kb-file');
if(dropZone){
  dropZone.addEventListener('click',()=>fileInput.click());
  dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.style.borderColor='var(--accent)';});
  dropZone.addEventListener('dragleave',()=>{dropZone.style.borderColor='var(--border)';});
  dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.style.borderColor='var(--border)';if(e.dataTransfer.files[0])uploadFile(e.dataTransfer.files[0]);});
  fileInput.addEventListener('change',()=>{if(fileInput.files[0])uploadFile(fileInput.files[0]);});
}
async function uploadFile(file){
  const fd=new FormData();fd.append('file',file);
  const r=await fetch(API+'/api/knowledge/upload',{method:'POST',body:fd});const d=await r.json();
  if(d.success){toast('Archivo indexado: '+d.source.chunkCount+' chunks');loadKB();}else toast(d.error,true);
}
async function addKBText(){
  const name=document.getElementById('kb-text-name').value,content=document.getElementById('kb-text-content').value;
  if(!content)return toast('Escribe contenido',true);
  const r=await api('/api/knowledge/text',{method:'POST',body:JSON.stringify({name:name||'Texto manual',content})});
  if(r?.success){toast('Texto indexado: '+r.source.chunkCount+' chunks');document.getElementById('kb-text-name').value='';document.getElementById('kb-text-content').value='';loadKB();}else toast(r?.error||'Error',true);
}
async function crawlStore(){
  const btn=document.getElementById('btn-crawl');btn.disabled=true;btn.textContent='Crawleando...';
  document.getElementById('crawl-status').innerHTML='<p style="color:var(--accent);font-size:13px;">Importando datos de Shopify... esto puede tomar unos segundos.</p>';
  const r=await api('/api/knowledge/crawl',{method:'POST'});
  btn.disabled=false;btn.textContent='Crawlear tienda';
  if(r?.success){toast('Tienda importada: '+r.stats.chunks+' chunks totales');document.getElementById('crawl-status').innerHTML=`<p style="color:var(--green);font-size:13px;">Importado: ${r.sources.length} fuentes, ${r.stats.chunks} chunks</p>`;loadKB();}
  else{document.getElementById('crawl-status').innerHTML=`<p style="color:var(--accent);font-size:13px;">Error: ${r?.error||'Conecta Shopify primero'}</p>`;toast(r?.error||'Error',true);}
}
async function deleteSource(id){if(!confirm('Eliminar esta fuente?'))return;await api('/api/knowledge/source/'+id,{method:'DELETE'});toast('Fuente eliminada');loadKB();}

// ══════ LLM CONFIG ══════
const providerHints={gemini:'Obtener en: ai.google.dev',openai:'Obtener en: platform.openai.com',claude:'Obtener en: console.anthropic.com'};
const providerModels={gemini:['gemini-2.0-flash','gemini-2.0-pro','gemini-1.5-flash'],openai:['gpt-4o','gpt-4o-mini','gpt-4-turbo'],claude:['claude-sonnet-4-20250514','claude-3-5-haiku-20241022','claude-3-5-sonnet-20241022']};
function onProviderChange(){
  const p=document.getElementById('llm-provider').value;
  document.getElementById('llm-apikey-hint').textContent=providerHints[p]||'';
  const sel=document.getElementById('llm-model');sel.innerHTML='';
  (providerModels[p]||[]).forEach((m,i)=>{const o=document.createElement('option');o.value=m;o.textContent=m;if(i===0)o.selected=true;sel.appendChild(o);});
}
async function loadLLMConfig(){
  const c=await api('/api/config');if(!c?.llm)return;
  document.getElementById('llm-provider').value=c.llm.provider||'gemini';
  onProviderChange();
  if(c.llm.model)document.getElementById('llm-model').value=c.llm.model;
  document.getElementById('llm-temperature').value=c.llm.temperature||0.7;
  document.getElementById('llm-temp-val').textContent=c.llm.temperature||0.7;
  document.getElementById('llm-maxtokens').value=c.llm.maxTokens||1800;
  if(c.llm.apiKey)document.getElementById('llm-apikey').value=c.llm.apiKey;
}
async function saveLLMConfig(){
  const data={provider:document.getElementById('llm-provider').value,model:document.getElementById('llm-model').value,temperature:parseFloat(document.getElementById('llm-temperature').value),maxTokens:parseInt(document.getElementById('llm-maxtokens').value)};
  const key=document.getElementById('llm-apikey').value;if(key&&!key.includes('...'))data.apiKey=key;
  await api('/api/config/llm',{method:'PUT',body:JSON.stringify(data)});toast('Configuracion LLM guardada');
}
async function testLLM(){
  const btn=document.getElementById('btn-test-llm');btn.disabled=true;btn.textContent='Probando...';
  const res=document.getElementById('llm-test-result');
  const key=document.getElementById('llm-apikey').value;const provider=document.getElementById('llm-provider').value;const model=document.getElementById('llm-model').value;
  const r=await api('/api/llm/test',{method:'POST',body:JSON.stringify({provider,apiKey:key,model})});
  btn.disabled=false;btn.textContent='Probar conexion';res.style.display='block';
  if(r?.success){res.style.background='var(--green-bg)';res.style.border='1px solid var(--green-border)';res.innerHTML=`<strong style="color:var(--green);">Conexion exitosa</strong><br><span style="font-size:12px;color:var(--text3);">Modelo: ${r.model}<br>Respuesta: ${esc(r.response)}</span>`;}
  else{res.style.background='var(--accent-light)';res.style.border='1px solid var(--accent-border)';res.innerHTML=`<strong style="color:var(--accent);">Error</strong><br><span style="font-size:12px;color:var(--text3);">${esc(r?.error||'Conexion fallida')}</span>`;}
}

// ══════ WIDGET CONFIG ══════
async function loadWidgetConfig(){
  const c=await api('/api/config');if(!c?.widget)return;const w=c.widget;
  document.getElementById('w-name').value=w.name||'';document.getElementById('w-avatar').value=w.avatar||'';
  document.getElementById('w-primary').value=w.primaryColor||'#d32f2f';document.getElementById('w-secondary').value=w.secondaryColor||'#1a1a1a';
  document.getElementById('w-bg').value=w.bgColor||'#ffffff';document.getElementById('w-text').value=w.textColor||'#333333';
  document.getElementById('w-position').value=w.position||'right';document.getElementById('w-mode').value=w.mode||'floating';
  document.getElementById('w-greeting').value=w.greeting||'';document.getElementById('w-chips').value=(w.chips||[]).join('\n');
  document.getElementById('w-header').value=w.headerTitle||'';
  const url=c.backend_url||window.location.origin;
  document.getElementById('embed-code').textContent=`<script src="${url}/widget.js" data-store="${c.shop||'tu-tienda'}"><\/script>`;
}
async function saveWidgetConfig(){
  const data={name:document.getElementById('w-name').value,avatar:document.getElementById('w-avatar').value,
    primaryColor:document.getElementById('w-primary').value,secondaryColor:document.getElementById('w-secondary').value,
    bgColor:document.getElementById('w-bg').value,textColor:document.getElementById('w-text').value,
    position:document.getElementById('w-position').value,mode:document.getElementById('w-mode').value,
    greeting:document.getElementById('w-greeting').value,chips:document.getElementById('w-chips').value.split('\n').filter(Boolean),
    headerTitle:document.getElementById('w-header').value};
  await api('/api/config/widget',{method:'PUT',body:JSON.stringify(data)});toast('Widget guardado');
}
function copyEmbed(){navigator.clipboard.writeText(document.getElementById('embed-code').textContent).then(()=>toast('Copiado'));}

// ══════ BEHAVIOR ══════
async function loadBehaviorConfig(){
  const c=await api('/api/config');if(!c?.behavior)return;const b=c.behavior;
  document.getElementById('b-prompt').value=b.systemPrompt||'';document.getElementById('b-tone').value=b.tone||'professional';
  document.getElementById('b-length').value=b.maxResponseLength||'medium';document.getElementById('b-showproducts').checked=b.showProducts!==false;
  document.getElementById('b-rules').value=b.customRules||'';document.getElementById('b-datacollect').checked=b.dataCollection?.enabled!==false;
  document.getElementById('b-askafter').value=b.dataCollection?.askAfterMessages||2;
  document.querySelectorAll('#b-fields input').forEach(cb=>{cb.checked=(b.dataCollection?.fields||['name','email']).includes(cb.value);});
  document.querySelectorAll('.chip-check input').forEach(cb=>{cb.checked=(b.goals||[]).includes(cb.value);});
}
async function saveBehaviorConfig(){
  const goals=[];document.querySelectorAll('.chip-check input:checked').forEach(cb=>goals.push(cb.value));
  const fields=[];document.querySelectorAll('#b-fields input:checked').forEach(cb=>fields.push(cb.value));
  const data={systemPrompt:document.getElementById('b-prompt').value,tone:document.getElementById('b-tone').value,
    goals,maxResponseLength:document.getElementById('b-length').value,showProducts:document.getElementById('b-showproducts').checked,
    customRules:document.getElementById('b-rules').value,
    dataCollection:{enabled:document.getElementById('b-datacollect').checked,fields,askAfterMessages:parseInt(document.getElementById('b-askafter').value),style:'conversational'}};
  await api('/api/config/behavior',{method:'PUT',body:JSON.stringify(data)});toast('Comportamiento guardado');
}

// ══════ LEADS ══════
async function loadLeads(){const d=await api('/api/analytics/leads');allLeads=d?.leads||[];document.getElementById('leads-count').textContent=allLeads.length;renderLeads(allLeads);}
function renderLeads(leads){
  const tb=document.getElementById('leads-table'),em=document.getElementById('leads-empty');
  if(!leads.length){tb.innerHTML='';em.style.display='block';return;}em.style.display='none';
  tb.innerHTML=leads.map(l=>`<tr><td><input type="checkbox" data-id="${l.id}" onchange="toggleLead(this)" ${selectedLeadIds.has(l.id)?'checked':''}></td><td class="strong">${esc(l.name||'—')}</td><td>${esc(l.email||'—')}</td><td>${esc(l.phone||'—')}</td><td>${esc(l.goal||'—')}</td><td>${badge(l.status)}</td><td style="font-weight:600;color:${l.purchaseTotal>0?'var(--green)':'var(--text4)'};">${l.purchaseTotal>0?'S/ '+l.purchaseTotal.toFixed(2):'—'}</td><td style="font-size:12px;color:var(--text3);">${fmtDate(l.createdAt)}</td></tr>`).join('');
}
function filterLeads(){const q=document.getElementById('leads-search').value.toLowerCase();renderLeads(allLeads.filter(l=>(l.name||'').toLowerCase().includes(q)||(l.email||'').toLowerCase().includes(q)));}
function toggleLead(cb){if(cb.checked)selectedLeadIds.add(cb.dataset.id);else selectedLeadIds.delete(cb.dataset.id);document.getElementById('btn-remarket-selected').disabled=selectedLeadIds.size===0;document.getElementById('rm-count').textContent=selectedLeadIds.size;}
function toggleAllLeads(cb){document.querySelectorAll('#leads-table input[type="checkbox"]').forEach(c=>{c.checked=cb.checked;toggleLead(c);});}
function exportCSV(){window.open(API+'/api/leads/export/csv','_blank');}
function openRemarketModal(){navigate('remarketing');}

// ══════ REMARKETING ══════
async function loadRemarketing(){
  const d=await api('/api/analytics/leads');const leads=(d?.leads||[]).filter(l=>l.email);
  const sel=document.getElementById('rt-lead');sel.innerHTML='<option value="">Seleccionar...</option>';
  leads.forEach(l=>{sel.innerHTML+=`<option value="${l.id}" data-email="${l.email||''}">${esc(l.name||l.email)}</option>`;});
  document.getElementById('rm-count').textContent=selectedLeadIds.size;
  sel.onchange=function(){const o=sel.options[sel.selectedIndex];if(o.value)document.getElementById('rt-email').value=o.dataset.email||'';};
}
async function sendRemarketing(){
  const ids=[...selectedLeadIds];if(!ids.length)return toast('Selecciona leads primero',true);
  const tmpl=document.getElementById('rm-template').value;
  const body={leadIds:ids};
  if(tmpl){body.templateId=tmpl;body.customData={code:document.getElementById('rm-code').value,message:document.getElementById('rm-body').value};}
  else{body.subject=document.getElementById('rm-subject').value;body.htmlBody='<p>'+(document.getElementById('rm-body').value||'').replace(/\n/g,'</p><p>')+'</p>';}
  const r=await api('/api/remarketing/send',{method:'POST',body:JSON.stringify(body)});
  if(r?.success){toast('Enviado a '+r.sent+' leads');selectedLeadIds.clear();loadLeads();}else toast(r?.error||'Error',true);
}
async function sendRoutine(){
  const leadId=document.getElementById('rt-lead').value,to=document.getElementById('rt-email').value;
  if(!to)return toast('Ingresa email',true);
  const body={to,leadId:leadId||undefined,routine:document.getElementById('rt-routine').value,nutrition:document.getElementById('rt-nutrition').value,supplements:document.getElementById('rt-supplements').value};
  const r=await api('/api/routines/send',{method:'POST',body:JSON.stringify(body)});
  if(r?.success)toast('Rutina enviada a '+r.sentTo);else toast(r?.error||'Error',true);
}

// ══════ SETTINGS ══════
async function loadSettings(){
  const s=await api('/api/settings');if(!s)return;
  document.getElementById('s-shopify').innerHTML=`<span class="status-dot ${s.shopify_connected?'status-active':'status-inactive'}"></span>${s.shopify_connected?'Conectado':'No conectado'}`;
  document.getElementById('s-llm').innerHTML=`<span class="status-dot ${s.llm_configured?'status-active':'status-inactive'}"></span>${s.llm_provider!=='none'?s.llm_provider:'No configurado'}`;
  document.getElementById('s-smtp').innerHTML=`<span class="status-dot ${s.smtp_configured?'status-active':'status-inactive'}"></span>${s.smtp_configured?'Configurado':'No configurado'}`;
  document.getElementById('s-kb').textContent=s.kb_stats?`${s.kb_stats.sources} fuentes, ${s.kb_stats.chunks} chunks`:'Sin datos';
}

// Init
loadDashboard();
