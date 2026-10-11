// Generated once from the checksum-locked Telegram PPA PASSIVE_META and
// GRIMOIRE_CATALOG by tools/audit-original-skill-clan-source.mjs.
// Every one of the 40 approved passive effects remains class-bound.
// Any source change must fail parity CI rather than silently change balance.
export const ORIGINAL_PASSIVE_SKILLS = Object.freeze({
  "tank": [
    {
      "id": "tank_steel_will",
      "k": "damageReduction",
      "v": [
        3,
        5,
        8
      ]
    },
    {
      "id": "tank_tough_armor",
      "k": "defPct",
      "v": [
        6,
        10,
        15
      ]
    },
    {
      "id": "tank_unwavering",
      "k": "controlResist",
      "v": [
        8,
        14,
        20
      ]
    },
    {
      "id": "tank_defensive_reflex",
      "k": "dodge",
      "v": [
        2,
        3.5,
        5
      ]
    },
    {
      "id": "tank_battlefield_leader",
      "k": "hpPct",
      "v": [
        5,
        8,
        12
      ]
    }
  ],
  "barbarian": [
    {
      "id": "barb_relentless_rage",
      "k": "damagePct",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "barb_blood_thirst",
      "k": "vampirism",
      "v": [
        2,
        3.5,
        5
      ]
    },
    {
      "id": "barb_axe_master",
      "k": "armorPen",
      "v": [
        5,
        8,
        12
      ]
    },
    {
      "id": "barb_battle_hardened",
      "k": "hpPct",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "barb_unstoppable",
      "k": "controlResist",
      "v": [
        8,
        14,
        20
      ]
    }
  ],
  "paladin": [
    {
      "id": "pal_unbreakable_faith",
      "k": "damageReduction",
      "v": [
        2,
        4,
        6
      ]
    },
    {
      "id": "pal_fortitude",
      "k": "defPct",
      "v": [
        5,
        8,
        12
      ]
    },
    {
      "id": "pal_blessing_light",
      "k": "hpRegen",
      "v": [
        1,
        2,
        3
      ]
    },
    {
      "id": "pal_ally_defender",
      "k": "hpPct",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "pal_death_darkness",
      "k": "magicDamagePct",
      "v": [
        5,
        8,
        12
      ]
    }
  ],
  "gnome": [
    {
      "id": "gnome_engineering",
      "k": "damagePct",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "gnome_big_stock",
      "k": "mpPct",
      "v": [
        5,
        8,
        12
      ]
    },
    {
      "id": "gnome_sturdy_build",
      "k": "defPct",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "gnome_blast_wave",
      "k": "armorPen",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "gnome_sharpshooter",
      "k": "crit",
      "v": [
        2,
        3.5,
        5
      ]
    }
  ],
  "archer": [
    {
      "id": "arch_steady_hand",
      "k": "damagePct",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "arch_hunter_eye",
      "k": "crit",
      "v": [
        2,
        4,
        6
      ]
    },
    {
      "id": "arch_forest_step",
      "k": "moveSpeedPct",
      "v": [
        3,
        5,
        8
      ]
    },
    {
      "id": "arch_big_quiver",
      "k": "mpPct",
      "v": [
        5,
        8,
        12
      ]
    },
    {
      "id": "arch_camouflage",
      "k": "dodge",
      "v": [
        2,
        4,
        6
      ]
    }
  ],
  "mage": [
    {
      "id": "mage_deep_knowledge",
      "k": "mpPct",
      "v": [
        8,
        14,
        20
      ]
    },
    {
      "id": "mage_mana_regen",
      "k": "mpRegen",
      "v": [
        1,
        2,
        3
      ]
    },
    {
      "id": "mage_element_balance",
      "k": "magicDamagePct",
      "v": [
        5,
        8,
        12
      ]
    },
    {
      "id": "mage_magic_focus",
      "k": "magicPen",
      "v": [
        5,
        8,
        12
      ]
    },
    {
      "id": "mage_sage_defense",
      "k": "damageReduction",
      "v": [
        2,
        4,
        6
      ]
    }
  ],
  "assassin": [
    {
      "id": "assa_predator",
      "k": "damagePct",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "assa_deadly_accuracy",
      "k": "critDmg",
      "v": [
        10,
        18,
        25
      ]
    },
    {
      "id": "assa_shadow_dance",
      "k": "dodge",
      "v": [
        3,
        5,
        8
      ]
    },
    {
      "id": "assa_shadow_poison",
      "k": "armorPen",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "assa_last_shadow",
      "k": "damageReduction",
      "v": [
        3,
        5,
        8
      ]
    }
  ],
  "priest": [
    {
      "id": "priest_inner_light",
      "k": "magicDamagePct",
      "v": [
        4,
        7,
        10
      ]
    },
    {
      "id": "priest_blessing",
      "k": "hpRegen",
      "v": [
        1,
        2,
        3
      ]
    },
    {
      "id": "priest_divine_fortitude",
      "k": "hpPct",
      "v": [
        5,
        8,
        12
      ]
    },
    {
      "id": "priest_prayer",
      "k": "mpRegen",
      "v": [
        1,
        2,
        3
      ]
    },
    {
      "id": "priest_banish_darkness",
      "k": "magicPen",
      "v": [
        5,
        8,
        12
      ]
    }
  ]
});
