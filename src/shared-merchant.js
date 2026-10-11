import { executeNativeCommandOnce } from './native-action-ledger.js';

// Existing MERCHANT_DB / merchantBuy in the checksum-locked PPA source.
// tools/test-shared-merchant.mjs executes the original function for parity.
export const MERCHANT_OFFERS = Object.freeze([
  ['hp_small','Малое зелье HP',100,'gold','potions','hp'],
  ['hp_medium','Среднее зелье HP',250,'gold','potions','hpMedium'],
  ['hp_large','Большое зелье HP',500,'gold','potions','hpLarge'],
  ['mp_small','Малое зелье маны',100,'gold','potions','mp'],
  ['mp_medium','Среднее зелье маны',250,'gold','potions','mpMedium'],
  ['mp_large','Большое зелье маны',500,'gold','potions','mpLarge'],
  ['magic_small','Магическая сила',750,'gold','consumables','magicSmall'],
  ['atk_speed_small','Скорость атаки',750,'gold','consumables','atkSpeedSmall'],
  ['run_speed_small','Скорость бега',750,'gold','consumables','speedSmall'],
  ['phys_small','Физическая сила',750,'gold','consumables','physSmall'],
  ['xp_scroll','Свиток опыта',1000,'gold','consumables','xpScroll'],
  ['portal_scroll','Свиток телепорта',20,'ppa','consumables','portalStone']
].map(([id,name,price,currency,group,key])=>Object.freeze({id,name,price,currency,group,key})));

const fail = (status,code,message) => ({status,data:{ok:false,code,message}});
export function merchantPurchase(state, id, qty) {
  const offer=MERCHANT_OFFERS.find(row=>row.id===id);
  if (!offer || !Number.isInteger(qty) || qty<1 || qty>999)
    return fail(400,'INVALID_MERCHANT_ORDER','Некорректный товар или количество.');
  if (!state || typeof state!=='object' || Array.isArray(state))
    return fail(409,'PPA_CHARACTER_SAVE_NOT_READY','Сохранение персонажа не готово.');
  const balance=Number(state[offer.currency] || 0), total=offer.price*qty;
  if (!Number.isFinite(balance) || balance<total)
    return fail(409,'BALANCE_LOW','Не хватает '+(offer.currency==='ppa'?'PPA':'Gold')+' · нужно '+total+'.');
  const previous=state[offer.group];
  if (previous!=null && (typeof previous!=='object' || Array.isArray(previous)))
    return fail(409,'INVALID_INVENTORY_COUNTERS','Сначала обнови данные инвентаря.');
  const owned=Number(previous?.[offer.key] || 0);
  if (!Number.isSafeInteger(owned) || owned<0 || !Number.isSafeInteger(owned+qty))
    return fail(409,'INVALID_INVENTORY_COUNTERS','Сначала обнови данные инвентаря.');
  const next=structuredClone(state);
  next[offer.currency]=balance-total;
  next[offer.group] ??= {};
  next[offer.group][offer.key]=owned+qty;
  return {status:200,state:next,receipt:{id,qty,total,currency:offer.currency,name:offer.name}};
}

function view(ownerId,saved) {
  return {connected:true,self:{id:String(ownerId)},version:saved.version,
    wallet:{gold:Number(saved.state.gold)||0,ppa:Number(saved.state.ppa)||0},
    offers:MERCHANT_OFFERS.map(({group,key,...offer})=>({...offer,owned:Number(saved.state[group]?.[key])||0}))};
}

// Both transports supply their authenticated owner and existing save helpers.
// Never accept a client save, price, balance, reward or character identity.
export async function sharedMerchantOperation(env, ownerId, operation, body, persistence) {
  const envelope = data => ({...data,gameId:'phoenix-pix-arena',contract:'ppa-merchant-v1',
    ownerId:String(ownerId),actions:env.PPA_MERCHANT_ACTIONS_ENABLED==='1'?['buy']:[]});
  const load = async () => {
    const saved=await persistence.load(ownerId);
    if (!saved.ok || saved.bootstrapFromProfile || !saved.state || !Number.isInteger(saved.version) || saved.version<1)
      return null;
    return saved;
  };
  if (operation==='state') {
    const saved=await load();
    return saved ? {status:200,data:envelope({ok:true,state:view(ownerId,saved)})}
      : fail(409,'PPA_CHARACTER_SAVE_NOT_READY','Сначала синхронизируй существующего персонажа PPA.');
  }
  if (env.PPA_MERCHANT_ACTIONS_ENABLED!=='1') return fail(404,'NOT_FOUND','Merchant API route not found');
  if (body?.action!=='buy' || !MERCHANT_OFFERS.some(row=>row.id===body.id) ||
      !Number.isInteger(body.qty) || body.qty<1 || body.qty>999 || !Number.isSafeInteger(body.version) || body.version<1)
    return fail(400,'INVALID_MERCHANT_ORDER','Некорректный товар, количество или версия сохранения.');
  const command={service:'merchant',action:'buy',id:body.id,qty:body.qty,version:body.version};
  return executeNativeCommandOnce(env,String(ownerId),body.requestId,command,async()=>{
    const finish = result => ({status:result.status,data:envelope({...result.data,
      requestId:body.requestId,commandStatus:'done'})});
    const saved=await load();
    if (!saved) return finish(fail(409,'PPA_CHARACTER_SAVE_NOT_READY','Сохранение персонажа не готово.'));
    if (saved.version!==command.version) return finish(fail(409,'SAVE_VERSION_CONFLICT','Сохранение изменилось. Обнови торговца.'));
    const purchased=merchantPurchase(saved.state,command.id,command.qty);
    if (purchased.status!==200) return finish(purchased);
    // Original saveGameState archives and compares the exact loaded version.
    // A concurrent Telegram save wins or loses atomically; it is never merged
    // with a stale purchase or silently overwritten by the native client.
    const write=await persistence.save(ownerId,purchased.state,saved.version);
    if (!write.ok) return finish({status:Number(write.status)||409,data:write});
    return finish({status:200,data:{ok:true,receipt:purchased.receipt,
      message:'Куплено: '+purchased.receipt.name+' ×'+command.qty,
      state:view(ownerId,{state:purchased.state,version:write.version})}});
  });
}
