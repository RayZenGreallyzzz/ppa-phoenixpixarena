# PPA Native /api/game/state — safe production release gate

**Status: NOT DEPLOYED.** The patch is a small additive route behind a default-OFF gate to `src/worker.js` on branch `feature/godot-readonly-state-20261009`; the existing Worker runtime remains `src/entry-respawn-16-25.js` → `src/entry.js` → `src/worker.js`.

## Default-OFF fail-safe and validation results

- `GET /api/game/state` is gated by the exact Worker environment setting `PPA_GODOT_STATE_READ_ENABLED=1`. With this variable **missing**, `0`, `true` or any value except the exact string `1`, the new API responds **404 NOT_FOUND** and does not read the player's save. This is the default for all normal deployments.
- Only after Cloudflare release validation, existing player sign-in checks and rollback readiness should the owner enable the exact flag in the Worker configuration. This is a deliberate **separate manual action**; enabling a variable may itself produce a new Cloudflare deployment. Never paste login tokens, private keys or real player saves into a CI job or chat.
- The live server was anonymously checked with read-only GET requests by CI on 2026-10-09: existing `/api/health` returned 200 with `ok:true`, while `/api/game/state` returned 404 (not yet installed).
- Safe predeploy CI passed with `npm run build` and `npx wrangler deploy --dry-run`, without any actual deployment or D1 mutation: https://github.com/RayZenGreallyzzz/ppa-phoenixpixarena/actions/runs/37911275386
- Feature disabled and enabled, own account, spoofed Telegram ID, incorrect game session, POST, missing bearer, and unlinked-account outcomes passed isolated handler security tests: https://github.com/RayZenGreallyzzz/ppa-phoenixpixarena/actions/runs/37911275394
- Four legacy Player3D/melee invariant jobs have unrelated baseline drift; do not alter gameplay data or marker strings just to make those jobs green. The files are identical between `main` and this branch.

## Preservation checklist for three test accounts (NOT YET COMPLETED)

- Current Cloudflare production Worker version observed in the account dashboard: `1fcd5eb8` (100% traffic). **The source commit, deploy action and rollback procedure have NOT been verified.** Do not confuse successful Cloudflare *build* with production rollout.
- Database binding in `wrangler.jsonc`: `DB` → `ppa-phoenix-db`. Confirm the actual database in Cloudflare D1 before any export. **Do not** run restore, delete, SQL UPDATE, or SQL DELETE while inspecting.
- Cloudflare Workers Free D1 Time Travel automatically retains up to 7 days of point-in-time recovery on production-backend databases. It is not a permanent independent export, and restoring rewinds **all** tables and would discard legitimate writes made since the restore timestamp.
- Before any deployment, preserve an independently held and access-controlled full D1 SQL export (schema and data) if safely available, and verify size/nonempty content. Documentation: https://developers.cloudflare.com/d1/best-practices/import-export-data/ . Restrict access: game saves, email, account identity and token hashes are sensitive. Never upload or commit the export to GitHub, GitHub Actions artifacts, shared chats or public storage.
- Note: D1 backup is **not** the same as backing up separately stored SQLite-backed RealtimeHub Durable Object state. The new API must never write either store.
- No server deployment, environment toggle, or account backup is considered completed until the corresponding action has been independently confirmed.

## Strict release boundary

- The Cloudflare configuration bundles static assets from `./public` and binds RealtimeHub Durable Objects. Therefore a regular `npm run build && wrangler deploy` may redeploy the Telegram game assets, not just the route. Verify unchanged asset fingerprints/bundle, no DO migration, and a safe rollback method *before* using production deploy.
- Once the feature-gated route is deployed with the flag absent, `GET /api/game/state` must remain 404. Only after explicit owner approval and validation of native session ownership should `PPA_GODOT_STATE_READ_ENABLED=1` be considered for a separate activation.
- The inactive route is **not** evidence that data backups exist. Backup confirmation and rollback confirmation are independent gates.

## Must pass before merge or Cloudflare release

1. Confirm that the last successfully deployed Cloudflare Worker version and asset bundle are known and one-click rollback is available. Do not replace live assets, D1 data, durable object definitions, realtime code, chat, clan, inventory or loot tables. Only the native read-only route and its default-OFF gate are authorized.
2. Run `node --check src/worker.js`, both `test-godot-state-readonly*.mjs` tests and existing save/realtime regressions. Isolated gate/handler tests and the full-build/dry-run workflow passed 2026-10-09; legacy unrelated Player3D test failures still need separate diagnosis.
3. Verify that an unrelated clean version of the current Telegram client continues working with the exact original build and that deployments will not rebuild or overwrite its static assets. If deployment includes replacing static assets or durable objects, stop and rethink the deployment boundary.
4. With the feature flag absent, verify anonymous `GET /api/game/state` returns **404 NOT_FOUND**. Only after explicit activation, verify anonymous GET returns **401 GAME_SESSION_MISSING**, POST returns **405 METHOD_NOT_ALLOWED**, and existing `/api/health`, `/api/game/me` and Telegram game state remain working.
5. Verify a legitimate game session can ONLY read its own linked Telegram player's save (original `version`, `state`, `profile`); no cross-account reads, no writes. Test account credentials/sessions must never enter CI logs.
6. Confirm production performance, client startup, game login, dungeon map, realtime and existing save versions unchanged.

## Rollback

If **any** regression appears, roll back the Cloudflare Worker to the previously recorded production version **without database migrations or D1 changes**. The new endpoint is additive and has no schema changes; removing its code is the source rollback. Do not revert game saves. Confirm legacy endpoints and client behavior after rollback.

## Status / access

- No Cloudflare account API/token/deploy connector is accessible from this chat.
- The `ppa-native-stable` launcher channel, deployed PPA Worker, and live D1 remain untouched by this PR.
- Test-only Godot client counterpart: `RayZenGreallyzzz/Phoenix-Launcher`, draft PR #25.
