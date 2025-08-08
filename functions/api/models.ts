export const onRequestGet: PagesFunction = async () => {
  const providers = [
    {
      id: 'openai',
      name: 'OpenAI',
      streaming: true,
      models: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      ],
    },
    {
      id: 'groq',
      name: 'Groq (OAI-compatible)',
      streaming: true,
      models: [
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
      ],
    },
    {
      id: 'openrouter',
      name: 'OpenRouter (OAI-compatible)',
      streaming: true,
      models: [
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku (via OpenRouter)' },
        { id: 'google/gemini-1.5-flash', name: 'Gemini 1.5 Flash (via OpenRouter)' },
      ],
    },
    {
      id: 'mistral',
      name: 'Mistral',
      streaming: true,
      models: [
        { id: 'mistral-small-latest', name: 'Mistral Small Latest' },
        { id: 'open-mistral-7b', name: 'Open Mistral 7B' },
      ],
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      streaming: false,
      models: [
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
        { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet' },
      ],
    },
    {
      id: 'google',
      name: 'Google Gemini',
      streaming: false,
      models: [
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      ],
    },
  ];

  return new Response(JSON.stringify({ providers }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};