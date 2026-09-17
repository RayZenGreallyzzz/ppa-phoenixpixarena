# PPA Phoenix Pix Arena — V278 Cloudflare Release

Cloudflare Workers Static Assets deployment for the Telegram/web version of PPA.

## Source parts in repository root

The game source is stored as these 12 uploaded binary parts:

- `PPA01.bin`
- `PPA02.bin`
- `PPA03.bin`
- `PPA04.bin`
- `PPA05.bin`
- `PPA06.bin`
- `PPA07.bin`
- `PPA08.bin`
- `PPA09.bin`
- `PPA10.bin`
- `PPA11.bin`
- `PPA12.bin`

`build.mjs` joins the 12 parts in numeric order, decompresses the V278 release, verifies the exact V278 SHA-256 checksum, then externalizes embedded images into `public/assets/`. The generated `index.html` is about 2.8 MiB.

## Cloudflare Git build settings

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

The Worker is assets-only for now. Telegram authentication/gateway and online backend will be added after the client is confirmed working.
