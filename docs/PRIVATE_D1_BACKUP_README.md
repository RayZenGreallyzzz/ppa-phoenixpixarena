# One-off PRIVATE encrypted D1 backup — owner-approved only

**STATUS: EXPORT NOT EXECUTED. PRODUCTION BACKUP BLOCKED IN THIS PUBLIC REPOSITORY. No separate backup exists yet.**

Database: `ppa-phoenix-db` (existing PPA D1). This backup never writes character saves, uploads unencrypted data, changes `main`, deploys Cloudflare or ships an APK. It is intentionally developed on separate branch `ops/d1-private-backup-20261009`.

## What is ready

- `tools/d1-private-export-to-stdout.mjs`: validates Cloudflare D1 identity, requests full schema/data export and streams SQL into an encrypting process. Does not print SQL or signed download URLs to action logs.
- `.github/workflows/ppa-d1-encrypted-export-after-approval.yml`: staged 7-Zip AES256 encrypted export. **This repository is PUBLIC. GitHub Actions artifacts here are readable by anyone with public repository access, even if the inner 7z archive is encrypted.** The workflow now refuses to run any live export unless GitHub confirms the repository is private. Three-day retention is not equivalent to privacy.
- `.github/workflows/check-private-d1-backup.yml` and `tools/test-d1-private-export-approval-offline.mjs`: test no-token abort and verify that only explicit approval marker can trigger export. These checks **do not contact D1**.
- The owner needs two secrets in whichever **PRIVATE backup repository** runs the export: `CLOUDFLARE_D1_READ_TOKEN` and `PPA_D1_BACKUP_PASSWORD`. Do not share secret values in ChatGPT or screenshots. Tokens/backup password must not be stored in GitHub source.

## Essential privacy correction (2026-10-09)

**Do not start this workflow in the current public repo.** A copy of the export workflow can be reviewed and hosted inside a separate private GitHub repository created by the owner, with secret values set only in that private repository. That private workflow must be re-audited, run once with owner approval, and its artifacts downloaded and verified by the owner before considering the backup complete. Do not change the visibility of the live PPA game repository as an unreviewed workaround: Cloudflare integration and deployed game source may depend on it.

## BEFORE RUNNING

**Important:** Cloudflare documents that a running D1 export **blocks other database requests temporarily**: https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations. Ask the owner to approve that short interruption, even if only 3 test accounts are active. Do not invent/export silently. The D1 Read-only API token may be insufficient for the export endpoint; if it is rejected, stop. Never automatically elevate rights to Edit.

1. Before explicit approval, `ops/run-ppa-d1-export-20261009.approved` **MUST NOT exist**.
2. Only after repository privacy is secured, both secrets are installed in the private backup repository, and clear owner approval for a short D1 pause, create exactly this file on the isolated branch with content: `OWNER_EXPLICITLY_APPROVED_BRIEF_D1_EXPORT_INTERRUPTION_20261009`.
3. This *single specific path addition* starts the one-off GitHub Actions job. Editing other files or pushing other commits does not start an export. GitHub manual `workflow_dispatch` is unavailable here because the file is deliberately not on default `main`.
4. Job aborts when either GitHub Secret is missing or if Cloudflare refuses access. It must not upload a misleading or unencrypted backup.
5. Owner downloads `PPA-D1-PRIVATE-ENCRYPTED-20261009` artifact (ZIP containing an encrypted 7z file) from the job within 3 days, moves it to safe local offline storage, and uses their private password in a 7z-compatible Android archive tool to test extraction. An encrypted artifact in a public repository is not private. A private-repository artifact is still NOT the sole permanent backup; verify file and decryption personally.
6. NEVER share/export the decrypted SQL backup to the chat, GitHub repository, or public cloud drives; it contains Telegram account identifiers and possibly token hashes. A D1 backup does not include Durable Object storage. After backup, verify game login and D1 responses are back to normal.

No live export or production deployment has been performed merely by preparing these files.
