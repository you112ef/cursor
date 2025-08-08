export interface Env {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

interface ChatRequestBody {
  provider: 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'openrouter';
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  max_tokens?: number;
  use_tools?: boolean;
  allow_urls?: string[];
}

export const onRequestOptions: PagesFunction = async () => new Response(null, {
  status: 204,
  headers: corsHeaders(),
});

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const { provider, model, messages, temperature = 0.7, stream = true, max_tokens, use_tools = false, allow_urls = [] } = body;

    if (!provider || !model || !messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'Invalid request: provider, model and messages are required' }, 400);
    }

    // Tool orchestration only for OpenAI-compatible providers
    const oaiProviders = new Set(['openai', 'groq', 'openrouter', 'mistral']);
    if (use_tools && oaiProviders.has(provider)) {
      const baseUrl = provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : provider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : provider === 'openrouter'
            ? 'https://openrouter.ai/api/v1/chat/completions'
            : 'https://api.mistral.ai/v1/chat/completions';

      const apiKey = provider === 'openai' ? env.OPENAI_API_KEY
        : provider === 'groq' ? env.GROQ_API_KEY
        : provider === 'openrouter' ? env.OPENROUTER_API_KEY
        : env.MISTRAL_API_KEY;

      if (!apiKey) return json({ error: 'Missing API key for provider' }, 400);

      const { final, steps } = await runWithTools({
        url: baseUrl,
        apiKey,
        model,
        messages,
        temperature,
        max_tokens,
        allow_urls,
        extraHeaders: provider === 'openrouter' ? {
          'HTTP-Referer': 'https://github.com/you112ef/cursor',
          'X-Title': 'Open Source Multi-Model Chat',
        } : {},
      });

      return json({ text: final, steps });
    }

    switch (provider) {
      case 'openai':
        return proxyOpenAICompatible({
          url: 'https://api.openai.com/v1/chat/completions',
          apiKey: env.OPENAI_API_KEY,
          authHeader: 'Authorization',
          authPrefix: 'Bearer ',
          model,
          messages,
          temperature,
          stream,
          max_tokens,
          extraHeaders: {},
        });
      case 'groq':
        return proxyOpenAICompatible({
          url: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: env.GROQ_API_KEY,
          authHeader: 'Authorization',
          authPrefix: 'Bearer ',
          model,
          messages,
          temperature,
          stream,
          max_tokens,
          extraHeaders: {},
        });
      case 'openrouter':
        return proxyOpenAICompatible({
          url: 'https://openrouter.ai/api/v1/chat/completions',
          apiKey: env.OPENROUTER_API_KEY,
          authHeader: 'Authorization',
          authPrefix: 'Bearer ',
          model,
          messages,
          temperature,
          stream,
          max_tokens,
          extraHeaders: {
            'HTTP-Referer': 'https://github.com/you112ef/cursor',
            'X-Title': 'Open Source Multi-Model Chat',
          },
        });
      case 'mistral':
        return proxyOpenAICompatible({
          url: 'https://api.mistral.ai/v1/chat/completions',
          apiKey: env.MISTRAL_API_KEY,
          authHeader: 'Authorization',
          authPrefix: 'Bearer ',
          model,
          messages,
          temperature,
          stream,
          max_tokens,
          extraHeaders: {},
        });
      case 'anthropic':
        return proxyAnthropic({ env, model, messages, temperature, max_tokens });
      case 'google':
        return proxyGoogle({ env, model, messages, temperature, max_tokens });
      default:
        return json({ error: `Unsupported provider: ${provider}` }, 400);
    }
  } catch (err) {
    return json({ error: 'Invalid JSON body', details: String(err) }, 400);
  }
};

async function proxyOpenAICompatible(params: {
  url: string;
  apiKey?: string;
  authHeader: string;
  authPrefix: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  stream: boolean;
  max_tokens?: number;
  extraHeaders: Record<string, string>;
}): Promise<Response> {
  const { url, apiKey, authHeader, authPrefix, model, messages, temperature, stream, max_tokens, extraHeaders } = params;
  if (!apiKey) return json({ error: 'Missing API key for provider' }, 400);

  const payload: any = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature,
    stream,
  };
  if (typeof max_tokens === 'number') payload.max_tokens = max_tokens;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });

  // If streaming, proxy the SSE stream directly
  if (stream && resp.body) {
    const headers = new Headers(resp.headers);
    const contentType = headers.get('content-type') || 'text/event-stream';
    headers.set('content-type', contentType);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Headers', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return new Response(resp.body, { status: resp.status, headers });
  }

  const data = await resp.json<any>();
  if (!resp.ok) {
    return json({ error: 'Upstream error', details: data }, resp.status);
  }
  const text = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content ?? '';
  return json({ text, raw: data });
}

async function proxyAnthropic({ env, model, messages, temperature, max_tokens }: { env: Env; model: string; messages: ChatMessage[]; temperature: number; max_tokens?: number; }): Promise<Response> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'Missing ANTHROPIC_API_KEY' }, 400);

  const systemMessages = messages.filter(m => m.role === 'system');
  const system = systemMessages.map(m => m.content).join('\n\n');
  const nonSystem = messages.filter(m => m.role !== 'system');

  const payload: any = {
    model,
    system: system || undefined,
    messages: nonSystem.map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] })),
    temperature,
    max_tokens: typeof max_tokens === 'number' ? max_tokens : 1024,
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json<any>();
  if (!resp.ok) return json({ error: 'Upstream error', details: data }, resp.status);

  const text = data?.content?.map((c: any) => (c.type === 'text' ? c.text : '')).join('') ?? '';
  return json({ text, raw: data });
}

async function proxyGoogle({ env, model, messages, temperature, max_tokens }: { env: Env; model: string; messages: ChatMessage[]; temperature: number; max_tokens?: number; }): Promise<Response> {
  const apiKey = env.GOOGLE_API_KEY;
  if (!apiKey) return json({ error: 'Missing GOOGLE_API_KEY' }, 400);

  const systemPrefix = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const userAssistant = messages.filter(m => m.role !== 'system');

  const contents = [] as any[];
  if (systemPrefix) {
    contents.push({ role: 'user', parts: [{ text: `System instructions:\n${systemPrefix}` }] });
  }
  for (const m of userAssistant) {
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload: any = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: typeof max_tokens === 'number' ? max_tokens : 1024,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json<any>();
  if (!resp.ok) return json({ error: 'Upstream error', details: data }, resp.status);

  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') ?? '';
  return json({ text, raw: data });
}

async function runWithTools({ url, apiKey, model, messages, temperature, max_tokens, allow_urls, extraHeaders }: { url: string; apiKey: string; model: string; messages: ChatMessage[]; temperature: number; max_tokens?: number; allow_urls: string[]; extraHeaders: Record<string,string>; }): Promise<{ final: string; steps: any[] }> {
  const steps: any[] = [];
  const toolset = getToolset(allow_urls);
  const toolDefs = toolset.schemas;

  const convo = messages.map(m => ({ role: m.role, content: m.content }));

  for (let i = 0; i < 8; i++) { // cap tool iterations
    const payload: any = {
      model,
      messages: convo,
      temperature,
      stream: false,
      tools: toolDefs,
      tool_choice: 'auto',
    };
    if (typeof max_tokens === 'number') payload.max_tokens = max_tokens;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + apiKey, ...extraHeaders },
      body: JSON.stringify(payload),
    });
    const data = await resp.json<any>();
    if (!resp.ok) return { final: JSON.stringify({ error: 'Upstream error', details: data }), steps };

    const choice = data?.choices?.[0];
    const message = choice?.message;
    const content = message?.content || '';
    const toolCalls = message?.tool_calls || [];

    if (!toolCalls || toolCalls.length === 0) {
      return { final: content, steps };
    }

    // Execute tools sequentially and append results
    for (const call of toolCalls) {
      const name = call.function?.name as string;
      const argsRaw = call.function?.arguments as string;
      let args: any = {};
      try { args = JSON.parse(argsRaw || '{}'); } catch {}
      const result = await toolset.execute(name, args);
      steps.push({ name, args, result });
      // Per OpenAI spec, append tool message with tool_call_id
      convo.push({ role: 'assistant', content: '', });
      convo.push({ role: 'tool', name, tool_call_id: call.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
    }
  }
  return { final: 'Tool iteration limit reached.', steps };
}

function getToolset(allowUrls: string[]) {
  const allowed = new Set(allowUrls.map(normalizeOrigin));

  const schemas = [
    {
      type: 'function',
      function: {
        name: 'time_now',
        description: 'Get the current UTC timestamp and ISO string.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'math_eval',
        description: 'Evaluate a basic arithmetic expression. Supports + - * / % parentheses and decimals.',
        parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'], additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'http_get_text',
        description: 'Fetch a text/HTML page from an allowed origin and return text content.',
        parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'http_get_json',
        description: 'Fetch a JSON API from an allowed origin and return parsed JSON.',
        parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'extract_links',
        description: 'Extract absolute links from an HTML string.',
        parameters: { type: 'object', properties: { html: { type: 'string' } }, required: ['html'], additionalProperties: false },
      },
    },
  ];

  return {
    schemas,
    async execute(name: string, args: any): Promise<any> {
      switch (name) {
        case 'time_now': {
          const now = new Date();
          return { epochMs: Date.now(), iso: now.toISOString() };
        }
        case 'math_eval': {
          const expr = String(args?.expression || '').trim();
          if (!/^[-+*/%().\d\s]+$/.test(expr)) return { error: 'Invalid expression' };
          try { /* eslint-disable no-eval */ const val = (0, eval)(expr); return { result: val }; } catch (e) { return { error: String(e) }; }
        }
        case 'http_get_text': {
          const url = String(args?.url || '');
          if (!isAllowed(url, allowed)) return { error: 'URL not allowed' };
          const res = await fetch(url, { headers: { 'user-agent': 'PagesBot/1.0 (+cf-pages)' } });
          const text = await res.text();
          return { status: res.status, text: text.slice(0, 20000) };
        }
        case 'http_get_json': {
          const url = String(args?.url || '');
          if (!isAllowed(url, allowed)) return { error: 'URL not allowed' };
          const res = await fetch(url, { headers: { 'user-agent': 'PagesBot/1.0 (+cf-pages)' } });
          let data: any = null; try { data = await res.json(); } catch { data = await res.text(); }
          return { status: res.status, data };
        }
        case 'extract_links': {
          const html = String(args?.html || '');
          const links = Array.from(html.matchAll(/href=["']([^"']+)["']/gi)).map(m => m[1]);
          return { links };
        }
        default:
          return { error: `Unknown tool: ${name}` };
      }
    },
  };
}

function isAllowed(rawUrl: string, allowed: Set<string>): boolean {
  try {
    const u = new URL(rawUrl);
    const origin = normalizeOrigin(u.origin);
    if (allowed.size === 0) return true; // if no allowlist provided, permit for demo
    return allowed.has(origin);
  } catch { return false; }
}

function normalizeOrigin(origin: string): string {
  try { return new URL(origin).origin.toLowerCase(); } catch { return origin.toLowerCase(); }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  } as Record<string, string>;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() },
  });
}