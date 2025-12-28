# caleshapera.com

Personal website with minimal academic aesthetic.

## Development

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Build

```bash
npm run build
```

## Deploy

Pushes to `main` automatically deploy via GitHub Actions to GitHub Pages.

**Setup (one-time):**
1. Go to repo Settings → Pages
2. Set Source to "GitHub Actions"

## Worker

Chat backend lives in `/worker`. See [worker/README.md](./worker/README.md).

```bash
cd worker
npm install
npm run dev      # Local: localhost:8787
npm run deploy   # Deploy to Cloudflare
```
