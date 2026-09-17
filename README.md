# PPA Phoenix Pix Arena — V278 Cloudflare Release

Cloudflare Workers Static Assets deployment for the Telegram/web version of PPA.

## Source parts required in repository root

Upload these four files to the repository root:

- `PPA_V278_SOURCE.gz.part1`
- `PPA_V278_SOURCE.gz.part2`
- `PPA_V278_SOURCE.gz.part3`
- `PPA_V278_SOURCE.gz.part4`

`build.mjs` joins and decompresses the V278 release, then externalizes all embedded images into `public/assets/`. The generated `index.html` is about 2.8 MiB and each asset is below Cloudflare's individual static-asset limit.

## Cloudflare Git build settings

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

The Worker is assets-only for now. Telegram authentication/gateway and online backend will be added after the client is confirmed working.
