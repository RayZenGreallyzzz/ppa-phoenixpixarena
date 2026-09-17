# PPA Phoenix Pix Arena — V278 Cloudflare Release

Cloudflare Workers Static Assets deployment for the Telegram/web version of PPA.

## Source parts required in repository root

Upload these 12 smaller files to the repository root:

- `PPA_V278_SOURCE.gz.part01`
- `PPA_V278_SOURCE.gz.part02`
- `PPA_V278_SOURCE.gz.part03`
- `PPA_V278_SOURCE.gz.part04`
- `PPA_V278_SOURCE.gz.part05`
- `PPA_V278_SOURCE.gz.part06`
- `PPA_V278_SOURCE.gz.part07`
- `PPA_V278_SOURCE.gz.part08`
- `PPA_V278_SOURCE.gz.part09`
- `PPA_V278_SOURCE.gz.part10`
- `PPA_V278_SOURCE.gz.part11`
- `PPA_V278_SOURCE.gz.part12`

Each file is about 6.5 MiB to make GitHub mobile upload more reliable.

`build.mjs` joins and decompresses the V278 release, verifies the exact V278 SHA-256 checksum, then externalizes all embedded images into `public/assets/`. The generated `index.html` is about 2.8 MiB.

## Cloudflare Git build settings

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

The Worker is assets-only for now. Telegram authentication/gateway and online backend will be added after the client is confirmed working.
