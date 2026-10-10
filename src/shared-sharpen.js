// Pure PPA blacksmithEnhance rules, transcribed from the checksum-locked
// Telegram game (a2396965...) and compared against the original in CI.
// No HTTP owner/price/chance/target supplied by clients. Only signed item UID,
// stone mode, saved version and idempotency request ID enter the handler.
export const SHARPENABLE_SLOTS=Object.freeze([
  'weapon','helmet','armor','gloves','ring','legs','boots',
  'necklace','artifact','cloak','wings','pet'
]);
export const ENH_CHANCE_GAME=Object.freeze([0,43,35,27,19,12,7,3]);
export const ENH_CHANCE_RUNE_GAME=Object.freeze([0,55,47,40,33,27,23,19]);
export const ENH_STAT_BONUS=Object.freeze([0,.06,.14,.24,.36,.50,.68,.90]);
export const MODES=Object.freeze(['normal','normal_rune','premium','premium_rune']);
const fail=(code,message,status=409)=>({status,data:{ok:false,code,message}});

const BONUS=Object.freeze({
  'Северный волчонок':{uncommon:{physDamagePct:3},rare:{physDamagePct:6},epic:{physDamagePct:9}},
  'Мудрая сова':{uncommon:{critDmg:5},rare:{critDmg:10},epic:{critDmg:15}},
  'Лунный лис':{uncommon:{mpPct:4},rare:{mpPct:8},epic:{mpPct:12}},
  'Лесной дракончик':{uncommon:{defPct:3},rare:{defPct:5},epic:{defPct:8}},
  'Лесной дух':{uncommon:{hpPct:4},rare:{hpPct:8},epic:{hpPct:12}},
  'Механический спутник':{uncommon:{atkSpeedPct:3},rare:{atkSpeedPct:6},epic:{atkSpeedPct:9}},
  'Кристальный големчик':{uncommon:{damageReduction:3},rare:{damageReduction:5},epic:{damageReduction:8}},
  'Водный дух':{uncommon:{magicDamagePct:3},rare:{magicDamagePct:6},epic:{magicDamagePct:9}}
});
const AWAKEN_LABELS={
  armorPen:'Пробивание брони',magicPen:'Маг. пробивание',
  damageReduction:'Снижение входящего урона',critDamageResist:'Сопр. крит. урону',
  controlResist:'Сопр. контролю',atkSpeedPct:'Скорость атаки/каста',
  moveSpeedPct:'Скорость движения',crit:'Крит. шанс',critDmg:'Крит. урон',dodge:'Уворот'
};
const PET_LABELS={
  physDamagePct:'физ. урон',magicDamagePct:'маг. урон',critDmg:'крит. урон',
  mpPct:'макс. мана',hpPct:'макс. HP',defPct:'защита',atkSpeedPct:'скорость атаки/каста',
  damageReduction:'снижение входящего урона'
};
export function awakeningBonusForItem(it,lvl){
  if(!it||lvl<6)return {};
  const hi=lvl>=7,slot=it.slot||'';
  if(slot==='weapon'){
    return String(it.classKey||'')==='mage'||String(it.classKey||'')==='priest'
      ?{magicPen:hi?10:6}:{armorPen:hi?10:6};
  }
  if(slot==='armor')return {damageReduction:hi?5:3};
  if(slot==='helmet')return {critDamageResist:hi?8:5};
  if(slot==='legs')return {controlResist:hi?9:5};
  if(slot==='gloves')return {atkSpeedPct:hi?7:4};
  if(slot==='boots')return {moveSpeedPct:hi?5:3};
  if(slot==='ring')return {crit:hi?3:2};
  if(slot==='necklace')return {critDmg:hi?13:8};
  if(slot==='cloak')return {dodge:hi?5:3};
  if(slot==='wings')return {moveSpeedPct:hi?8:5};
  return {};
}
export function petEnhBonusAtLevel(it,lvl){
  if(!it||it.slot!=='pet'||lvl<5)return {};
  const d=BONUS[it.petName||it.name||''];
  const target=d&&(d[it.rarity||'common']||d.uncommon);
  if(!target)return {};
  const scale=lvl>=7?1.8:lvl>=6?1.4:1;
  return Object.fromEntries(Object.entries(target).map(([k,v])=>[k,Math.round(v*scale*100)/100]));
}
function numericStats(stats){
  const out={};
  for(const [key,value] of Object.entries(stats||{})){
    const n=Number(value);if(Number.isFinite(n))out[key]=n;
  }
  return out;
}
function score(s){
  const n=k=>Number(s[k])||0;
  let v=n('atk')*3+n('def')*2.5+n('hp')*.25+n('mp')*.15+n('crit')*4+
    n('spd')*6+n('spdFlat')*35+n('critDmg')*1.2+n('dodge')*4+
    n('controlResist')*1.5+n('slowResist')*1.2+n('hpPct')*4+n('mpPct')*3+
    n('magicResist')*1.5+n('hpRegen')*22+n('mpRegen')*22+
    n('damagePct')*14+n('physDamagePct')*12+n('magicDamagePct')*12+
    n('armorPen')*12+n('magicPen')*12+n('damageReduction')*18+
    n('critDamageResist')*6+n('atkSpeedPct')*10+n('moveSpeedPct')*8+n('defPct')*10;
  if(v<=0){let fallback=0;for(const value of Object.values(s)){
    const x=Number(value);if(Number.isFinite(x)&&x!==0)fallback+=Math.abs(x)*2;
  }v=fallback;}
  return Math.max(0,Math.round(v));
}
function syncBM(item){
  if(!item||!item.stats)return 0;
  let has=false;
  for(const value of Object.values(item.stats)){
    const n=Number(value);if(Number.isFinite(n)&&n!==0){has=true;break;}
  }
  item.bm=has?Math.max(1,score(item.stats)):0;
  return item.bm;
}
export function applyOriginalEnhancementStats(item){
  if(!item||!item.stats)return item;
  // Special premium Stellar Guardian recalculates its full class-dependent base,
  // visuals and adaptive status. Never silently erase its traits or substitute
  // a generic pet formula until that class/adaptive path is migrated.
  if(item.stellarGuardian||item.petName==='Звёздный Хранитель')
    throw Error('STELLAR_GUARDIAN_NOT_SUPPORTED');
  if(!item.enhBaseStats||typeof item.enhBaseStats!=='object'||
    Array.isArray(item.enhBaseStats)||!Object.keys(item.enhBaseStats).length)
    item.enhBaseStats=numericStats(item.stats);
  const base=item.enhBaseStats;
  const level=Math.max(0,Math.min(7,Math.floor(Number(item.enh)||0)));
  const mult=1+(ENH_STAT_BONUS[level]||0),stats={};
  for(const [key,value] of Object.entries(base)){
    const n=Number(value);if(!Number.isFinite(n))continue;
    const scaled=n*mult;
    stats[key]=level>0
      ?(['atk','def','hp','mp','spdFlat'].includes(key)?Math.round(scaled):Math.round(scaled*100)/100)
      :n;
  }
  item.stats=stats;
  const awakening=awakeningBonusForItem(item,level),parts=[];
  item.awakeningBonuses=awakening;
  for(const [key,value] of Object.entries(awakening)){
    if(!value)continue;
    item.stats[key]=(Number(item.stats[key])||0)+value;
    parts.push((AWAKEN_LABELS[key]||key)+' +'+value+'%');
  }
  item.awakeningText=parts.length
    ?(level>=7?'Высшее пробуждение':'Пробуждение')+' · '+parts.join(' · '):'';
  if(item.slot==='pet'&&level>=5){
    const extra=petEnhBonusAtLevel(item,level),labels=[];
    for(const [key,value] of Object.entries(extra)){
      if(!value)continue;
      item.stats[key]=(Number(item.stats[key])||0)+value;
      labels.push((PET_LABELS[key]||key)+' +'+value+'%');
    }
    if(labels.length){
      item.petEnhancementBonuses=extra;
      item.bonusText='Питомец +'+level+' · дополнительный стат: '+labels.join(' · ');
    }
  }
  syncBM(item);
  return item;
}
export function sharpenOriginalPPAItem(state,uid,stone,roll){
  if(!state||typeof state!=='object'||Array.isArray(state)||
    !Array.isArray(state.bag)||!state.stones||typeof state.stones!=='object'||
    Array.isArray(state.stones))
    return fail('SHARPEN_STATE_UNAVAILABLE','Сохранение и камни заточки недоступны.');
  if(typeof uid!=='string'||uid.length<1||uid.length>160)
    return fail('SHARPEN_BAD_ITEM','Неверный идентификатор вещи.',400);
  if(!MODES.includes(stone))return fail('SHARPEN_BAD_STONE','Неизвестный камень заточки.',400);
  // Real original blacksmith operates on BAG only. Equipped gear must first
  // be transferred by a separately validated canonical inventory operation.
  const matches=state.bag.map((item,i)=>item&&item.uid===uid?i:-1).filter(i=>i>=0);
  if(matches.length!==1)return fail('SHARPEN_ITEM_MISSING','Не удалось найти единственную вещь в сумке.');
  const index=matches[0],old=state.bag[index];
  if(!SHARPENABLE_SLOTS.includes(old.slot)||!old.stats||
    typeof old.stats!=='object'||Array.isArray(old.stats))
    return fail('SHARPEN_NOT_SUPPORTED','Эту вещь пока нельзя затачивать.');
  if(old.stellarGuardian||old.petName==='Звёздный Хранитель')
    return fail('SHARPEN_SPECIAL_NOT_READY','Особый питомец требует отдельной проверки класса.');
  const level=old.enh===undefined?0:old.enh;
  if(!Number.isInteger(level)||level<0||level>7)
    return fail('SHARPEN_INVALID_LEVEL','Неверный уровень заточки вещи.');
  if(level===7)return fail('SHARPEN_MAX_LEVEL','Максимальная заточка +7.');
  const target=level+1,normal=stone.startsWith('normal'),premium=stone.startsWith('premium');
  const rune=stone.endsWith('_rune');
  if(normal&&target>=6)
    return fail('SHARPEN_NEEDS_PREMIUM','После +5 нужен премиум камень.');
  for(const key of [normal?'normal':'premium',...(rune?['rune']:[])])
    if(!Number.isSafeInteger(state.stones[key])||state.stones[key]<1)
      return fail('SHARPEN_NO_STONES','Недостаточно камней или рун заточки.');
  if(typeof roll!=='number'||!Number.isFinite(roll)||roll<0||roll>=100)
    return fail('SHARPEN_RANDOM_INVALID','Ошибка серверной случайности.',500);
  const next=structuredClone(state),it=next.bag[index];
  if(it.enh===undefined)it.enh=0;
  // Original ensures enhancement base stats BEFORE calculating the roll.
  if(!it.enhBaseStats||typeof it.enhBaseStats!=='object'||
    Array.isArray(it.enhBaseStats)||!Object.keys(it.enhBaseStats).length)
    it.enhBaseStats=numericStats(it.stats);
  next.stones[normal?'normal':'premium']--;
  if(rune)next.stones.rune--;
  const chance=(rune?ENH_CHANCE_RUNE_GAME:ENH_CHANCE_GAME)[target];
  let outcome='';
  if(roll<chance){
    const oldBM=syncBM(it);
    it.enh=target;
    applyOriginalEnhancementStats(it);
    outcome='success';
    void oldBM;
  }else if(premium){
    outcome='protected';
  }else if(it.rarity==='epic'){
    it.enh=Math.max(0,level-1);
    applyOriginalEnhancementStats(it);
    outcome='downgrade';
  }else {
    next.bag.splice(index,1);
    outcome='destroyed';
  }
  return {status:200,state:next,receipt:{
    uid,name:old.name||'Предмет',slot:old.slot,mode:stone,chance,
    outcome,levelBefore:level,levelAfter:outcome==='destroyed'?null:
      (outcome==='protected'?level:next.bag[index].enh),
    used:{[normal?'normal':'premium']:1,...(rune?{rune:1}:{})}
  }};
}
