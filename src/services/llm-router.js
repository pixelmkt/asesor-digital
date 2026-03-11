/* ═══════════════════════════════════════════════════════════════
   LLM Router v2 — Multi-provider AI engine (March 2026)
   Providers: Gemini 2.5, GPT-4o, Claude 3.7 Sonnet
   ═══════════════════════════════════════════════════════════════ */

const https = require('https');

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    // March 2026: gemini-2.5-pro, gemini-2.0-flash current production models
    models: ['gemini-2.5-pro-preview-03-25', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
    defaultModel: 'gemini-2.0-flash',
    buildRequest(apiKey, model, messages, systemPrompt, opts) {
      // Filter out empty messages and ensure alternating roles
      const filtered = messages.filter(m => m.content && m.content.trim());
      const contents = [];
      for (const m of filtered) {
        const role = m.role === 'assistant' ? 'model' : 'user';
        // Merge consecutive same-role messages (Gemini requires alternating)
        if (contents.length && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts[0].text += '\n' + m.content;
        } else {
          contents.push({ role, parts: [{ text: m.content }] });
        }
      }
      return {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
          contents,
          generationConfig: {
            temperature: opts.temperature ?? 0.7,
            maxOutputTokens: opts.maxTokens ?? 1800,
            topP: 0.95,
            topK: 40
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
          ]
        })
      };
    },
    parseResponse(data) {
      const d = JSON.parse(data);
      if (d.error) throw new Error(`Gemini: ${d.error.message}`);
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text && d.candidates?.[0]?.finishReason === 'SAFETY') throw new Error('Gemini: respuesta bloqueada por safety filters');
      const tokens = d.usageMetadata?.totalTokenCount || 0;
      return { response: text, tokensUsed: tokens };
    }
  },
  openai: {
    name: 'OpenAI (ChatGPT)',
    // March 2026: gpt-4o stable, gpt-4o-mini for cost efficiency
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'],
    defaultModel: 'gpt-4o-mini',
    buildRequest(apiKey, model, messages, systemPrompt, opts) {
      const msgs = [];
      if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
      msgs.push(...messages.filter(m => m.content && m.content.trim()).map(m => ({ role: m.role, content: m.content })));
      // o1 models don't support system messages or temperature
      const isO1 = model.startsWith('o1');
      return {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(isO1 ? { model, messages: msgs.filter(m => m.role !== 'system'), max_completion_tokens: opts.maxTokens ?? 2000 } : {
          model,
          messages: msgs,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 1800,
          top_p: 0.95
        })
      };
    },
    parseResponse(data) {
      const d = JSON.parse(data);
      if (d.error) throw new Error(`OpenAI: ${d.error.message}`);
      const text = d.choices?.[0]?.message?.content || '';
      const tokens = d.usage?.total_tokens || 0;
      return { response: text, tokensUsed: tokens };
    }
  },
  claude: {
    name: 'Anthropic (Claude)',
    // March 2026: claude-3-7-sonnet current flagship, claude-3-5-haiku for speed
    models: ['claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'],
    defaultModel: 'claude-3-7-sonnet-20250219',
    buildRequest(apiKey, model, messages, systemPrompt, opts) {
      const msgs = messages
        .filter(m => m.content && m.content.trim())
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
      // Merge consecutive same-role msgs (Claude requires alternating)
      const merged = [];
      for (const m of msgs) {
        if (merged.length && merged[merged.length - 1].role === m.role) {
          merged[merged.length - 1].content += '\n' + m.content;
        } else {
          merged.push({ ...m });
        }
      }
      // Must start with user
      if (!merged.length || merged[0].role !== 'user') merged.unshift({ role: 'user', content: 'Hola' });
      return {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'interleaved-thinking-2025-05-14'
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 1800,
          system: systemPrompt || undefined,
          messages: merged,
          temperature: opts.temperature ?? 0.7
        })
      };
    },
    parseResponse(data) {
      const d = JSON.parse(data);
      if (d.error) throw new Error(`Claude: ${d.error.message}`);
      // Filter thinking blocks, return only text
      const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
      const tokens = (d.usage?.input_tokens || 0) + (d.usage?.output_tokens || 0);
      return { response: text, tokensUsed: tokens };
    }
  }
};

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          let msg = data.substring(0, 600);
          try { const e = JSON.parse(data); msg = e.error?.message || e.message || msg; } catch {}
          reject(new Error(`LLM API Error ${res.statusCode}: ${msg}`));
        } else { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('LLM timeout (45s). Verifica tu API key.')); });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Send a chat message through the LLM router
 */
async function chat({ provider, apiKey, model, messages, systemPrompt, context, opts = {} }) {
  const prov = PROVIDERS[provider];
  if (!prov) throw new Error(`Proveedor desconocido: "${provider}". Usa: gemini, openai, claude`);
  if (!apiKey || !apiKey.trim()) throw new Error(`API key faltante para ${prov.name}`);

  const mdl = model || prov.defaultModel;

  // Build system prompt with RAG context injected
  let fullSystem = systemPrompt || '';
  if (context && context.trim()) {
    fullSystem += '\n\n---\nINFORMACION DE REFERENCIA (Knowledge Base):\nUsa la siguiente informacion para responder con precision. No inventes precios ni datos de productos que no esten aqui.\n\n' + context + '\n---';
  }

  const reqOpts = prov.buildRequest(apiKey, mdl, messages, fullSystem, opts);
  const { hostname, path, method, headers, body } = reqOpts;

  const rawResponse = await httpRequest({ hostname, path, method, headers }, body);
  const parsed = prov.parseResponse(rawResponse);

  if (!parsed.response || !parsed.response.trim()) {
    throw new Error(`${prov.name} devolvio respuesta vacia. Verifica la API key y el modelo.`);
  }

  return { ...parsed, model: mdl, provider };
}

/**
 * Quick connection test
 */
async function testConnection(provider, apiKey, model) {
  if (!apiKey || !apiKey.trim()) throw new Error('API key vacia');
  return chat({
    provider, apiKey: apiKey.trim(),
    model: model || PROVIDERS[provider]?.defaultModel,
    messages: [{ role: 'user', content: '¿Funcionas? Responde si o no.' }],
    systemPrompt: 'Asistente de prueba. Responde en una sola palabra.',
    opts: { maxTokens: 20, temperature: 0 }
  });
}

function getProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id, name: p.name, models: p.models, defaultModel: p.defaultModel
  }));
}

module.exports = { chat, testConnection, getProviders };
