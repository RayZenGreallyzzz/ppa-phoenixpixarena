// CHECKSUM-LOCKED REFERENCE for the ORIGINAL Telegram PPA class/rune formula.
//
// Source: PPA01.bin...PPA12.bin, SHA256
// a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7
// and build.mjs's approved range patches. CI evaluates the original
// definitions and recomputeStats() independently against these constants.
//
// This is READ-ONLY parity evidence, NOT authority to attack, level up,
// apply skill effects, change inventory, advance loot or pay PPA/Gram/Gold.
export const ORIGINAL_CLASS_BASE=Object.freeze({
  tank: {hp:260,mp:20,atk:12,def_:34,spd:2.00,atkSpd:.95,range:72,crit:3,dodge:3,critDmg:180,attackMode:'melee'},
  barbarian:{hp:150,mp:30,atk:20,def_:12,spd:3.50,atkSpd:1.20,range:78,crit:10,dodge:3,critDmg:180,attackMode:'melee'},
  paladin:{hp:170,mp:100,atk:14,def_:18,spd:3.20,atkSpd:1.05,range:74,crit:10,dodge:3,critDmg:180,attackMode:'melee'},
  gnome:{hp:130,mp:50,atk:30,def_:10,spd:2.00,atkSpd:1.00,range:360,crit:5,dodge:3,critDmg:180,attackMode:'cannon'},
  archer:{hp:90,mp:80,atk:16,def_:6,spd:4.00,atkSpd:1.45,range:420,crit:15,dodge:3,critDmg:180,attackMode:'ranged'},
  mage:{hp:70,mp:150,atk:25,def_:4,spd:2.50,atkSpd:.95,range:390,crit:5,dodge:3,critDmg:180,attackMode:'magic'},
  assassin:{hp:100,mp:60,atk:15,def_:5,spd:4.50,atkSpd:1.55,range:64,crit:20,dodge:3,critDmg:180,attackMode:'melee'},
  priest:{hp:110,mp:140,atk:10,def_:8,spd:2.80,atkSpd:1.00,range:330,crit:5,dodge:3,critDmg:180,attackMode:'ranged'}
});
export const ORIGINAL_STAT_POINT_GAIN=Object.freeze({
  hp:20,mp:10,atk:1,def:1,spd:.10,atkspd:.03,critdmg:2,crit:.50,dodge:.50
});
export const ORIGINAL_RUNE_TYPES=Object.freeze({
  strength:{stat:'damagePct',values:{common:2,uncommon:4,rare:6,epic:9,legendary:13}},
  defense:{stat:'defPct',values:{common:3,uncommon:5,rare:8,epic:12,legendary:17}},
  agility:{stat:'dodge',values:{common:1,uncommon:2,rare:3,epic:4.5,legendary:6}},
  mana:{stat:'mpPct',values:{common:6,uncommon:10,rare:15,epic:22,legendary:30}},
  health:{stat:'hpPct',values:{common:5,uncommon:8,rare:12,epic:18,legendary:25}},
  crit:{stat:'crit',values:{common:1,uncommon:2,rare:3,epic:4.5,legendary:6}},
  speed:{stat:'atkSpeedPct',values:{common:2,uncommon:3,rare:4.5,epic:6,legendary:8}},
  vampirism:{stat:'vampirism',values:{common:1,uncommon:2,rare:3,epic:4.5,legendary:6}}
});
const BONUS_KEYS=Object.freeze(['damagePct','defPct','dodge','mpPct','hpPct','crit','atkSpeedPct','vampirism']);
const STAT_KEYS=Object.freeze(Object.keys(ORIGINAL_STAT_POINT_GAIN));
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e8;
const rawNum=(value)=>finite(value)?value:0;
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));

export function originalRuneDefinition(key) {
  if(typeof key!=='string')return null;
  const parts=key.split('|');
  if(parts.length!==2||!Object.hasOwn(ORIGINAL_RUNE_TYPES,parts[0]))return null;
  const spec=ORIGINAL_RUNE_TYPES[parts[0]];
  if(!Object.hasOwn(spec.values,parts[1]))return null;
  return {type:parts[0],rarity:parts[1],stat:spec.stat,
    value:spec.values[parts[1]]};
}

// Original syncRuneProgress(): unlocked = min(10,max(savedLevelSlots,
// floor(level/10)) + max(savedRebirthSlots, rebirths)). Persisted slots
// matter after rebirth; recomputing only from current level loses runes.
export function originalRuneUnlockedSlots(level,rebirths,runeProgress) {
  if(!integer(level,1,999)||!integer(rebirths,0,1000)||!obj(runeProgress)||
     !integer(runeProgress.levelSlots,0,10)||
     !integer(runeProgress.rebirthSlots,0,10))return null;
  const byLevel=Math.floor(level/10);
  const levelSlots=clamp(Math.max(byLevel,runeProgress.levelSlots),0,10);
  const rebirthSlots=clamp(Math.max(rebirths,runeProgress.rebirthSlots),0,10);
  return Math.min(10,levelSlots+rebirthSlots);
}

export function auditOriginalClassRuneReference(state,registeredClass) {
  const fail=(code)=>({source:'telegram-ppa-original-class-rune',status:code,
    readOnly:true,canAttack:false,effectiveCombatStats:null,reference:null});
  if(!obj(state)||typeof registeredClass!=='string'||
     !Object.hasOwn(ORIGINAL_CLASS_BASE,registeredClass))
    return fail('REGISTERED_CLASS_UNVERIFIED');
  const c=ORIGINAL_CLASS_BASE[registeredClass],level=state.lvl??state.level;
  if(!integer(level,1,999))return fail('LEVEL_UNVERIFIED');
  const a=state.statAlloc;
  if(!obj(a)||STAT_KEYS.some(k=>!integer(a[k]??0,0,['hp','mp','atk'].includes(k)?200:100)))
    return fail('STAT_POINTS_UNVERIFIED');
  const equipped=state.equipped;
  if(!obj(equipped))return fail('EQUIPMENT_UNVERIFIED');
  const g={};for(const slot of Object.keys(equipped)){
    const item=equipped[slot];
    if(item==null)continue;
    if(!obj(item)||!obj(item.stats)||Object.values(item.stats).some(v=>!finite(v)))
      return fail('EQUIPMENT_STATS_UNVERIFIED');
    for(const [key,value] of Object.entries(item.stats))
      g[key]=(g[key]||0)+value;
  }
  if(!Array.isArray(state.runeSlots)||state.runeSlots.length>10)
    return fail('RUNE_SLOTS_UNVERIFIED');
  const progress=state.runeProgress;
  const unlocked=originalRuneUnlockedSlots(level,state.rebirths??0,progress);
  if(unlocked===null)return fail('RUNE_PROGRESS_UNVERIFIED');
  const r=Object.fromEntries(BONUS_KEYS.map(key=>[key,0]));
  const occupied=[];
  for(let i=0;i<state.runeSlots.length;i++){
    const key=state.runeSlots[i];
    if(key==null||key==='')continue;
    const d=originalRuneDefinition(key);
    if(!d)return fail('UNKNOWN_RUNE_IN_SAVED_SLOTS');
    if(i>=unlocked)return fail('LOCKED_RUNE_SLOT_OCCUPIED');
    r[d.stat]+=d.value;
    occupied.push({slot:i,key,type:d.type,rarity:d.rarity,value:d.value,stat:d.stat});
  }
  // Original recomputeStats() fallback: baseMhp/baseMmp are NOT always
  // regenerated each call, and clanHpMul/clanMpMul are runtime-only.
  // Reference gives only a reproducible baseline, not real live HP/MP.
  const baseHp=c.hp+(level-1)*20;
  const baseMp=c.mp+(level-1)*10;
  const hpBeforeClan=Math.round((baseHp+rawNum(g.hp)+(a.hp||0)*20)*
    (1+(rawNum(g.hpPct)+r.hpPct)/100));
  const mpBeforeClan=Math.round((baseMp+rawNum(g.mp)+(a.mp||0)*10)*
    (1+(rawNum(g.mpPct)+r.mpPct)/100));
  const baseAttack=c.atk+rawNum(g.atk)+Math.floor((level-1)*1.5)+(a.atk||0);
  const def=(c.def_+rawNum(g.def)+(a.def||0))*
    (1+(rawNum(g.defPct)+r.defPct)/100);
  const crit=c.crit+rawNum(g.crit)+(a.crit||0)*.5+r.crit;
  const spd=(c.spd+rawNum(g.spd)*.12+rawNum(g.spdFlat)+(a.spd||0)*.10)*
    (1+rawNum(g.moveSpeedPct)/100);
  const dodge=Math.min(60,c.dodge+rawNum(g.spd)*.4+rawNum(g.dodge)+
    (a.dodge||0)*.5+r.dodge);
  const atkSpd=Math.max(.35,(c.atkSpd+(a.atkspd||0)*.03)*
    (1+(rawNum(g.atkSpeedPct)+r.atkSpeedPct)/100));
  const critDmg=c.critDmg+rawNum(g.critDmg)+(a.critdmg||0)*2;
  const preview={hpBeforeClan,mpBeforeClan,atk:baseAttack,def,
    crit,spd,dodge,atkSpd,critDmg,attackRange:Math.max(60,c.range),
    damagePct:Math.max(0,rawNum(g.damagePct)+r.damagePct),
    vampirism:Math.max(0,r.vampirism),
    physDamagePct:Math.max(0,rawNum(g.physDamagePct)),
    magicDamagePct:Math.max(0,rawNum(g.magicDamagePct)),
    armorPen:clamp(rawNum(g.armorPen),0,60),
    magicPen:clamp(rawNum(g.magicPen),0,60),
    damageReduction:clamp(rawNum(g.damageReduction),0,50)};
  if(Object.values(preview).some(v=>!finite(v)))return fail('REFERENCE_OVERFLOW');
  return {
    source:'telegram-ppa-original-class-rune',status:'REFERENCE_PARITY_ONLY',
    readOnly:true,canAttack:false,effectiveCombatStats:null,
    reference:{
      registeredClass,level,unlockedRuneSlots:unlocked,occupied,
      runeBonuses:r,classBase:{...c},baselineWithoutClanBuffs:preview,
      // Not an executable combat profile: active clan multipliers,
      // retained baseMhp/baseMmp, skills/buffs/target physics and actual
      // server-owned save/position/cooldown are still unverified.
      liveClanBonusesVerified:false,
      passiveSkillsVerified:false,
      serverDamageAuthorityVerified:false
    }
  };
}
