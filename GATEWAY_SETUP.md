# PPA Cloudflare Telegram Gateway — staged setup

The current V278 static client remains active and unchanged until the final activation step.

## What is already prepared

- `src/worker.js` — Telegram initData validation + profile/save API.
- `gateway/ppa-bridge.js` — client bridge matching the six PPA gateway methods already expected by V278.
- `schema.sql` — D1 schema for Telegram profiles, cloud saves and rename-card idempotency.

## Cloudflare steps before activation

1. Create a D1 database named `ppa-phoenix-db`.
2. Open its Console and run the complete contents of `schema.sql`.
3. Copy the D1 database ID (this is not a secret).
4. In the Worker `ppa-phoenixpixarena`, add a Secret named `BOT_TOKEN` containing the Telegram bot token. Do not commit the bot token to GitHub.
5. Add the D1 binding with binding name `DB` and database `ppa-phoenix-db`.

After those are ready, update `wrangler.jsonc` to add:

```jsonc
"main": "./src/worker.js",
"assets": {
  "directory": "./public",
  "binding": "ASSETS"
},
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "ppa-phoenix-db",
    "database_id": "<D1_DATABASE_ID>"
  }
]
```

Then update `build.mjs` so it copies `gateway/ppa-bridge.js` to `public/ppa-bridge.js`, rewrites `/game/ppa-bridge.js` to `/ppa-bridge.js`, and enables the guarded first-character registration hook.

Do not activate the bridge before both `BOT_TOKEN` and `DB` exist, otherwise Telegram launches will intentionally fail closed rather than trusting unverified identity.
