# PPA Native /api/game/state — safe production release gate

**Status: NOT DEPLOYED.** The patch is a 29-line addition to `src/worker.js` on branch `feature/godot-readonly-state-20261009`; the existing Worker runtime remains `src/entry-respawn-16-25.js` → `src/entry.js` → `src/worker.js`.

## Must pass before merge or Cloudflare release

1. Confirm that the last successfully deployed Cloudflare Worker version and asset bundle are known and one-click rollback is available. Do not replace live assets, D1 data, durable object definitions, realtime code, chat, clan, inventory or loot tables. Only the 29-line GET route is authorized.
2. Run `node --check src/worker.js` and `node tools/test-godot-state-readonly.mjs`, plus existing save-recovery / realtime regression checks. GitHub Actions for the **private** PPA repository currently conclude before executing any steps; do NOT treat those failures as successful tests.
3. Verify that an unrelated clean version of the current Telegram client continues working with the exact original build and that deployments will not rebuild or overwrite its static assets. If deployment includes replacing static assets or durable objects, stop and rethink the deployment boundary.
4. Verify anonymous `GET /api/game/state` returns **401 GAME_SESSION_MISSING**; anonymous `POST /api/game/state` returns **405 METHOD_NOT_ALLOWED**; old routes `/api/health`, `/api/game/me` and Telegram game state continue working.
5. Verify a legitimate game session can ONLY read its own linked Telegram player's save (original `version`, `state`, `profile`); no cross-account reads, no writes. Test account credentials/sessions must never enter CI logs.
6. Confirm production performance, client startup, game login, dungeon map, realtime and existing save versions unchanged.

## Rollback

If **any** regression appears, roll back the Cloudflare Worker to the previously recorded production version **without database migrations or D1 changes**. The new endpoint is additive and has no schema changes; removing its code is the source rollback. Do not revert game saves. Confirm legacy endpoints and client behavior after rollback.

## Status / access

- No Cloudflare account API/token/deploy connector is accessible from this chat.
- The `ppa-native-stable` launcher channel, deployed PPA Worker, and live D1 remain untouched by this PR.
- Test-only Godot client counterpart: `RayZenGreallyzzz/Phoenix-Launcher`, draft PR #25.
