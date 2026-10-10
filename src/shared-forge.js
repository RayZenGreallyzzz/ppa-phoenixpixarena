import { executeNativeCommandOnce } from './native-action-ledger.js';
import CANONICAL from './shared-forge-recipes.generated.json' with { type: 'json' };

// All public original Telegram smith recipes, source SHA-locked by the
// generator. No client price, rarity, stats, class, or materials is trusted.
export const ALL_FORGE_RECIPES = Object.freeze(CANONICAL.offers.map(o=>Object.freeze(o)));
export const EPIC_GEAR = Object.freeze(ALL_FORGE_RECIPES.filter(o=>o.id.startsWith('gear:epic:')));
const RECIPE_INDEX = new Map(ALL_FORGE_RECIPES.map(o=>[o.id,o]));
const CLASS_NAMES=Object.freeze({
  tank:{weapon:'Булава стража',armor:'Кираса стража',helmet:'Шлем стража',legs:'Поножи стража',boots:'Сапоги стража',gloves:'Перчатки стража',ring:'Кольцо стража'},
  paladin:{weapon:'Меч паладина',armor:'Доспех паладина',helmet:'Шлем паладина',legs:'Поножи паладина',boots:'Сапоги паладина',gloves:'Перчатки паладина',ring:'Кольцо паладина'},
  barbarian:{weapon:'Скрещённые топоры берсерка',armor:'Доспех берсерка',helmet:'Шлем берсерка',legs:'Поножи берсерка',boots:'Сапоги берсерка',gloves:'Перчатки берсерка',ring:'Кольцо берсерка'},
  mage:{weapon:'Посох мага',armor:'Мантия мага',helmet:'Головной убор мага',legs:'Поножи мага',boots:'Сапоги мага',gloves:'Перчатки мага',ring:'Кольцо мага'},
  priest:{weapon:'Посох жреца',armor:'Одеяние жреца',helmet:'Шлем жреца',legs:'Поножи жреца',boots:'Сапоги жреца',gloves:'Перчатки жреца',ring:'Кольцо жреца'},
  archer:{weapon:'Лук лучника',armor:'Куртка лучника',helmet:'Капюшон лучника',legs:'Поножи лучника',boots:'Сапоги лучника',gloves:'Перчатки лучника',ring:'Кольцо лучника'},
  assassin:{weapon:'Скрещённые кинжалы ассасина',armor:'Доспех ассасина',helmet:'Капюшон ассасина',legs:'Поножи ассасина',boots:'Сапоги ассасина',gloves:'Перчатки ассасина',ring:'Кольцо ассасина'},
  gnome:{weapon:'Ручная пушка канонира',armor:'Броня канонира',helmet:'Шлем канонира',legs:'Поножи канонира',boots:'Сапоги канонира',gloves:'Перчатки канонира',ring:'Кольцо канонира'}
});
const CLASS_LABELS={tank:'Танк',paladin:'Паладин',barbarian:'Варвар',mage:'Маг',
  priest:'Жрец',archer:'Лучник',assassin:'Ассасин',gnome:'Канонир'};
const BASE_STATS={weapon:{atk:52,crit:7},armor:{def:38,hp:120},helmet:{def:24,hp:60},
  gloves:{def:16,crit:4},ring:{atk:13,crit:6},legs:{def:22,spd:3},boots:{def:14,spd:5}};
const DEFENSIVE=new Set(['armor','helmet','gloves','legs','boots']);
const owned=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const error=(status,code,message)=>({status,data:{ok:false,code,message}});

function itemBM(s){
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
function originalPetStats(name,rarity){
  const choice=(common,uncommon,rare)=>rarity==='rare'?rare:rarity==='uncommon'?uncommon:common;
  if(name==='Лесной дракончик')return {hp:choice(14,22,35)};
  if(name==='Северный волчонок')return {spd:choice(2,3,4)};
  if(name==='Мудрая сова')return {crit:choice(1,2,3)};
  if(name==='Механический спутник')return {def:choice(3,5,8)};
  if(name==='Кристальный големчик')return {def:choice(2,4,7)};
  if(name==='Лунный лис')return {mp:choice(10,18,28)};
  if(name==='Водный дух')return {hp:choice(10,16,24)};
  return {hp:choice(8,12,20)};
}
function originalStats(offer){
  const {kind,slot,rarity,name}=offer;
  if(kind==='gear'){
    const base=BASE_STATS[slot]||{def:10};
    return Object.fromEntries(Object.entries(base).map(([key,value])=>
      [key,rarity==='legendary'?value*3:value]));
  }
  if(kind==='pet')return originalPetStats(name,rarity);
  if(kind==='wings')return {...(CANONICAL.accessoryStats.wings?.[rarity]||{})};
  if(kind==='accessory'){
    if(slot==='necklace')return {...(CANONICAL.necklaceStats[rarity]||{})};
    return {...(CANONICAL.accessoryStats[slot]?.[rarity]||{})};
  }
  return {};
}
function originalItem(offer,state,uid){
  const ck=String(state.classKey||state.cls||'').toLowerCase();
  const label=CLASS_LABELS[ck]||ck;
  const rarity=offer.rarity;
  if(offer.kind==='gear'){
    // Real Telegram blacksmithCraft class-based name, with special universal
    // legendary ring originally crafted through craftAccessory().
    const universalRing=offer.id==='acc:ring:legendary';
    const slot=offer.slot;
    const stats=originalStats(offer);
    const item={uid,name:universalRing?'Легендарное кольцо':CLASS_NAMES[ck][slot],
      slot,rarity,enh:0,classKey:universalRing?'all':ck,
      className:universalRing?'Все классы':String(state.className||label),
      icon:offer.icon||'◆',img:'',stats,sell:0,crafted:true,
      legendaryDraft:rarity==='legendary',visualClassKey:''};
    if(DEFENSIVE.has(slot)){
      const ward={common:0,uncommon:2,rare:4,epic:6,legendary:18}[rarity]||0;
      if(ward>0){item.stats.magicResist=Math.max(item.stats.magicResist||0,ward);
        item.bm=itemBM(item.stats);}
    }
    return item;
  }
  if(offer.kind==='wings'){
    return {uid,name:'Крылья',slot:'wings',rarity,enh:0,
      classKey:'all',className:'Все классы',icon:'🪽',img:'',dirSprites:null,
      stats:originalStats(offer),bonusText:offer.bonusText||'',sell:0,crafted:true};
  }
  if(offer.kind==='pet'){
    return {uid,name:offer.name,petName:offer.name,slot:'pet',rarity,enh:0,
      classKey:'all',className:'Все классы',icon:'🐾',img:'',dirSprites:null,
      stats:originalStats(offer),bonusText:offer.bonusText||'',sell:0,crafted:true};
  }
  if(offer.kind==='accessory'){
    return {uid,name:offer.name,slot:offer.slot,rarity,enh:0,
      classKey:'all',className:'Все классы',icon:offer.icon||'◆',img:'',
      stats:originalStats(offer),bonusText:offer.bonusText||'',
      sell:0,crafted:true};
  }
  return null;
}

export function craftOriginalForgeItem(state,id,uid){
  const offer=RECIPE_INDEX.get(id);
  if(!offer)return error(400,'FORGE_RECIPE_UNSUPPORTED','Рецепт не найден в оригинальной PPA.');
  if(!state||typeof state!=='object'||Array.isArray(state))
    return error(409,'PPA_CHARACTER_SAVE_NOT_READY','Сохранение не загружено.');
  const ck=String(state.classKey||state.cls||'').toLowerCase();
  if(offer.kind==='gear'&&!Object.hasOwn(CLASS_NAMES,ck))
    return error(409,'CLASS_NOT_VERIFIED','Класс персонажа не подтверждён.');
  if(!Array.isArray(state.bag)||state.bag.length>=100)
    return error(409,'BAG_FULL_OR_INVALID','Сумка занята или не загружена (100 ячеек).');
  if(!state.materials||typeof state.materials!=='object'||Array.isArray(state.materials)||
     !state.feathers||typeof state.feathers!=='object'||Array.isArray(state.feathers))
    return error(409,'RESOURCES_NOT_READY','Остатки ресурсов не подтверждены.');
  if(!Number.isSafeInteger(state.ppa)||state.ppa<offer.price)
    return error(409,'PPA_NOT_ENOUGH','Недостаточно PPA.');
  for(const row of offer.materials){
    const remaining=row.name==='Перо Феникса'
      ?owned(state.feathers.phoenix):owned(state.materials[row.name]);
    if(remaining===null||remaining<row.count)
      return error(409,'MATERIALS_NOT_ENOUGH','Не хватает ресурса: '+row.name);
  }
  if(typeof uid!=='string'||!/^craft_[a-zA-Z0-9_-]{18,80}$/.test(uid))
    return error(500,'FORGE_UID_INVALID','Не удалось создать идентификатор вещи.');
  const item=originalItem(offer,state,uid);
  if(!item||!item.name||!item.slot||!item.rarity)
    return error(500,'FORGE_ITEM_INVALID','Не удалось создать вещь из оригинального рецепта.');
  const next=structuredClone(state);
  next.ppa-=offer.price;
  for(const row of offer.materials){
    if(row.name==='Перо Феникса')next.feathers.phoenix-=row.count;
    else next.materials[row.name]-=row.count;
  }
  next.bag.push(item);
  return {status:200,state:next,receipt:{id,uid,name:item.name,price:offer.price,
    rarity:item.rarity,slot:item.slot,kind:offer.kind}};
}
// Compatibility for existing original epic-gear tests.
export function craftOriginalEpicGear(state,id,uid){
  if(!EPIC_GEAR.some(x=>x.id===id))
    return error(400,'FORGE_RECIPE_UNSUPPORTED','Неподдерживаемый эпический рецепт.');
  return craftOriginalForgeItem(state,id,uid);
}

function stateView(ownerId,saved){
  const state=saved.state;
  const materials=state.materials&&typeof state.materials==='object'&&!Array.isArray(state.materials)
    ?Object.fromEntries(Object.entries(state.materials).slice(0,512)
      .filter(([name])=>name.length>0&&name.length<=120)
      .map(([name,value])=>[name,owned(value)])):null;
  const feathers=state.feathers&&typeof state.feathers==='object'&&!Array.isArray(state.feathers)
    ?{phoenix:owned(state.feathers.phoenix)}:null;
  return {connected:true,self:{id:String(ownerId)},version:saved.version,
    catalogSourceSha:CANONICAL.smithSha256,
    wallet:{ppa:owned(state.ppa)},materials,feathers,
    offers:ALL_FORGE_RECIPES.map(offer=>({
      id:offer.id,name:offer.name,price:offer.price,currency:'ppa',kind:offer.kind,
      rarity:offer.rarity,slot:offer.slot,materials:offer.materials.map(x=>({...x}))
    }))};
}

export async function sharedForgeOperation(env,ownerId,operation,body,persistence){
  const envelope=data=>({...data,gameId:'phoenix-pix-arena',
    contract:'ppa-forge-v1',ownerId:String(ownerId),
    actions:env.PPA_FORGE_ACTIONS_ENABLED==='1'?['craft']:[]});
  const load=async()=>{
    const saved=await persistence.load(ownerId);
    return saved.ok&&!saved.bootstrapFromProfile&&saved.state&&
      Number.isInteger(saved.version)&&saved.version>=1?saved:null;
  };
  if(operation==='state'){
    const saved=await load();
    return saved?{status:200,data:envelope({ok:true,state:stateView(ownerId,saved)})}
      :error(409,'PPA_CHARACTER_SAVE_NOT_READY','Сначала синхронизируй персонажа PPA.');
  }
  if(env.PPA_FORGE_ACTIONS_ENABLED!=='1')
    return error(404,'NOT_FOUND','Forge API route not found');
  if(body?.action!=='craft'||!RECIPE_INDEX.has(body.id)||
    !Number.isSafeInteger(body.version)||body.version<1)
    return error(400,'FORGE_RECIPE_INVALID','Неверный рецепт или версия сохранения.');
  const command={service:'forge',action:'craft',id:body.id,version:body.version};
  return executeNativeCommandOnce(env,String(ownerId),body.requestId,command,async()=>{
    const finish=r=>({status:r.status,data:envelope({...r.data,requestId:body.requestId,commandStatus:'done'})});
    const saved=await load();
    if(!saved)return finish(error(409,'PPA_CHARACTER_SAVE_NOT_READY','Сохранение не готово.'));
    if(saved.version!==command.version)
      return finish(error(409,'SAVE_VERSION_CONFLICT','Обнови кузницу: сохранение изменилось.'));
    const uid='craft_'+crypto.randomUUID().replace(/-/g,'');
    const crafted=craftOriginalForgeItem(saved.state,command.id,uid);
    if(crafted.status!==200)return finish(crafted);
    const write=await persistence.save(ownerId,crafted.state,saved.version);
    if(!write.ok)return finish({status:Number(write.status)||409,data:write});
    return finish({status:200,data:{ok:true,receipt:crafted.receipt,
      message:'Создано: '+crafted.receipt.name,
      state:stateView(ownerId,{state:crafted.state,version:write.version})}});
  });
}
