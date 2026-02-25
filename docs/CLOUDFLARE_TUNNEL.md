# Cloudflare Tunnel Configuration for Vowel Core

Vowel Core can be exposed via Cloudflare Tunnel for local development and testing with a public URL (e.g. for WebSocket connections, OAuth callbacks, or mobile testing).

## Prerequisites

- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/) installed
- Cloudflare account with Zero Trust / Access
- Tunnel token from Cloudflare dashboard

## Setup

1. **Create a Cloudflare Tunnel** (if not already done):
   - Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → Networks → Tunnels
   - Create a tunnel, choose "Cloudflared"
   - Configure a public hostname (e.g. `testing-core.vowel.to`) to route to `localhost:3000`
   - Copy the tunnel token

2. **Add token to `.env`** (never commit this file):

   ```env
   CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token_here
   ```

3. **Start Core** (in one terminal):

   ```bash
   bun run dev
   # or: docker run -p 3000:3000 vowel-core
   # or: bun run dev:stack # API + UI local dev servers together
   ```

4. **Start the tunnel**

   ```bash
bun run tunnel            # tunnel only (Core already running)
bun run dev:tunnel        # run Core dev server (API + UI) and tunnel together
                          # (skips starting API/UI if already running)
   ```

## Environments

| Environment | Port | Domain                 |
|-------------|------|------------------------|
| testing     | 3000 | testing-core.vowel.to  |
| dev         | 3001 | core-dev.vowel.to      |
| staging     | 3002 | staging-core.vowel.to  |
| production  | 3003 | core.vowel.to          |

Use a different environment:

```bash
bun run tunnel               # tunnel only
bun run dev:tunnel:dev       # dev stack + tunnel
```

## Security (Open Source)

- **Never commit** `.env` or `CLOUDFLARE_TUNNEL_TOKEN`
- `.env` and `.env.local` are in `.gitignore`
- `.cloudflared/` (tunnel config) is gitignored
- Use `.env.example` as a template (no real tokens)
