# PPA dungeon mob artwork — approved correction (2026-10-08)

This is the canonical **visual correction** agreed after comparing the CURRENT PPA gameplay video with old Library art. **No runtime code is changed by this document.**

## Confirmed starter dungeon monsters

1. **Пепельная крыса** — ash rat
2. **Пещерный паук** — cave spider
3. **Обугленный жук** — charred beetle
4. **Слайм-падальщик** — slime scavenger, **NOT** the older vulture-like **Падальщик**

The current gameplay video includes "Слайм-падальщик" at level 4. Other existing enemies through Phoenix20 are present in the running client. Do not invent or overwrite the remaining names, level-to-monster mappings or artwork from an old poster.

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
