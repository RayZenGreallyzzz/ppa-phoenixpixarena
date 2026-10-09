# PPA dungeon mob artwork — approved correction (2026-10-08)

This is the canonical **visual correction** agreed after comparing the CURRENT PPA gameplay video with old Library art. **No runtime code is changed by this document.**

## Authoritative names and levels — CURRENT PPA gameplay video

The in-game footage confirms the complete dungeon 1–20 sequence, **not** a five-level category-mixing bestiary:

| Level | Current in-game mob |
|---:|---|
| 1 | Пепельная крыса |
| 2 | Пещерный паук |
| 3 | Обугленный жук |
| 4 | Слайм-падальщик — green, red and blue variants mixed within level 4 |
| 5 | Костяной грызун |
| 6 | Гоблин-разведчик |
| 7 | Костяной воин |
| 8 | Пепельный волк |
| 9 | Грибная тварь |
| 10 | Гоблин-шаман |
| 11 | Культист |
| 12 | Проклятый рыцарь |
| 13 | Каменный голем |
| 14 | Лавовый элементаль |
| 15 | Пепельный страж |
| 16 | Адская гончая |
| 17 | Огненный демон |
| 18 | Пустотный наблюдатель |
| 19 | Элитный голем |
| 20 | Пепельный палач |

**Phoenix20 is a boss after the twentieth level**, not another normal mob. No evidence in this video validates levels 21–60; their graphics remain pending explicit comparison.

Old lists that place «Падальщик» bird at level 4 are obsolete. The existing test ZIP in Godot also contained that bird; do not reuse it.

## Art-to-level rule

Each spawn uses the art of **its own level**; do not assign a random monster from a broad level bracket. At level 4 only, select green/red/blue *slimes* based on stable spawn ID. All three need distinct verified source images. This visual selection must not change HP, attacks, server ownership, XP, loot, collisions, or spawn coordinates.

## Protected game systems

- Keep the accepted **stone dungeon floor**, adjusted collision mask, its alignment, and room coordinates.
- Keep monster IDs, levels, HP, damage, drop tables, respawn, pathfinding, spawn density, boss positions and server-authoritative multiplayer behavior unchanged.
- Do not restore **Падальщик** bird artwork in place of the slime.
- Do not use Fart-zone monsters as dungeon replacements.
- The old Library "Атлас монстров «Пепел Феникса»" still displays the obsolete bird. Its labels and brown gradient backgrounds mean it **is not a clean runtime sprite atlas**.
- The separate Godot private QA branch `feature/godot-private-unreleased-mobs-qa` uses a **five-candidate** (reaper/spider/tentacle/guard/golem) preview modulo mapping; it is **not** an approved dungeon bestiary. Never merge candidate mapping into Telegram PPA or claim that QA APK proves parity.

## Safe verification

Run the **read-only** audit before changing art:

```bash
node tools/audit-dungeon-mob-art-20261008.mjs
```

It unpacks the current PPA source, inventories textual monster references and embedded image data, and writes `audit-output/dungeon-mob-art-current.json`. Finding a monster name **does not** prove its correct sprite is displayed: verify the actual image binding, isolated alpha, animation directions/frame grid and mobile FPS before integration. Use a test branch with rollback; do not alter live assets or game logic based solely on poster art.
