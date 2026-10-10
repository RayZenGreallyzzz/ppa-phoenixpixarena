import {executeNativeCommandOnce} from './native-action-ledger.js';

// Exact Telegram PPA equipFromBag / unequipSlot mutation ordering:
// bag.splice(index,1) -> replace equipped[slot] -> bag.push(previous)
// and equipped[slot]=null -> bag.push(previous).
// Same real D1 save, no separate Godot inventory or fake stats.
const SLOTS=new Set(['weapon','helmet','armor','gloves','ring','legs','boots',
 'necklace','artifact','cloak','wings','pet']);
const invalid=(status,code,message)=>({status,data:{ok:false,code,message}});
const goodUid=value=>typeof value==='string'&&value.length>=1&&value.length<=160;
const goodSlot=value=>typeof value==='string'&&SLOTS.has(value);
const ownClass=state=>String(state.classKey||state.cls||'').toLowerCase();
function checked(state){
 return state&&typeof state==='object'&&!Array.isArray(state)&&
  Array.isArray(state.bag)&&state.bag.length<=100&&
  state.equipped&&typeof state.equipped==='object'&&!Array.isArray(state.equipped);
}
export function originalInventoryMove(state,action,field){
 if(!checked(state))return invalid(409,'INVENTORY_SAVE_INVALID','Инвентарь персонажа не подтверждён.');
 const bag=state.bag,equipped=state.equipped;
 if(action==='equip'){
  if(!goodUid(field))return invalid(400,'INVALID_ITEM_UID','Некорректный идентификатор вещи.');
  const positions=bag.map((item,i)=>item&&item.uid===field?i:-1).filter(i=>i>=0);
  if(positions.length!==1)return invalid(409,'INVENTORY_ITEM_MISSING','Не найдена ровно одна вещь в сумке.');
  const original=bag[positions[0]];
  if(!goodSlot(original.slot))return invalid(409,'NOT_EQUIPPABLE','Предмет нельзя надеть.');
  if(original.classKey&&original.classKey!=='all'&&original.classKey!==ownClass(state))
   return invalid(409,'CLASS_MISMATCH','Вещь предназначена другому классу.');
  const next=structuredClone(state);
  const [item]=next.bag.splice(positions[0],1);
  const previous=next.equipped[item.slot]||null;
  next.equipped[item.slot]=item;
  if(previous)next.bag.push(previous);
  return {status:200,state:next,receipt:{
   action:'equip',uid:item.uid,slot:item.slot,
   replacedUid:previous?.uid||null,
   name:String(item.name||'Предмет').slice(0,100)}};
 }
 if(action==='unequip'){
  if(!goodSlot(field))return invalid(400,'INVALID_SLOT','Недопустимый слот.');
  const old=equipped[field];
  if(!old||typeof old!=='object')return invalid(409,'SLOT_EMPTY','Этот слот пуст.');
  if(bag.length>=100)return invalid(409,'BAG_FULL','В сумке нет свободного места.');
  const next=structuredClone(state);
  const item=next.equipped[field];
  next.equipped[field]=null;
  next.bag.push(item);
  return {status:200,state:next,receipt:{
   action:'unequip',uid:item.uid||null,slot:field,
   name:String(item.name||'Предмет').slice(0,100)}};
 }
 return invalid(400,'UNKNOWN_INVENTORY_ACTION','Неизвестное действие инвентаря.');
}
const briefItem=(value,slot)=>value&&typeof value==='object'?{
 uid:goodUid(value.uid)?value.uid:null,
 name:String(value.name||'Предмет').slice(0,100),
 slot:typeof slot==='string'?slot:value.slot,
 rarity:String(value.rarity||'common'),
 enh:Number.isSafeInteger(value.enh)?value.enh:0,
 classKey:String(value.classKey||'all')
}:null;
const versionedView=(ownerId,saved)=>({
 connected:true,self:{id:String(ownerId)},version:saved.version,
 bag:(saved.state.bag||[]).slice(0,100).map(item=>briefItem(item,null)),
 equipped:Object.fromEntries([...SLOTS].map(slot=>[slot,briefItem(saved.state.equipped[slot],slot)]))
});
export async function sharedInventoryOperation(env,ownerId,operation,body,persistence){
 const envelope=data=>({...data,gameId:'phoenix-pix-arena',
  contract:'ppa-inventory-v1',ownerId:String(ownerId),
  actions:env.PPA_INVENTORY_ACTIONS_ENABLED==='1'?['equip','unequip']:[]});
 const load=async()=>{
  const r=await persistence.load(ownerId);
  return r.ok&&!r.bootstrapFromProfile&&r.state&&Number.isSafeInteger(r.version)&&r.version>=1?r:null;
 };
 if(operation==='state'){
  const saved=await load();
  if(!saved||!checked(saved.state))
   return invalid(409,'INVENTORY_SAVE_INVALID','Настоящий инвентарь PPA недоступен.');
  return {status:200,data:envelope({ok:true,state:versionedView(ownerId,saved)})};
 }
 if(env.PPA_INVENTORY_ACTIONS_ENABLED!=='1')
  return invalid(404,'NOT_FOUND','Inventory action not available');
 if(!body||!['equip','unequip'].includes(body.action)||
   !Number.isSafeInteger(body.version)||body.version<1)
  return invalid(400,'INVALID_INVENTORY_ACTION','Неверная операция или версия.');
 const action=body.action,field=action==='equip'?body.uid:body.slot;
 if(action==='equip'?!goodUid(field):!goodSlot(field))
  return invalid(400,'INVALID_INVENTORY_TARGET','Неверная вещь или слот.');
 const command={service:'inventory',action,
  ...(action==='equip'?{uid:field}:{slot:field}),version:body.version};
 return executeNativeCommandOnce(env,String(ownerId),body.requestId,command,async()=>{
  const finish=result=>({status:result.status,data:envelope({...result.data,
    requestId:body.requestId,commandStatus:'done'})});
  const saved=await load();
  if(!saved)return finish(invalid(409,'SAVE_NOT_READY','Сохранение не найдено.'));
  if(saved.version!==command.version)
   return finish(invalid(409,'SAVE_VERSION_CONFLICT','Обнови инвентарь: версия изменилась.'));
  const result=originalInventoryMove(saved.state,action,field);
  if(result.status!==200)return finish(result);
  const written=await persistence.save(ownerId,result.state,saved.version);
  if(!written.ok)return finish({status:Number(written.status)||409,data:written});
  return finish({status:200,data:{ok:true,
   receipt:result.receipt,message:action==='equip'?'Вещь надета':'Вещь снята',
   state:versionedView(ownerId,{state:result.state,version:written.version})}});
 });
}
