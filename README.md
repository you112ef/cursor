# Open Source Multi-Model Chat (Cloudflare Pages)

A lightweight, open-source, multi-model chat app that runs on Cloudflare Pages with Pages Functions. It provides a simple UI and a unified API to talk to multiple AI providers (OpenAI-compatible, Anthropic, Google Gemini, Mistral, Groq, OpenRouter).

- Frontend: static HTML/JS under `site/`
- API: Cloudflare Pages Functions under `functions/`
- Deploy: GitHub Actions → Cloudflare Pages

## Features
- Provider and model selector (from `/api/models`)
- Chat with streaming for OpenAI-compatible providers
- System prompt, temperature, max tokens controls
- Simple CORS for `/api/*`

## Endpoints
- `POST /api/chat`
  - Body:
    ```json
    {
      "provider": "openai|anthropic|google|mistral|groq|openrouter",
      "model": "<model-id>",
      "messages": [{"role": "user|assistant|system", "content": "..."}],
      "temperature": 0.7,
      "max_tokens": 1024,
      "stream": true
    }
    ```
  - Returns SSE stream (if supported) or JSON with `{ text, raw }`.

- `GET /api/models`
  - Returns supported providers and example model IDs used by the UI.

## Config (secrets)
Set provider keys in your Cloudflare Pages project (Settings → Environment variables):
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `MISTRAL_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`

Keys are read by Pages Functions on the server; they are not exposed to the browser.

## Deploy
- This repo includes `.github/workflows/deploy-cloudflare-pages.yml`.
- Ensure repo has GitHub Action secrets:
  - `CLOUDFLARE_API_TOKEN` (Pages:Edit)
  - `CLOUDFLARE_ACCOUNT_ID`
- `wrangler.toml` sets `pages_build_output_dir = "site"`.
- The site deploys from `site/` and includes functions from `functions/`.

## Local development
This project is static + edge functions; you can test via `wrangler pages dev` if using Wrangler locally.

## License
MIT
