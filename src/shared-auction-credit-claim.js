// Original PPA seller-credit records (auction_credits), one canonical D1
// character save. Native and Telegram must opt into this SAME atomic mode
// before production; the old Telegram client applies credits locally.
const failure=(status,code,message)=>({status,data:{ok:false,code,message}});
const CREDIT_ID=/^[a-zA-Z0-9:_-]{4,140}$/;
const MAX_SAVE=1_800_000;
const guardSchema='CREATE TABLE IF NOT EXISTS ppa_auction_credit_cas_guard (id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))';
export function serverCreditClaimsCutoff(env){
 if(env.PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED!=='1')return null;
 const cutoff=Number(env.PPA_AUCTION_SERVER_CREDIT_CUTOFF_MS);
 // Explicit migration barrier, never guess one for existing legacy
 // localStorage-paid credits or cached Telegram mini-apps.
 return Number.isSafeInteger(cutoff)&&cutoff>0?cutoff:null;
}


export async function claimOriginalAuctionCredit(env,ownerId,creditId,expectedVersion){
 const owner=String(ownerId),id=String(creditId||'');
 const cutoff=serverCreditClaimsCutoff(env);
 if(cutoff===null)
  return failure(404,'AUCTION_CREDIT_CLAIM_DISABLED','Безопасная миграция выплат ещё не включена.');
 if(!CREDIT_ID.test(id)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
  return failure(400,'AUCTION_CREDIT_BAD_REQUEST','Неверный номер начисления или версия персонажа.');
 const credit=await env.DB.prepare('SELECT id,seller_id,currency,amount,acked,created_at FROM auction_credits WHERE id=?1 AND seller_id=?2')
  .bind(id,owner).first();
 if(!credit||Number(credit.acked)!==0||Number(credit.created_at)<cutoff)
  return failure(409,'AUCTION_CREDIT_UNAVAILABLE','Начисление уже получено или не принадлежит персонажу.');
 const amount=Number(credit.amount),currency=String(credit.currency||'');
 if(!['ppa','gram'].includes(currency)||!Number.isFinite(amount)||amount<=0||
   amount>999999999||Math.abs(Math.round(amount*100)-amount*100)>0.00001)
  return failure(409,'AUCTION_CREDIT_INVALID','Повреждённая сумма или валюта начисления.');
 const row=await env.DB.prepare('SELECT version,state_json FROM saves WHERE telegram_id=?1')
  .bind(owner).first();
 if(!row||Number(row.version)!==expectedVersion)
  return failure(409,'SAVE_VERSION_CONFLICT','Сохранение изменилось. Обнови начисления.');
 let state;try{state=JSON.parse(row.state_json)}catch{}
 if(!state||typeof state!=='object'||Array.isArray(state))
  return failure(409,'AUCTION_SAVE_INVALID','Сохранение персонажа не подтверждено.');
 const balance=Number(state[currency]);
 if(!Number.isFinite(balance)||balance<0||balance>999999999||
  Math.abs(Math.round(balance*100)-balance*100)>0.00001)
  return failure(409,'AUCTION_WALLET_INVALID','Исходный баланс персонажа не подтверждён.');
 const resultCents=Math.round(balance*100)+Math.round(amount*100);
 if(!Number.isSafeInteger(resultCents)||resultCents>99999999900)
  return failure(409,'AUCTION_WALLET_OVERFLOW','Превышен предел баланса.');
 const stateNext=structuredClone(state);
 stateNext[currency]=resultCents/100;
 const raw=JSON.stringify(stateNext);
 if(new TextEncoder().encode(raw).length>MAX_SAVE)
  return failure(413,'AUCTION_SAVE_TOO_LARGE','Сохранение превышает лимит.');
 const a='cv_'+crypto.randomUUID(),b='cc_'+crypto.randomUUID(),now=Date.now();
 await env.DB.prepare(guardSchema).run();
 try{
  // D1 batch rolls both changes back on either failed compare-and-swap.
  await env.DB.batch([
   env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5')
    .bind(expectedVersion+1,raw,now,owner,expectedVersion),
   env.DB.prepare('INSERT INTO ppa_auction_credit_cas_guard(id,ok) VALUES(?1,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(a),
   env.DB.prepare('UPDATE auction_credits SET acked=1 WHERE id=?1 AND seller_id=?2 AND acked=0 AND created_at>=?3')
    .bind(id,owner,cutoff),
   env.DB.prepare('INSERT INTO ppa_auction_credit_cas_guard(id,ok) VALUES(?1,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(b),
   env.DB.prepare('DELETE FROM ppa_auction_credit_cas_guard WHERE id=?1 OR id=?2').bind(a,b)
  ]);
 }catch(e){
  if(/constraint failed|SQLITE_CONSTRAINT_CHECK/i.test(String(e)))
   return failure(409,'AUCTION_CREDIT_CONFLICT','Начисление или сохранение изменились. Обнови баланс.');
  throw e;
 }
 return {status:200,data:{ok:true,code:'AUCTION_CREDIT_CLAIMED',
  message:'Доход от продажи зачислен на общий баланс PPA',
  receipt:{id,amount,currency},version:expectedVersion+1,
  balances:{ppa:Number(stateNext.ppa)||0,gram:Number(stateNext.gram)||0},
  refreshRequired:true}};
}
