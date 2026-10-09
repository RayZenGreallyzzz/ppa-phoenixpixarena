# Encrypted one-off D1 backup (independent of game server PR)

**PREPARED, NOT RUN. NO ACTUAL BACKUP EXISTS YET.**

Purpose: preserve the full existing `ppa-phoenix-db` for the owner's local archive before any live Worker changes. This branch is separate from server PR #27 and the real Godot client in Phoenix-Launcher.

1. Owner stores `PPA_D1_BACKUP_PASSWORD` as a second GitHub Actions Secret, a strong unique password, and keeps a copy privately on their device. Never send it to ChatGPT or commit it.
2. After explicit approval to temporarily pause D1 queries, a restricted one-off CI workflow can stream `tools/d1-private-export-to-stdout.mjs` directly to 7-Zip AES256 encryption (`7z a -mhe=on -pPASSWORD -si`). Only the encrypted `.7z` artifact is uploaded privately. No raw SQL, game saves, signed URLs or access tokens enter logs/artifacts.
3. Owner downloads the encrypted archive, confirms they can decrypt it locally, and retains it offline. A D1 backup does not include Durable Objects.

The Cloudflare export API can briefly interrupt D1 query service (see https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/). No export should run without owner permission. The `D1 Read` token may be insufficient for the export; do not automatically give it `D1 Edit` privileges.

No production deployment, schema modification, Godot APK change, or character save write is part of this isolated preparation.