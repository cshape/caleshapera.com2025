# Cloudflare Worker

Chat API backend using OpenAI GPT-4.1, deployed to `empty-sky-58f0.caleshapera.workers.dev`.

## Commands

```bash
npm run dev      # Local dev server on :8787
npm run deploy   # Deploy to Cloudflare
npm run tail     # Stream production logs
```

## Local Development

1. Create a `.dev.vars` file with your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-key-here
   ```

2. Run locally:
   ```bash
   npm run dev
   ```

## Production Deployment

1. Set your OpenAI API key as a secret:
   ```bash
   wrangler secret put OPENAI_API_KEY
   ```

2. Deploy:
   ```bash
   npm run deploy
   ```
