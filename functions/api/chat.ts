export interface Env {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  provider: 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'openrouter';
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  max_tokens?: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const { provider, model, messages, temperature = 0.7, stream = true, max_tokens } = body;

    if (!provider || !model || !messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'Invalid request: provider, model and messages are required' }, 400);
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
      [authHeader]: authPrefix + apiKey,
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });

  // If streaming, proxy the SSE stream directly
  if (stream && resp.body) {
    const headers = new Headers(resp.headers);
    const contentType = headers.get('content-type') || 'text/event-stream';
    headers.set('content-type', contentType);
    // For Pages to stream immediately
    headers.set('transfer-encoding', 'chunked');
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

  // Split system from the rest
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

  // Gemini expects contents as role + parts
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

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}