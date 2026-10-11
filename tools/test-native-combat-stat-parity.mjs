import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditOriginalStatAllocation, auditOriginalEquippedEnhancements }
  from '../src/native-combat-stat-parity.js';
import { projectNativeCombatProfileReadOnly } from '../src/native-combat-profile-readonly.js';
import { ENH_STAT_BONUS,applyOriginalEnhancementStats }
  from '../src/shared-sharpen.js';

// Compare with the checksummed original Telegram game build's exact
// stat-point cap patch. If source changes, do NOT silently keep old formula.
const build=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
assert.match(build,/EXPECTED_SOURCE_SHA256\s*=\s*'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7'/);
assert(build.includes('const STAT_POINT_MAX_BY_STAT={hp:200,mp:200,atk:200}'),
  'Original Telegram PPA changed its special stat caps');
assert(build.includes('return STAT_POINT_MAX_BY_STAT[stat]||STAT_POINT_MAX'),
  'Canonical per-stat stat cap formula changed');
assert(build.includes('function dodgeStatPointCap()'),
  'Dodge needs runtime dynamic cap; never certify it from D1 alone');
assert.deepEqual(ENH_STAT_BONUS,[0,.06,.14,.24,.36,.50,.68,.90]);

const good=Object.fromEntries(['hp','mp','atk','def','spd',
  'atkspd','critdmg','crit','dodge'].map(key=>[key,0]));
Object.assign(good,{hp:200,mp:200,atk:200,def:100,crit:100,dodge:100});
const unchanged=JSON.stringify(good);
const checked=auditOriginalStatAllocation(good);
assert.equal(checked.status,'STATIC_CAPS_MATCH');
assert.equal(checked.perStat.hp.staticCap,200);
assert.equal(checked.perStat.mp.staticCap,200);
assert.equal(checked.perStat.atk.staticCap,200);
assert.equal(checked.perStat.crit.staticCap,100);
assert.equal(checked.perStat.dodge.staticCap,100);
assert.equal(checked.dodgeRuntimeCapVerified,false);
for (const bad of [{...good,def:101},{...good,hp:201},{...good,atk:201},
  {...good,dodge:101},{...good,crit:-1},{...good,mp:4.5},
  {...good,spd:Infinity},{...good,def:'80'}]) {
  assert.equal(auditOriginalStatAllocation(bad).allStaticCapsSatisfied,false,
    'Noncanonical stat allocation accepted: '+JSON.stringify(bad));
}
assert.equal(auditOriginalStatAllocation(null).allStaticCapsSatisfied,false);
assert.equal(JSON.stringify(good),unchanged);

const equipment = {
  weapon:{slot:'weapon',uid:'rare-weapon-plus7',enh:7,classKey:'gnome',
    enhBaseStats:{atk:100},stats:{atk:190,armorPen:10}},
  armor:{slot:'armor',uid:'epic-armor-plus6',enh:6,
    enhBaseStats:{def:100},stats:{def:168,damageReduction:3}},
  ring:{slot:'ring',uid:'blue-ring',enh:0,stats:{atk:14}}
};
const before=JSON.stringify(equipment);
const audit=auditOriginalEquippedEnhancements(equipment);
assert.equal(audit.verified,2);
assert.equal(audit.unverified,0);
assert.equal(audit.perSlot.weapon.status,'VERIFIED_AGAINST_ORIGINAL_FORGE');
assert.equal(audit.perSlot.weapon.enhance,7,'+7 downgraded without player request');
assert.equal(audit.perSlot.weapon.awakeningConfirmed,true);
assert.equal(audit.perSlot.armor.status,'VERIFIED_AGAINST_ORIGINAL_FORGE');
assert.equal(audit.perSlot.armor.awakeningConfirmed,true);
assert.equal(audit.perSlot.ring.status,'UNENHANCED_NO_RECALC');
assert.equal(audit.perSlot.boots.status,'EMPTY');
assert.equal(JSON.stringify(equipment),before,
  'Auditor changed original gear inventory, enchant levels or money');

const mage={weapon:{slot:'weapon',uid:'mage-staff',enh:7,classKey:'mage',
  enhBaseStats:{atk:80},stats:{atk:152,magicPen:10}}};
assert.equal(auditOriginalEquippedEnhancements(mage).perSlot.weapon.status,
  'VERIFIED_AGAINST_ORIGINAL_FORGE','Mage special magic awakening lost');
const mismatched=structuredClone(equipment);
mismatched.weapon.stats.atk=250;
assert.equal(auditOriginalEquippedEnhancements(mismatched).perSlot.weapon.status,
  'SAVED_STATS_DIFFER_FROM_FORGE','Forged saved ATK not detected');
const missing=structuredClone(equipment);
delete missing.weapon.enhBaseStats;
assert.equal(auditOriginalEquippedEnhancements(missing).perSlot.weapon.status,
  'ENHANCEMENT_BASE_MISSING','+7 base must never be guessed from scaled stats');
assert.equal(equipment.weapon.enhBaseStats.atk,100,'Auditor changed equipment enhancement base');
const exotic={pet:{slot:'pet',uid:'stellar-guardian',enh:7,stellarGuardian:true,
  enhBaseStats:{hp:100},stats:{hp:190}}};
assert.equal(auditOriginalEquippedEnhancements(exotic).perSlot.pet.status,
  'SPECIAL_CLASS_ADAPTIVE_UNVERIFIED','Adaptive pet formula must fail closed');
const invalid={weapon:{slot:'boots',enh:7,stats:{atk:100},enhBaseStats:{atk:20}}};
assert.equal(auditOriginalEquippedEnhancements(invalid).perSlot.weapon.status,
  'INVALID_ITEM_OR_SLOT');
assert.equal(auditOriginalEquippedEnhancements(null).status,'LOADOUT_UNAVAILABLE');

const snapshot={profile:{classKey:'gnome'},version:35,updatedAt:12345,
  state:{classKey:'gnome',lvl:40,statAlloc:good,statPts:2,equipped:equipment,
    skillRanks:{basic_attack:2},gold:999,gram:15,
    bag:[{uid:'protected-plus7',enh:7}]}};
const copy=JSON.stringify(snapshot);
const profile=projectNativeCombatProfileReadOnly(snapshot);
assert.equal(profile.candidate.equipped.weapon.enhance,7);
assert.equal(profile.candidate.allocationParity.allStaticCapsSatisfied,true);
assert.equal(profile.candidate.allocationParity.dodgeRuntimeCapVerified,false);
assert.equal(profile.candidate.equippedEnhancementParity.verified,2);
assert.equal(profile.authoritativeCombatStats,null);
assert.equal(profile.canAttack,false);
assert.equal(profile.canCast,false);
assert.equal(profile.canReceiveRewards,false);
assert.equal(JSON.stringify(snapshot),copy,
  'Signed profile read unexpectedly changed original Telegram save');

const wrong=structuredClone(snapshot);
wrong.state.equipped.weapon.stats.atk=500000;
const wrongProfile=projectNativeCombatProfileReadOnly(wrong);
assert(wrongProfile.blockedReasons.includes('EQUIPPED_ENHANCEMENTS_PARTIALLY_UNVERIFIED'));
assert.equal(wrongProfile.canAttack,false);
const illegal=structuredClone(snapshot);
illegal.state.statAlloc.hp=201;
const badProfile=projectNativeCombatProfileReadOnly(illegal);
assert(badProfile.blockedReasons.includes('STAT_ALLOCATION_CAPS_NOT_VERIFIED'));
assert.equal(badProfile.canAttack,false);

// Cross-check the expected +7 awakening with the one existing forge
// implementation instead of reimplementing it as a second battle system.
const derived=applyOriginalEnhancementStats(structuredClone(equipment.weapon));
assert.deepEqual(derived.stats,equipment.weapon.stats);
console.log('PPA_NATIVE_COMBAT_STAT_PARITY_OK source_sha_locked=1 caps_hp_mp_atk_200=1 dodge_dynamic_unverified=1 plus7_weapon=1 plus6_armor=1 magic_awakening=1 forged_stats_detected=1 no_item_mutations=1 no_attack_permissions=1');
