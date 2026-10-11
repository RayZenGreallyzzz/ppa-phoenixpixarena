# PPA cross-client checkpoint — 2026-10-10

> **STOP/RESUME POINT.** The user owns an existing live Telegram Phoenix Pix Arena (PPA) and a Godot 4.6 Android client. These are **ONE GAME** with one canonical server, character, currency, gear and world. Never invent a second Godot economy or local bag. Never overwrite/reset production D1 saves.
>
> **NOT DEPLOYED / NOT RELEASED.** Both referenced PRs are open **drafts**, not merged. These changes are not yet known to be live in Cloudflare or installed as an APK. Do not confuse successful CI with a cross-client field test.

## Exact work branches and checkpoint

| Component | Repository | Branch | PR | Head SHA before this checkpoint |
|---|---|---|---|---|
| Original Telegram/Cloudflare backend | `RayZenGreallyzzz/ppa-phoenixpixarena` | `feature/ppa-shared-forge-material-view-20261010` | [#34](https://github.com/RayZenGreallyzzz/ppa-phoenixpixarena/pull/34) | `52c15c679d085fe3a57e82cc4f92837b16da1542` |
| Godot/Android client | `RayZenGreallyzzz/Phoenix-Launcher` | `feature/godot-shared-forge-material-view-20261010` | [#33](https://github.com/RayZenGreallyzzz/Phoenix-Launcher/pull/33) | `2583238c5059c85d9aa1c9991c98a54cf6b920e6` |

**Stacked branches:** Server #34 is based on `feature/native-shared-clan-merchant-20261010`; Godot #33 is based on `feature/godot-shared-clan-merchant-20261010`. Preserve the dependency/merge order; do NOT casually merge a leaf PR directly into main.

**Current automated checks:** Server commit above: four completed GREEN checks (`Test native canonical clan actions`, `Verify Godot shared realtime integration (safe)`, `Test save protection`, `Verify signed PPA forge material projection`). Godot commit above: two completed GREEN checks (`Test Godot shared clan and merchant commands`, `Test Godot shared city protocol`). These do NOT establish production readiness or APK signature validity. Subsequent documentation-only commits may advance the branch SHA without modifying code.

## What exists in the test branches

- Shared account/session, server-side realtime, NPC menus and original PPA save snapshots (earlier dependent PRs).
- Original smith 58 recipes (legendary gear, pets, wings, cloak/necklace/artifact etc), canonical material/feather balance, craft and +1..+7 enhancement, premium stones/runes, pet bonuses; special adaptive Stellar Guardian remains intentionally restricted.
- Authentic UID-based bag/equipped move, 100-slot bag, 200-slot personal vault, 500-slot clan vault. Clan put/take guards owner, clan membership, member permissions, save version and clan_meta state in one D1 transaction.
- **Auction:** Original `auction_lots` / `auction_credits` / `saves`, not a separate native market. Telegram `src/online.js` purchase now uses transactional lot/buyer/10%-fee seller credit CAS. Native `src/shared-auction-actions.js` supports real-gear place / buy / cancel / recover expired listings with original item UID, stats and enhancement; seller escrow proof lives in `ppa_native_auction_escrow` with item SHA-256. Unverified old Telegram listings stay browse-only from Godot. Full bag blocks recover without discarding the item.
- **Seller credits (current unfinished rollout):** Original Telegram historically applied pending `auction_credits` to its local INV then saved the character and sent `/api/auction/ack-credits`. New `src/shared-auction-credit-claim.js` can atomically change the server save balance and mark one credit ACKed, using a save-version + credit CAS transaction, but is **disabled by default**. New `src/online.js` splits legacy credits before explicit `PPA_AUCTION_SERVER_CREDIT_CUTOFF_MS` from server-claim credits after that cutoff; `gateway/ppa-bridge.js` adds `ppaAuctionServerCredits` / `ppaAuctionClaimCredit`, and a save-write gate awaiting reload. Godot auction NPC has a claim button **only** when the signed server snapshot advertises `serverCreditClaimsEnabled` and `canClaim`.
- Signed Godot auction client `games/ppa-native/scripts/ppa_native_auction_service.gd` with action retry and state refresh; Godot headless offline test `test_native_auction_credit_claim.gd`. Existing tests cover escrow, purchases, recover, gear +7, no double spend.

## Safety and feature gates

All newly introduced flags remain OFF unless explicitly coordinated and validated; in particular:
`PPA_AUCTION_READ_ENABLED`, `PPA_AUCTION_ACTIONS_ENABLED`,
`PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED`,
`PPA_AUCTION_SERVER_CREDIT_CUTOFF_MS`,
`PPA_INVENTORY_READ_ENABLED`, `PPA_INVENTORY_ACTIONS_ENABLED`,
`PPA_PERSONAL_STORAGE_READ_ENABLED`, `PPA_PERSONAL_STORAGE_ACTIONS_ENABLED`,
`PPA_CLAN_STORAGE_READ_ENABLED`, `PPA_CLAN_STORAGE_ACTIONS_ENABLED`,
and forge-related flags (`PPA_FORGE_READ_ENABLED`,
`PPA_FORGE_ACTIONS_ENABLED`, `PPA_FORGE_ENHANCE_ENABLED`).

**Never flip the credit claim flag / choose a cutoff without a staged compatibility plan and D1 backup.** Old Telegram HTML or cached mobile clients may perform legacy local credit application or submit stale saves. An explicit timestamp alone does not prove old clients cannot double-pay. Verify the actual Telegram game client and gateway migration behavior, old pending credits, post-cutoff credits, ACK races and crash/restart cases.

## Release blockers (NOT solved)

1. Finish/verify original Telegram client bridge for post-cutoff server credits, including reload after claim, cached-old-client safety and version/conflict recovery.
2. Cross-client integration tests with realistic Cloudflare D1 transaction semantics and **two simultaneous** Godot/Telegram sessions, including seller payout, legacy lot provenance and return of expired items. Offline SQLite/Godot tests alone are not sufficient.
3. Review original Telegram-origin lot escrow/expiry/cancel and permission model before enabling native purchases of old listings.
4. Coordinate stacked PR integration and safe Cloudflare staging/production rollout only after backup and verification.
5. Build a genuinely installable original-package Godot 4.6 APK (`com.phoenixgames.ppa`, **same signing certificate as installed APK**, higher versionCode); verify actual workflow artifacts, not an older debug APK. Then compare native vs Telegram inventory, balance, skills, NPC, clans, market and realtime on devices.
6. Do not accidentally regress existing tablet layout, joystick, dungeon geometry, sprites, FPS or Telegram live functionality.

## Immediate next step after a chat limit / interruption

1. Read this file and [Godot counterpart](https://github.com/RayZenGreallyzzz/Phoenix-Launcher/blob/feature/godot-shared-forge-material-view-20261010/docs/checkpoints/PPA_SHARED_WORLD_AUCTION_2026-10-10.md).
2. Fetch actual HEADs and GitHub Actions status for PRs #34/#33; **do not assume the SHAs above are still HEAD after docs commits**.
3. Inspect and validate `src/shared-auction-credit-claim.js`, `src/online.js`, `gateway/ppa-bridge.js`, `gateway/online-client.js`, Godot `ppa_npc_screen.gd`, and both auction credit test scripts.
4. Reconcile legacy seller payout and new server-claim mode; run CI and fix any failures without deploying.
5. Do not merge, enable write flags or promise an APK until its exact artifact and matching signature have been verified.

**Resume instruction for next chat (copy/paste):** «Продолжи PPA по контрольной точке `docs/checkpoints/PPA_SHARED_WORLD_AUCTION_2026-10-10.md` из веток PR #34 сервера и PR #33 Godot. Сначала проверь HEAD и CI, затем совместимость выплат аукциона Telegram/Godot. Никаких изменений в production и никаких откатов; APK только после общей проверки.»
