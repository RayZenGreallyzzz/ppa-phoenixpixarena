import {executeNativeCommandOnce} from './native-action-ledger.js';
import {originalAtomicAuctionBuy,originalAuctionSlots} from './online.js';

const fail=(status,code,message)=>({status,data:{ok:false,code,message}});
const gearUid=u=>typeof u==='string'&&u.length>0&&u.length<=160;
const money=x=>typeof x==='number'&&Number.isFinite(x)&&x>=1&&x<=999999999
  &&Math.round(x*100)===x*100;
const validVer=v=>Number.isSafeInteger(v)&&v>=1;
const LIMIT=1_800_000;
const encoder=new TextEncoder();
const schema='CREATE TABLE IF NOT EXISTS ppa_native_auction_guard(id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))';
const guard=e=>e.DB.prepare('INSERT INTO ppa_native_auction_guard(id,ok) VALUES(?1,CASE WHEN changes()=1 THEN 1 ELSE 0 END)');
const checkUid=(save,uid)=>{
 const all=[...(save.bag||[]),
  ...(Array.isArray(save.storage?.personal)?save.storage.personal:[]),
  ...(Array.isArray(save.storage?.premium)?save.storage.premium:[]),
  ...Object.values(save.equipped&&typeof save.equipped==='object'?save.equipped:{})];
 return all.filter(it=>it&&it.uid===uid).length===1;
};
const payloadView=item=>({item:{uid:item.uid,name:String(item.name||'Предмет').slice(0,100),
 slot:String(item.slot||'').slice(0,30),rarity:String(item.rarity||'common'),
 enh:Number.isInteger(item.enh)?item.enh:0,kind:'gear',
 icon:String(item.icon||item.ic||'◆').slice(0,16),bm:Number(item.bm)||0}});
async function saveFor(persist,owner){
 const r=await persist.load(owner);
 return r?.ok&&!r.bootstrapFromProfile&&r.state&&validVer(r.version)?r:null;
}
function byteSafe(...values){return values.every(x=>encoder.encode(x).length<=LIMIT);}
async function place(env,owner,cmd,persist){
 const saved=await saveFor(persist,owner);
 if(!saved)return fail(409,'AUCTION_SAVE_NOT_READY','Нет актуального сохранения PPA.');
 if(saved.version!==cmd.version)return fail(409,'SAVE_VERSION_CONFLICT','Обнови сумку перед продажей.');
 const state=saved.state;
 if(!Array.isArray(state.bag)||state.bag.length>100)
  return fail(409,'AUCTION_BAG_INVALID','Сумка PPA недоступна.');
 if(originalAuctionSlots(state)<=0)
  return fail(403,'AUCTION_SLOTS_LOCKED','Слоты аукциона ещё не открыты премиум-покупкой.');
 const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM auction_lots WHERE seller_id=?1 AND status='active' AND expires_at>?2")
  .bind(owner,Date.now()).first();
 if(Number(count?.n)>=originalAuctionSlots(state))
  return fail(409,'AUCTION_SLOTS_FULL','Свободных слотов продажи нет.');
 const matching=state.bag.map((i,n)=>i?.uid===cmd.uid?n:-1).filter(x=>x>=0);
 if(matching.length!==1||!checkUid(state,cmd.uid))
  return fail(409,'AUCTION_ITEM_MISSING','В сумке не найдена единственная вещь для продажи.');
 const item=state.bag[matching[0]];
 if(!item||typeof item!=='object'||!item.slot||!item.stats||item.statChest===true)
  return fail(409,'AUCTION_ITEM_UNSUPPORTED','Такую вещь пока нельзя безопасно выставить из Godot.');
 const next=structuredClone(state);
 const [escrow]=next.bag.splice(matching[0],1);
 const rawSave=JSON.stringify(next);
 const lotItem=JSON.stringify({kind:'gear',gear:escrow});
 const ui=JSON.stringify(payloadView(escrow));
 if(!byteSafe(rawSave,lotItem,ui)||encoder.encode(lotItem).length>140000)
  return fail(413,'AUCTION_ITEM_TOO_LARGE','Предмет слишком большой для аукциона.');
 const id='nat_'+crypto.randomUUID().replace(/-/g,'');
 const now=Date.now(),expires=now+86400000;
 const sellerName=String(state.nickname||state.name||'Игрок').slice(0,24);
 const g='ag_'+crypto.randomUUID();
 await env.DB.prepare(schema).run();
 try{
  await env.DB.batch([
   env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5')
    .bind(saved.version+1,rawSave,now,owner,saved.version),
   guard(env).bind(g),
   env.DB.prepare("INSERT INTO auction_lots(id,seller_id,seller_name,item_json,ui_json,qty,price,currency,created_at,expires_at,status) VALUES(?1,?2,?3,?4,?5,1,?6,?7,?8,?9,'active')")
    .bind(id,owner,sellerName,lotItem,ui,cmd.price,cmd.currency,now,expires),
   env.DB.prepare('DELETE FROM ppa_native_auction_guard WHERE id=?1').bind(g)
  ]);
 }catch(e){
  if(/constraint failed/i.test(String(e)))return fail(409,'AUCTION_LISTING_CONFLICT','Сумка изменилась. Обнови аукцион.');
  throw e;
 }
 return {status:200,data:{ok:true,message:'Вещь размещена на общем аукционе PPA',
   receipt:{action:'place',id,uid:cmd.uid,enh:escrow.enh||0,price:cmd.price,currency:cmd.currency},
   version:saved.version+1,refreshRequired:true}};
}
async function cancel(env,owner,cmd,persist){
 if(!cmd.lotId.startsWith('nat_'))
  return fail(409,'AUCTION_LEGACY_CANCEL','Старые Telegram лоты снимаются своим исходным механизмом.');
 const lot=await env.DB.prepare("SELECT * FROM auction_lots WHERE id=?1 AND seller_id=?2 AND status='active'")
  .bind(cmd.lotId,owner).first();
 if(!lot||Number(lot.qty)!==1)return fail(409,'AUCTION_LOT_UNAVAILABLE','Лот уже продан или снят.');
 let parsed;try{parsed=JSON.parse(lot.item_json)}catch{}
 if(parsed?.kind!=='gear'||!gearUid(parsed.gear?.uid))
  return fail(409,'AUCTION_ESCROW_INVALID','Не удалось подтвердить исходный предмет лота.');
 const saved=await saveFor(persist,owner);
 if(!saved||saved.version!==cmd.version)
  return fail(409,'SAVE_VERSION_CONFLICT','Обнови аукцион и сохранение.');
 const state=saved.state;
 if(!Array.isArray(state.bag)||state.bag.length>=100||!checkUid({
  ...state,bag:[...state.bag,parsed.gear]},parsed.gear.uid))
  return fail(409,'AUCTION_BAG_INVALID','Сумка полна или UID предмета уже занят.');
 const next=structuredClone(state);
 next.bag.push(parsed.gear);
 const raw=JSON.stringify(next);
 if(!byteSafe(raw))return fail(413,'AUCTION_SAVE_TOO_LARGE','Сейв превышает лимит.');
 const g='ac_'+crypto.randomUUID(),h='as_'+crypto.randomUUID(),now=Date.now();
 await env.DB.prepare(schema).run();
 try{
  await env.DB.batch([
   env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5')
    .bind(saved.version+1,raw,now,owner,saved.version),
   guard(env).bind(g),
   env.DB.prepare("UPDATE auction_lots SET status='cancelled' WHERE id=?1 AND seller_id=?2 AND status='active' AND qty=1")
    .bind(cmd.lotId,owner),
   guard(env).bind(h),
   env.DB.prepare('DELETE FROM ppa_native_auction_guard WHERE id=?1 OR id=?2').bind(g,h)
  ]);
 }catch(e){
  if(/constraint failed/i.test(String(e)))return fail(409,'AUCTION_CANCEL_CONFLICT','Лот или инвентарь изменился.');
  throw e;
 }
 return {status:200,data:{ok:true,message:'Лот снят, оригинальная вещь возвращена в сумку',
  receipt:{action:'cancel',id:cmd.lotId,uid:parsed.gear.uid,enh:parsed.gear.enh||0},
  version:saved.version+1,refreshRequired:true}};
}
async function buy(env,owner,cmd,persist){
 if(!cmd.lotId.startsWith('nat_'))
  return fail(409,'AUCTION_LEGACY_BUY','Старые лоты требуют отдельной проверки источника товара.');
 const saved=await saveFor(persist,owner);
 if(!saved||saved.version!==cmd.version)
  return fail(409,'SAVE_VERSION_CONFLICT','Обнови баланс и лот перед покупкой.');
 // Crucial: same original Telegram PPA atomic auctionBuy, not a second
 // settlement algorithm. Original validates actual lot and server balance.
 const r=await originalAtomicAuctionBuy(env,owner,{
  lotId:cmd.lotId,qty:1,currency:cmd.currency,
  expectedUnitPrice:cmd.expectedUnitPrice
 });
 return {status:r.status,data:{...r.data,
  receipt:r.data?.ok?{action:'buy',id:cmd.lotId,qty:1,total:r.data.total,currency:r.data.currency}:null,
  refreshRequired:r.data?.ok===true}};
}
export async function sharedAuctionAction(env,ownerId,body,persistence){
 if(env.PPA_AUCTION_ACTIONS_ENABLED!=='1')
  return fail(404,'NOT_FOUND','Auction actions disabled');
 const owner=String(ownerId),action=body?.action;
 if(!['place','buy','cancel'].includes(action)||!validVer(body?.version))
  return fail(400,'AUCTION_INVALID_ACTION','Неверная операция аукциона.');
 let command={service:'auction',action,version:body.version};
 if(action==='place'){
  if(!gearUid(body.uid)||!money(body.price)||!['ppa','gram'].includes(body.currency))
   return fail(400,'AUCTION_INVALID_LOT','Некорректная вещь, цена или валюта.');
  Object.assign(command,{uid:body.uid,price:body.price,currency:body.currency});
 }else if(action==='cancel'){
  if(typeof body.lotId!=='string'||!/^nat_[a-z0-9]{32}$/.test(body.lotId))
   return fail(400,'AUCTION_INVALID_LOT','Недопустимый лот.');
  command.lotId=body.lotId;
 }else{
  if(typeof body.lotId!=='string'||!/^nat_[a-z0-9]{32}$/.test(body.lotId)||
   !money(body.expectedUnitPrice)||!['ppa','gram'].includes(body.currency))
   return fail(400,'AUCTION_INVALID_LOT','Недопустимый лот или цена.');
  Object.assign(command,{lotId:body.lotId,expectedUnitPrice:body.expectedUnitPrice,currency:body.currency});
 }
 const envelope=r=>({status:r.status,data:{...r.data,gameId:'phoenix-pix-arena',
  contract:'ppa-auction-v1',ownerId:owner,
  requestId:body.requestId,commandStatus:'done'}});
 return executeNativeCommandOnce(env,owner,body.requestId,command,async()=>{
  const result=action==='place'?await place(env,owner,command,persistence):
   action==='cancel'?await cancel(env,owner,command,persistence):
   await buy(env,owner,command,persistence);
  return envelope(result);
 });
}
