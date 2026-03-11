/* ═══════════════════════════════════════════════════════════════
   LLM Router — Multi-provider AI engine
   Supports: Gemini (Google), OpenAI (ChatGPT), Claude (Anthropic)
   ═══════════════════════════════════════════════════════════════ */

const https = require('https');

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-flash'],
    defaultModel: 'gemini-2.0-flash',
    buildRequest(apiKey, model, messages, systemPrompt, opts) {
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
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
            topP: 0.95
          }
        })
      };
    },
    parseResponse(data) {
      const d = JSON.parse(data);
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const tokens = d.usageMetadata?.totalTokenCount || 0;
      return { response: text, tokensUsed: tokens };
    }
  },
  openai: {
    name: 'OpenAI (ChatGPT)',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    buildRequest(apiKey, model, messages, systemPrompt, opts) {
      const msgs = [];
      if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
      msgs.push(...messages);
      return {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
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
      const text = d.choices?.[0]?.message?.content || '';
      const tokens = d.usage?.total_tokens || 0;
      return { response: text, tokensUsed: tokens };
    }
  },
  claude: {
    name: 'Anthropic (Claude)',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'],
    defaultModel: 'claude-sonnet-4-20250514',
    buildRequest(apiKey, model, messages, systemPrompt, opts) {
      const msgs = messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));
      return {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 1800,
          system: systemPrompt || undefined,
          messages: msgs,
          temperature: opts.temperature ?? 0.7
        })
      };
    },
    parseResponse(data) {
      const d = JSON.parse(data);
      const text = d.content?.[0]?.text || '';
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
          reject(new Error(`LLM API ${res.statusCode}: ${data.substring(0, 500)}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('LLM request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Send a chat message to the configured LLM
 * @param {Object} params
 * @param {string} params.provider - 'gemini' | 'openai' | 'claude'
 * @param {string} params.apiKey - API key for the provider
 * @param {string} params.model - Model name (optional, uses default)
 * @param {Array}  params.messages - [{role:'user'|'assistant', content:'...'}]
 * @param {string} params.systemPrompt - System instructions
 * @param {string} params.context - RAG context to prepend
 * @param {Object} params.opts - {temperature, maxTokens}
 * @returns {Promise<{response:string, tokensUsed:number, model:string, provider:string}>}
 */
async function chat({ provider, apiKey, model, messages, systemPrompt, context, opts = {} }) {
  const prov = PROVIDERS[provider];
  if (!prov) throw new Error(`Unknown LLM provider: ${provider}. Valid: gemini, openai, claude`);
  if (!apiKey) throw new Error(`Missing API key for ${prov.name}`);

  const mdl = model || prov.defaultModel;

  // Build full system prompt with RAG context
  let fullSystem = systemPrompt || '';
  if (context) {
    fullSystem += '\n\n--- KNOWLEDGE BASE ---\nUsa la siguiente informacion como referencia para responder. Si la pregunta no se relaciona con esta informacion, responde de forma general pero sin inventar datos de productos o precios.\n\n' + context;
  }

  const reqOpts = prov.buildRequest(apiKey, mdl, messages, fullSystem, opts);
  const { hostname, path, method, headers, body } = reqOpts;

  const rawResponse = await httpRequest({ hostname, path, method, headers }, body);
  const parsed = prov.parseResponse(rawResponse);

  return {
    ...parsed,
    model: mdl,
    provider: provider
  };
}

/**
 * Test the LLM connection
 */
async function testConnection(provider, apiKey, model) {
  return chat({
    provider, apiKey, model,
    messages: [{ role: 'user', content: 'Responde con una sola palabra: funciona.' }],
    systemPrompt: 'Eres un asistente de prueba.',
    opts: { maxTokens: 50, temperature: 0 }
  });
}

function getProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id, name: p.name, models: p.models, defaultModel: p.defaultModel
  }));
}

module.exports = { chat, testConnection, getProviders };
