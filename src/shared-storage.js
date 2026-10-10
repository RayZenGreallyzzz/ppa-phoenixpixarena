import {executeNativeCommandOnce} from './native-action-ledger.js';

// Original Telegram PPA storageMove('personal', direction, bag/storage idx)
// always splices a WHOLE original item and pushes that object unchanged.
// Native selects the same saved item by its unique UID, never an unsafe
// client-selected array index, item payload, stats or enhancement value.
export const PERSONAL_CAP=200, BAG_CAP=100;
const err=(status,code,message)=>({status,data:{ok:false,code,message}});
const validUid=uid=>typeof uid==='string'&&uid.length>0&&uid.length<=160;
const itemsEqualId=(item,uid)=>item&&typeof item==='object'&&!Array.isArray(item)&&item.uid===uid;
const slots=saved=>saved&&typeof saved==='object'&&!Array.isArray(saved)&&
 Array.isArray(saved.bag)&&saved.bag.length<=BAG_CAP&&
 (!saved.storage||typeof saved.storage==='object'&&!Array.isArray(saved.storage))&&
 (!saved.storage?.personal||Array.isArray(saved.storage.personal))&&
 (!saved.storage?.premium||Array.isArray(saved.storage.premium));
const owned=item=>item&&typeof item==='object'&&!Array.isArray(item)?{
 uid:validUid(item.uid)?item.uid:null,
 name:String(item.name||'Предмет').slice(0,100),slot:String(item.slot||''),
 rarity:String(item.rarity||'common'),
 enh:Number.isInteger(item.enh)?item.enh:0,
 stats:item.stats&&typeof item.stats==='object'&&!Array.isArray(item.stats)?item.stats:{}
}:null;
function personal(state){return Array.isArray(state.storage?.personal)?state.storage.personal:[];}
export function moveOriginalPersonalStorage(state,direction,uid){
 if(!slots(state))
  return err(409,'STORAGE_SAVE_NOT_READY','Не удалось подтвердить сохранение инвентаря.');
 if(!['put','take'].includes(direction)||!validUid(uid))
  return err(400,'STORAGE_ACTION_INVALID','Неизвестная операция или идентификатор предмета.');
 const box=personal(state),from=direction==='put'?state.bag:box,
  to=direction==='put'?box:state.bag,capacity=direction==='put'?PERSONAL_CAP:BAG_CAP;
 if(box.length>PERSONAL_CAP)
  return err(409,'STORAGE_OVER_CAPACITY','Размер склада не соответствует оригинальной PPA.');
 if(to.length>=capacity)
  return err(409,'STORAGE_FULL',direction==='put'?'Склад заполнен (200).':'Сумка заполнена (100).');
 const found=from.map((item,i)=>itemsEqualId(item,uid)?i:-1).filter(i=>i>=0);
 if(found.length!==1)
  return err(409,'STORAGE_ITEM_NOT_UNIQUE','Не найдена ровно одна вещь с указанным UID.');
 const occupied=[...state.bag,...box,...(Array.isArray(state.storage?.premium)?state.storage.premium:[]),
  ...Object.values(state.equipped&&typeof state.equipped==='object'?state.equipped:{})]
  .filter(item=>itemsEqualId(item,uid));
 if(occupied.length!==1)
  return err(409,'STORAGE_DUPLICATE_UID','Предмет уже существует в другом разделе инвентаря.');
 const next=structuredClone(state);
 if(!next.storage)next.storage={};
 if(!Array.isArray(next.storage.personal))next.storage.personal=[];
 const nextFrom=direction==='put'?next.bag:next.storage.personal,
   nextTo=direction==='put'?next.storage.personal:next.bag;
 const [item]=nextFrom.splice(found[0],1);
 nextTo.push(item);
 return {status:200,state:next,receipt:{uid,direction,name:String(item.name||'Предмет').slice(0,100),
  rarity:item.rarity||'common',enh:item.enh||0,
  from:direction==='put'?'bag':'personal',to:direction==='put'?'personal':'bag'}};
}
function storageView(ownerId,save){
 const state=save.state,box=personal(state);
 return {connected:true,self:{id:String(ownerId)},version:save.version,
  capacities:{personal:PERSONAL_CAP,bag:BAG_CAP},bag:state.bag.map(owned),
  personal:box.map(owned)};
}
export async function sharedStorageOperation(env,ownerId,operation,body,persistence){
 const enabled=env.PPA_PERSONAL_STORAGE_ACTIONS_ENABLED==='1';
 const envelope=data=>({...data,gameId:'phoenix-pix-arena',
  contract:'ppa-personal-storage-v1',ownerId:String(ownerId),
  actions:enabled?['put','take']:[]});
 const load=async()=>{
  const r=await persistence.load(ownerId);
  return r.ok&&!r.bootstrapFromProfile&&r.state&&
   Number.isSafeInteger(r.version)&&r.version>=1?r:null;
 };
 if(operation==='state'){
  const save=await load();
  if(!save||!slots(save.state))
   return err(409,'STORAGE_SAVE_NOT_READY','Сохранение PPA ещё не загружено.');
  return {status:200,data:envelope({ok:true,state:storageView(ownerId,save)})};
 }
 if(!enabled)return err(404,'NOT_FOUND','Storage API route not found');
 if(!body||!['put','take'].includes(body.action)||!validUid(body.uid)||
   !Number.isSafeInteger(body.version)||body.version<1)
  return err(400,'STORAGE_ACTION_INVALID','Неверная операция перемещения.');
 const command={service:'personal-storage',action:body.action,uid:body.uid,version:body.version};
 return executeNativeCommandOnce(env,String(ownerId),body.requestId,command,async()=>{
  const finish=result=>({status:result.status,data:envelope({...result.data,
   requestId:body.requestId,commandStatus:'done'})});
  const saved=await load();
  if(!saved)return finish(err(409,'STORAGE_SAVE_NOT_READY','Сохранение недоступно.'));
  if(saved.version!==command.version)
   return finish(err(409,'SAVE_VERSION_CONFLICT','Инвентарь изменился. Обнови склад.'));
  const moved=moveOriginalPersonalStorage(saved.state,command.action,command.uid);
  if(moved.status!==200)return finish(moved);
  const write=await persistence.save(ownerId,moved.state,saved.version);
  if(!write.ok)return finish({status:Number(write.status)||409,data:write});
  return finish({status:200,data:{ok:true,receipt:moved.receipt,
   message:command.action==='put'?'Положено в личный склад':'Взято из личного склада',
   state:storageView(ownerId,{state:moved.state,version:write.version})}});
 });
}
