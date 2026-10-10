import {executeNativeCommandOnce} from './native-action-ledger.js';

// Same character bag and clan_meta.storage_json as Telegram PPA.
// One D1.batch transaction, two optimistic CAS updates and SQLite CHECK
// guards ensure no partial change to a real player's equipment or clan vault.
const encoder=new TextEncoder(),MAX=1_800_000;
const error=(status,code,message)=>({status,data:{ok:false,code,message}});
const parse=(raw,fall)=>{try{return JSON.parse(raw)}catch{return fall}};
const goodUid=v=>typeof v==='string'&&v.length>=1&&v.length<=160;
const goodList=v=>Array.isArray(v)&&v.every(x=>x&&typeof x==='object'&&!Array.isArray(x));
const brief=item=>({uid:goodUid(item.uid)?item.uid:null,
 name:String(item.name||'Предмет').slice(0,100),slot:String(item.slot||''),
 rarity:String(item.rarity||'common'),enh:Number.isInteger(item.enh)?item.enh:0,
 stats:item.stats&&typeof item.stats==='object'&&!Array.isArray(item.stats)?item.stats:{}});
const right=(c,action,uid)=>{
 if(c.member.role==='leader')return true;
 const p=c.permissions[c.owner]||{};
 if(action==='put')return p.canDeposit===true;
 return p.withdrawMode==='all'||p.withdrawMode==='selected'&&
  Number.isSafeInteger(p.allowed?.[uid])&&p.allowed[uid]>0;
};
const hash=async value=>{
 const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));
 return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
};

export function buildClanVaultMove(ctx,action,uid) {
 if(!ctx?.save||!goodList(ctx.save.bag)||!goodList(ctx.items)||
  ctx.save.bag.length>100||ctx.items.length>500)
  return error(409,'CLAN_STORAGE_INVALID','Сумка или клановый склад не подтверждены.');
 if(!['put','take'].includes(action)||!goodUid(uid))
  return error(400,'CLAN_STORAGE_BAD_ITEM','Неизвестная операция или вещь.');
 if(!ctx.unlocked)return error(409,'CLAN_STORAGE_LOCKED','Клановый склад не открыт.');
 if(!right(ctx,action,uid))return error(403,'CLAN_STORAGE_PERMISSION','Недостаточно прав склада.');
 const from=action==='put'?ctx.save.bag:ctx.items;
 const dest=action==='put'?ctx.items:ctx.save.bag;
 if(dest.length>=(action==='put'?500:100))
  return error(409,'CLAN_STORAGE_FULL','Нет свободной ячейки.');
 const positions=from.map((x,i)=>x.uid===uid?i:-1).filter(i=>i>=0);
 if(positions.length!==1)
  return error(409,'CLAN_STORAGE_ITEM_MISSING','Вещь отсутствует или UID неоднозначен.');
 const all=[...ctx.save.bag,...ctx.items,
  ...(Array.isArray(ctx.save.storage?.personal)?ctx.save.storage.personal:[]),
  ...(Array.isArray(ctx.save.storage?.premium)?ctx.save.storage.premium:[]),
  ...Object.values(ctx.save.equipped&&typeof ctx.save.equipped==='object'?ctx.save.equipped:{})];
 if(all.filter(x=>x&&x.uid===uid).length!==1)
  return error(409,'CLAN_STORAGE_UID_COLLISION','Вещь числится в двух местах.');
 const nextSave=structuredClone(ctx.save),nextItems=structuredClone(ctx.items);
 const nextPermissions=structuredClone(ctx.permissions);
 const nextFrom=action==='put'?nextSave.bag:nextItems;
 const nextDest=action==='put'?nextItems:nextSave.bag;
 const [item]=nextFrom.splice(positions[0],1);
 nextDest.push(item);
 if(action==='take'&&ctx.member.role!=='leader'){
  const p=nextPermissions[ctx.owner]||{};
  if(p.withdrawMode==='selected'){
   const remaining=p.allowed[uid]-1;
   if(remaining<=0)delete p.allowed[uid]; else p.allowed[uid]=remaining;
  }
 }
 return {status:200,nextSave,nextItems,nextPermissions,receipt:{
  action,uid,name:String(item.name||'Предмет').slice(0,100),
  rarity:String(item.rarity||'common'),enh:Number.isInteger(item.enh)?item.enh:0,
  clanId:ctx.clanId}};
}

async function readContext(env,owner){
 const member=await env.DB.prepare('SELECT clan_id,role,telegram_id FROM clan_members WHERE telegram_id=?1')
  .bind(owner).first();
 if(!member)return null;
 const clan=await env.DB.prepare('SELECT id,storage_unlocked FROM clans WHERE id=?1')
  .bind(member.clan_id).first();
 const meta=await env.DB.prepare('SELECT storage_json,permissions_json,events_json,history_json,updated_at FROM clan_meta WHERE clan_id=?1')
  .bind(member.clan_id).first();
 const save=await env.DB.prepare('SELECT version,state_json FROM saves WHERE telegram_id=?1')
  .bind(owner).first();
 if(!clan||!meta||!save||!Number.isSafeInteger(Number(save.version))||Number(save.version)<1)return null;
 const bag=parse(save.state_json,null),items=parse(meta.storage_json,null),
  permissions=parse(meta.permissions_json,null),events=parse(meta.events_json,null),
  history=parse(meta.history_json,null);
 if(!bag||!goodList(bag.bag)||!goodList(items)||!permissions||
  typeof permissions!=='object'||Array.isArray(permissions)||
  !Array.isArray(events)||!Array.isArray(history))return null;
 const ctx={owner,member,clanId:String(clan.id),unlocked:Number(clan.storage_unlocked)===1,
  save:bag,items,permissions,events,history,version:Number(save.version),
  raw:{items:meta.storage_json,permissions:meta.permissions_json,
   events:meta.events_json,history:meta.history_json,updated:meta.updated_at}};
 ctx.revision=await hash([ctx.clanId,...Object.values(ctx.raw),member.role,ctx.unlocked?'1':'0'].join('\u0000'));
 return ctx;
}
const view=c=>({connected:true,self:{id:c.owner},clanId:c.clanId,
 version:c.version,clanRevision:c.revision,storageUnlocked:c.unlocked,
 capacity:{bag:100,clan:500},canDeposit:c.unlocked&&right(c,'put',''),
 bag:c.save.bag.map(brief),
 items:c.items.map(item=>({...brief(item),
   canTake:c.unlocked&&goodUid(item.uid)&&right(c,'take',item.uid)}))
});
const schema='CREATE TABLE IF NOT EXISTS ppa_native_clan_vault_guard (id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))';
async function writeAtomic(env,c,result) {
 const now=Math.max(Date.now(),Number(c.raw.updated)||0)+1;
 const save=JSON.stringify(result.nextSave),items=JSON.stringify(result.nextItems),
  permissions=JSON.stringify(result.nextPermissions);
 const event={id:'ce_'+crypto.randomUUID(),
  type:result.receipt.action==='put'?'storagePut':'storageTake',
  playerId:c.owner,itemUid:result.receipt.uid,itemName:result.receipt.name,ts:now};
 const events=JSON.stringify([event,...c.events].slice(0,300));
 const history=JSON.stringify([event,...c.history].slice(0,500));
 if([save,items,permissions,events,history].some(s=>encoder.encode(s).length>MAX))
  return error(413,'CLAN_STORAGE_TOO_LARGE','Сохранение или журнал превышает лимит.');
 const g1='cs_'+crypto.randomUUID(),g2='cm_'+crypto.randomUUID();
 await env.DB.prepare(schema).run();
 try{
  await env.DB.batch([
   env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5')
    .bind(c.version+1,save,now,c.owner,c.version),
   env.DB.prepare('INSERT INTO ppa_native_clan_vault_guard(id,ok) VALUES(?1,CASE WHEN changes()=1 THEN 1 ELSE 0 END)')
    .bind(g1),
   env.DB.prepare('UPDATE clan_meta SET storage_json=?1,permissions_json=?2,events_json=?3,history_json=?4,updated_at=?5 '+
    'WHERE clan_id=?6 AND storage_json=?7 AND permissions_json=?8 AND events_json=?9 AND history_json=?10 AND updated_at=?11 '+
    'AND EXISTS(SELECT 1 FROM clan_members WHERE clan_id=?6 AND telegram_id=?12 AND role=?13) '+
    'AND EXISTS(SELECT 1 FROM clans WHERE id=?6 AND storage_unlocked=1)')
    .bind(items,permissions,events,history,now,c.clanId,
      c.raw.items,c.raw.permissions,c.raw.events,c.raw.history,c.raw.updated,c.owner,c.member.role),
   env.DB.prepare('INSERT INTO ppa_native_clan_vault_guard(id,ok) VALUES(?1,CASE WHEN changes()=1 THEN 1 ELSE 0 END)')
    .bind(g2),
   env.DB.prepare('DELETE FROM ppa_native_clan_vault_guard WHERE id=?1 OR id=?2').bind(g1,g2)
  ]);
 }catch(e){
  // D1.batch is transactional; failed CHECK rolls back BOTH updates.
  if(/CHECK constraint failed|SQLITE_CONSTRAINT_CHECK|constraint failed/i.test(String(e)))
   return error(409,'CLAN_STORAGE_CONFLICT','Клан или инвентарь изменились. Обнови данные.');
  // Unknown transport or DB failures may follow commit: keep ledger pending,
  // never mint a replacement item on blind retry.
  throw e;
 }
 return {status:200};
}

export async function sharedClanStorageOperation(env,ownerId,operation,body={}) {
 const owner=String(ownerId),active=env.PPA_CLAN_STORAGE_ACTIONS_ENABLED==='1';
 const envelope=data=>({...data,gameId:'phoenix-pix-arena',
  contract:'ppa-clan-storage-v1',ownerId:owner,actions:active?['put','take']:[]});
 if(operation==='action'&&!active)return error(404,'NOT_FOUND','Clan storage action not enabled');
 const ctx=await readContext(env,owner);
 if(!ctx)return error(409,'CLAN_STORAGE_UNAVAILABLE','Клан или сохранение недоступны.');
 if(operation==='state')return {status:200,data:envelope({ok:true,state:view(ctx)})};
 if(!body||!['put','take'].includes(body.action)||!goodUid(body.uid)||
  !Number.isSafeInteger(body.version)||body.version<1||
  !/^[0-9a-f]{64}$/.test(String(body.clanRevision||'')))
  return error(400,'CLAN_STORAGE_BAD_ACTION','Некорректные данные операции.');
 const command={service:'clan-storage',action:body.action,uid:body.uid,
  version:body.version,clanRevision:body.clanRevision};
 return executeNativeCommandOnce(env,owner,body.requestId,command,async()=>{
  const finish=r=>({status:r.status,data:envelope({...r.data,
   requestId:body.requestId,commandStatus:'done'})});
  const latest=await readContext(env,owner);
  if(!latest)return finish(error(409,'CLAN_STORAGE_UNAVAILABLE','Клан больше недоступен.'));
  if(latest.version!==command.version||latest.revision!==command.clanRevision)
   return finish(error(409,'CLAN_STORAGE_CONFLICT','Обнови склад и сумку.'));
  const moved=buildClanVaultMove(latest,command.action,command.uid);
  if(moved.status!==200)return finish(moved);
  const saved=await writeAtomic(env,latest,moved);
  if(saved.status!==200)return finish(saved);
  const refreshed=await readContext(env,owner);
  return finish({status:200,data:{ok:true,receipt:moved.receipt,
   message:command.action==='put'?'Вещь внесена в склад':'Вещь выдана из склада',
   state:refreshed?view(refreshed):null,refreshRequired:!refreshed}});
 });
}
