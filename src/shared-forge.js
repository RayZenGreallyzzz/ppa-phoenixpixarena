import { executeNativeCommandOnce } from './native-action-ledger.js';

// First six exact Telegram blacksmithFrame GEAR recipes. The checksum-locked
// legacy GEAR, craftGear, blacksmithCraft, craftStats and itemBM are verified by
// tools/test-shared-forge.mjs. Nothing here is a new economy or bag format.
export const EPIC_GEAR = Object.freeze([
  ['weapon','Эпическое оружие','⚔️',6000,['Рунический слиток','Метеоритная руда','Кровавый кристалл']],
  ['armor','Эпическая броня','🛡️',5000,['Серебряная руда','Ткань пустоты','Светлый кристалл']],
  ['helmet','Эпический шлем','⛑️',4000,['Серебряная руда','Рунический слиток','Жемчужина маны']],
  ['legs','Эпические поножи','🥋',4000,['Ткань пустоты','Тёмная руда','Драконья чешуя']],
  ['boots','Эпические сапоги','🥾',4000,['Драконья чешуя','Серебряная руда','Изумруд']],
  ['gloves','Эпические перчатки','🧤',4000,['Рунический слиток','Драконья чешуя','Тёмная руда']]
].map(([slot,name,icon,price,mats])=>Object.freeze({
  id:'gear:epic:'+slot,kind:'gear',rarity:'epic',slot,name,icon,price,currency:'ppa',
  materials:Object.freeze([...mats.map((name,i)=>Object.freeze({name,count:[432,288,144][i]})),
    Object.freeze({name:'Перо Феникса',count:2})])
})));

const NAMES = Object.freeze({
  tank:['Булава стража','Кираса стража','Шлем стража','Поножи стража','Сапоги стража','Перчатки стража'],
  paladin:['Меч паладина','Доспех паладина','Шлем паладина','Поножи паладина','Сапоги паладина','Перчатки паладина'],
  barbarian:['Скрещённые топоры берсерка','Доспех берсерка','Шлем берсерка','Поножи берсерка','Сапоги берсерка','Перчатки берсерка'],
  mage:['Посох мага','Мантия мага','Головной убор мага','Поножи мага','Сапоги мага','Перчатки мага'],
  priest:['Посох жреца','Одеяние жреца','Шлем жреца','Поножи жреца','Сапоги жреца','Перчатки жреца'],
  archer:['Лук лучника','Куртка лучника','Капюшон лучника','Поножи лучника','Сапоги лучника','Перчатки лучника'],
  assassin:['Скрещённые кинжалы ассасина','Доспех ассасина','Капюшон ассасина','Поножи ассасина','Сапоги ассасина','Перчатки ассасина'],
  gnome:['Ручная пушка канонира','Броня канонира','Шлем канонира','Поножи канонира','Сапоги канонира','Перчатки канонира']
});
const CLASS_LABELS={tank:'Танк',paladin:'Паладин',barbarian:'Варвар',mage:'Маг',
  priest:'Жрец',archer:'Лучник',assassin:'Ассасин',gnome:'Канонир'};
const BASE_STATS={weapon:{atk:52,crit:7},armor:{def:38,hp:120},helmet:{def:24,hp:60},
  legs:{def:22,spd:3},boots:{def:14,spd:5},gloves:{def:16,crit:4}};
const DEFENSIVE=new Set(['armor','helmet','legs','boots','gloves']);
const error=(status,code,message)=>({status,data:{ok:false,code,message}});
const owned=v=>Number.isSafeInteger(v)&&v>=0?v:null;

// Exact original itemBM formula. Never substitute a client-computed score.
function itemBM(s) {
  const n=k=>Number(s[k])||0;
  let v=n('atk')*3+n('def')*2.5+n('hp')*.25+n('mp')*.15+
    n('crit')*4+n('spd')*6+n('spdFlat')*35+n('critDmg')*1.2+
    n('dodge')*4+n('controlResist')*1.5+n('slowResist')*1.2+
    n('hpPct')*4+n('mpPct')*3+n('magicResist')*1.5+
    n('hpRegen')*22+n('mpRegen')*22+n('damagePct')*14+
    n('physDamagePct')*12+n('magicDamagePct')*12+
    n('armorPen')*12+n('magicPen')*12+n('damageReduction')*18+
    n('critDamageResist')*6+n('atkSpeedPct')*10+n('moveSpeedPct')*8+n('defPct')*10;
  if(v<=0) {let fallback=0;for(const value of Object.values(s)){
    const x=Number(value);if(Number.isFinite(x)&&x!==0)fallback+=Math.abs(x)*2;
  }v=fallback;}
  return Math.max(0,Math.round(v));
}

export function craftOriginalEpicGear(state, id, uid) {
  const offer=EPIC_GEAR.find(r=>r.id===id);
  if(!offer)return error(400,'FORGE_RECIPE_UNSUPPORTED','Этот рецепт ещё не подключён к общему серверу.');
  if(!state||typeof state!=='object'||Array.isArray(state))return error(409,'PPA_CHARACTER_SAVE_NOT_READY','Сохранение недоступно.');
  const ck=String(state.classKey||state.cls||'').toLowerCase();
  if(!Object.hasOwn(NAMES,ck))return error(409,'CLASS_NOT_VERIFIED','Класс персонажа не подтверждён.');
  if(!Array.isArray(state.bag)||state.bag.length>=100)
    return error(409,'BAG_FULL_OR_INVALID','Сумка занята или не загружена (100 ячеек).');
  if(!state.materials||typeof state.materials!=='object'||Array.isArray(state.materials)||
     !state.feathers||typeof state.feathers!=='object'||Array.isArray(state.feathers))
    return error(409,'RESOURCES_NOT_READY','Остатки ресурсов не подтверждены.');
  if(!Number.isSafeInteger(state.ppa)||state.ppa<offer.price)
    return error(409,'PPA_NOT_ENOUGH','Недостаточно PPA.');
  for(const row of offer.materials) {
    const current=row.name==='Перо Феникса'?owned(state.feathers.phoenix):owned(state.materials[row.name]);
    if(current===null||current<row.count)
      return error(409,'MATERIALS_NOT_ENOUGH','Не хватает ресурса: '+row.name);
  }
  if(typeof uid!=='string'||!/^craft_[a-zA-Z0-9_-]{18,80}$/.test(uid))
    return error(500,'FORGE_UID_INVALID','Не удалось создать уникальный идентификатор предмета.');
  const next=structuredClone(state);
  next.ppa-=offer.price;
  for(const row of offer.materials) {
    if(row.name==='Перо Феникса')next.feathers.phoenix-=row.count;
    else next.materials[row.name]-=row.count;
  }
  const index=EPIC_GEAR.indexOf(offer);
  const stats={...BASE_STATS[offer.slot]};
  if(DEFENSIVE.has(offer.slot))stats.magicResist=6; // original applyGearMagicWard epic
  const item={uid,name:NAMES[ck][index],slot:offer.slot,rarity:'epic',enh:0,
    classKey:ck,className:String(state.className||CLASS_LABELS[ck]),icon:offer.icon,
    img:'',stats,sell:0,crafted:true,legendaryDraft:false,visualClassKey:''};
  if(DEFENSIVE.has(offer.slot))item.bm=itemBM(stats);
  next.bag.push(item);
  return {status:200,state:next,receipt:{id,name:item.name,uid,price:offer.price,rarity:'epic',slot:offer.slot}};
}

function stateView(ownerId,saved) {
  const state=saved.state;
  return {connected:true,self:{id:String(ownerId)},version:saved.version,
    wallet:{ppa:owned(state.ppa)},offers:EPIC_GEAR.map(offer=>({
      id:offer.id,name:offer.name,price:offer.price,currency:'ppa',
      rarity:'epic',slot:offer.slot,materials:offer.materials.map(x=>({...x}))
    }))};
}

export async function sharedForgeOperation(env,ownerId,operation,body,persistence) {
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
  if(body?.action!=='craft'||!EPIC_GEAR.some(x=>x.id===body.id)||
     !Number.isSafeInteger(body.version)||body.version<1)
    return error(400,'FORGE_RECIPE_INVALID','Неверный рецепт кузницы или версия.');
  const command={service:'forge',action:'craft',id:body.id,version:body.version};
  return executeNativeCommandOnce(env,String(ownerId),body.requestId,command,async()=>{
    const finish=r=>({status:r.status,data:envelope({...r.data,requestId:body.requestId,commandStatus:'done'})});
    const saved=await load();
    if(!saved)return finish(error(409,'PPA_CHARACTER_SAVE_NOT_READY','Сохранение не готово.'));
    if(saved.version!==command.version)
      return finish(error(409,'SAVE_VERSION_CONFLICT','Обнови кузницу: сохранение изменилось.'));
    const uid='craft_'+crypto.randomUUID().replace(/-/g,'');
    const crafted=craftOriginalEpicGear(saved.state,command.id,uid);
    if(crafted.status!==200)return finish(crafted);
    const write=await persistence.save(ownerId,crafted.state,saved.version);
    if(!write.ok)return finish({status:Number(write.status)||409,data:write});
    return finish({status:200,data:{ok:true,receipt:crafted.receipt,
      message:'Создано: '+crafted.receipt.name,state:stateView(ownerId,{state:crafted.state,version:write.version})}});
  });
}
