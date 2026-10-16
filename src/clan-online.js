const enc=new TextEncoder();
function jr(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function hx(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function eq(a,b){a=String(a||'').toLowerCase();b=String(b||'').toLowerCase();if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function hm(k,d){const key=await crypto.subtle.importKey('raw',k,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',key,typeof d==='string'?enc.encode(d):d)}
async function auth(initData,token){if(!token)throw Object.assign(new Error('BOT_TOKEN secret is not configured'),{status:503});const p=new URLSearchParams(initData||''),rh=p.get('hash');if(!rh)throw Object.assign(new Error('Telegram session missing'),{status:401});p.delete('hash');const s=[...p.entries()].map(([k,v])=>`${k}=${v}`).sort((a,b)=>a.localeCompare(b)).join('\n'),sk=await hm(enc.encode('WebAppData'),token),calc=hx(await hm(new Uint8Array(sk),s));if(!eq(calc,rh))throw Object.assign(new Error('Telegram signature check failed'),{status:401});const ad=Number(p.get('auth_date')),now=Math.floor(Date.now()/1000);if(!Number.isFinite(ad)||now-ad>86400||ad>now+300)throw Object.assign(new Error('Telegram session expired'),{status:401});let u=null;try{u=JSON.parse(p.get('user')||'null')}catch(_){}if(!u||u.id==null)throw Object.assign(new Error('Telegram user missing'),{status:401});return u}
function sj(v,f){try{return JSON.parse(v)}catch(_){return f}}
function nm(v,max=24){return String(v||'').trim().replace(/\s+/g,' ').slice(0,max)}
function nk(v){return nm(v).toLocaleLowerCase('ru-RU')}
let ready=false;
async function schema(env){if(ready)return;const qs=[
`CREATE TABLE IF NOT EXISTS clans(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,leader_id TEXT NOT NULL,storage_unlocked INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS clan_members(clan_id TEXT NOT NULL,telegram_id TEXT NOT NULL UNIQUE,role TEXT NOT NULL DEFAULT 'member',joined_at INTEGER NOT NULL,PRIMARY KEY(clan_id,telegram_id))`,
`CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id)`,
`CREATE TABLE IF NOT EXISTS clan_meta(clan_id TEXT PRIMARY KEY,permissions_json TEXT NOT NULL DEFAULT '{}',authority_json TEXT NOT NULL DEFAULT '{}',applications_json TEXT NOT NULL DEFAULT '[]',history_json TEXT NOT NULL DEFAULT '[]',events_json TEXT NOT NULL DEFAULT '[]',storage_json TEXT NOT NULL DEFAULT '[]',progress_json TEXT NOT NULL DEFAULT '{}',siege_reward_json TEXT NOT NULL DEFAULT '{}',updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS clan_trades(id TEXT PRIMARY KEY,clan_id TEXT NOT NULL,player_a TEXT NOT NULL,player_b TEXT NOT NULL,offer_a_json TEXT NOT NULL DEFAULT '{"items":[],"gold":0,"ppa":0}',offer_b_json TEXT NOT NULL DEFAULT '{"items":[],"gold":0,"ppa":0}',confirmed_a INTEGER NOT NULL DEFAULT 0,confirmed_b INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,completed_at INTEGER NOT NULL DEFAULT 0)`,
`CREATE INDEX IF NOT EXISTS idx_clan_trades_players ON clan_trades(clan_id,player_a,player_b,status,updated_at)`,
`CREATE TABLE IF NOT EXISTS clan_trade_guard(id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))`
];for(const q of qs)await env.DB.prepare(q).run();ready=true}
async function ensurePlayer(env,u){const id=String(u.id),now=Date.now();await env.DB.prepare(`INSERT INTO players(telegram_id,telegram_username,telegram_first_name,telegram_last_name,nickname,nickname_key,class_key,created_at,updated_at,last_auth_at) VALUES(?1,?2,?3,?4,NULL,NULL,NULL,?5,?5,?5) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username=excluded.telegram_username,telegram_first_name=excluded.telegram_first_name,telegram_last_name=excluded.telegram_last_name,last_auth_at=excluded.last_auth_at`).bind(id,String(u.username||''),String(u.first_name||''),String(u.last_name||''),now).run();return env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(id).first()}
async function saveRow(env,id){const r=await env.DB.prepare('SELECT version,state_json FROM saves WHERE telegram_id=?1').bind(id).first();return r?{row:r,state:sj(r.state_json||'{}',{})}:null}
async function writeSave(env,id,s){const raw=JSON.stringify(s.state),now=Date.now();if(enc.encode(raw).byteLength>1_800_000)throw Object.assign(new Error('Сейв слишком большой'),{status:413});await env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4').bind((Number(s.row.version)||0)+1,raw,now,id).run()}
function clanBossUiReadyAt(v){return Math.max(0,Number(v)||0)}
function prog0(){return{coins:0,personalContribution:0,personalByMember:{},bonuses:{mobDamage:0,bossDamage:0,hp:0,mp:0,xp:0,gold:0},bossReadyAt:0}}
async function metaRow(env,cid){let r=await env.DB.prepare('SELECT * FROM clan_meta WHERE clan_id=?1').bind(cid).first();if(!r){await env.DB.prepare('INSERT INTO clan_meta(clan_id,updated_at) VALUES(?1,?2)').bind(cid,Date.now()).run();r=await env.DB.prepare('SELECT * FROM clan_meta WHERE clan_id=?1').bind(cid).first()}return r}
function parseMeta(r){return{permissions:sj(r&&r.permissions_json||'{}',{}),authority:sj(r&&r.authority_json||'{}',{}),applications:sj(r&&r.applications_json||'[]',[]),history:sj(r&&r.history_json||'[]',[]),events:sj(r&&r.events_json||'[]',[]),storage:sj(r&&r.storage_json||'[]',[]),progress:Object.assign(prog0(),sj(r&&r.progress_json||'{}',{})),siegeReward:sj(r&&r.siege_reward_json||'{}',{})}}
async function writeMeta(env,cid,m){await env.DB.prepare(`UPDATE clan_meta SET permissions_json=?1,authority_json=?2,applications_json=?3,history_json=?4,events_json=?5,storage_json=?6,progress_json=?7,siege_reward_json=?8,updated_at=?9 WHERE clan_id=?10`).bind(JSON.stringify(m.permissions||{}),JSON.stringify(m.authority||{}),JSON.stringify((m.applications||[]).slice(0,200)),JSON.stringify((m.history||[]).slice(0,500)),JSON.stringify((m.events||[]).slice(0,300)),JSON.stringify((m.storage||[]).slice(0,500)),JSON.stringify(m.progress||prog0()),JSON.stringify(m.siegeReward||{}),Date.now(),cid).run()}
async function mem(env,id){return env.DB.prepare('SELECT clan_id,role,joined_at FROM clan_members WHERE telegram_id=?1').bind(id).first()}
async function reqClan(env,id){const m=await mem(env,id);if(!m)throw Object.assign(new Error('Ты не состоишь в клане.'),{status:409});const c=await env.DB.prepare('SELECT * FROM clans WHERE id=?1').bind(m.clan_id).first();if(!c)throw Object.assign(new Error('Клан не найден.'),{status:404});return{m,c}}
function act(state){if(!state||typeof state!=='object')return false;if(Number(state.lifetimePaidGram)>=1)return true;const b=state.premiumShop&&state.premiumShop.purchasedBundles;return !!(b&&Object.keys(b).some(k=>!!b[k]))}
function lv(coins){const t=[0,0,500,1500,3000,5000,7500,10500,14000,18000,25000];let l=1;for(let i=2;i<=10;i++)if(coins>=t[i])l=i;return l}
function progUi(p,id=''){p=Object.assign(prog0(),p||{});const l=lv(Number(p.coins)||0),spent=Object.values(p.bonuses||{}).reduce((a,b)=>a+(Number(b)||0),0),earned=Math.max(0,l-1),t=[0,0,500,1500,3000,5000,7500,10500,14000,18000,25000],by=p.personalByMember&&typeof p.personalByMember==='object'?p.personalByMember:{},personal=id?Number(by[String(id)])||0:Number(p.personalContribution)||0;return{level:l,maxLevel:10,coins:Number(p.coins)||0,nextLevelCoins:l>=10?25000:t[l+1],freePoints:Math.max(0,earned-spent),spentPoints:spent,personalContribution:personal,dropBonusPct:l>=10?10:0,bonuses:Object.assign({},p.bonuses||{}),bossReadyAt:clanBossUiReadyAt(p.bossReadyAt)}}
async function clanDirectory(env,id){
  const rs=await env.DB.prepare(`SELECT c.id,c.name,c.leader_id,c.created_at,
    COUNT(cm.telegram_id) AS member_count,
    p.nickname AS leader_nickname,p.telegram_first_name AS leader_first_name,p.telegram_username AS leader_username,
    m.progress_json,m.applications_json
    FROM clans c
    LEFT JOIN clan_members cm ON cm.clan_id=c.id
    LEFT JOIN players p ON p.telegram_id=c.leader_id
    LEFT JOIN clan_meta m ON m.clan_id=c.id
    GROUP BY c.id
    LIMIT 200`).all();
  const list=(rs.results||[]).map(x=>{
    const progress=sj(x.progress_json||'{}',{});
    const coins=Math.max(0,Math.floor(Number(progress&&progress.coins)||0));
    const apps=sj(x.applications_json||'[]',[]);
    return{
      id:String(x.id||''),
      name:nm(x.name||'Клан',24),
      leaderId:String(x.leader_id||''),
      leaderName:nm(x.leader_nickname||x.leader_first_name||x.leader_username||'Глава',24),
      members:Math.max(0,Math.floor(Number(x.member_count)||0)),
      level:lv(coins),
      coins,
      createdAt:Math.max(0,Number(x.created_at)||0),
      applied:Array.isArray(apps)&&apps.some(a=>String(a&&a.telegramId||'')===String(id))
    };
  });
  list.sort((a,b)=>(b.coins-a.coins)||(b.members-a.members)||(a.createdAt-b.createdAt)||a.name.localeCompare(b.name,'ru'));
  list.forEach((x,i)=>{x.rank=i+1});
  return list.slice(0,100);
}
async function clearPendingApplications(env,id,exceptClanId=''){
  const rs=await env.DB.prepare('SELECT clan_id,applications_json FROM clan_meta').all();
  for(const row of (rs.results||[])){
    if(exceptClanId&&String(row.clan_id)===String(exceptClanId))continue;
    const apps=sj(row.applications_json||'[]',[]);
    if(!Array.isArray(apps)||!apps.some(x=>String(x&&x.telegramId||'')===String(id)))continue;
    const next=apps.filter(x=>String(x&&x.telegramId||'')!==String(id));
    await env.DB.prepare('UPDATE clan_meta SET applications_json=?1,updated_at=?2 WHERE clan_id=?3')
      .bind(JSON.stringify(next.slice(0,200)),Date.now(),String(row.clan_id)).run();
  }
}
function can(m,meta,key){return m.role==='leader'||!!(meta.authority&&meta.authority[m.telegram_id]&&meta.authority[m.telegram_id][key])}
const TRADE_TTL_MS=15*60*1000;
const TRADE_DONE_VISIBLE_MS=5*60*1000;
function trClone(v){return sj(JSON.stringify(v),null)}
function trNum(v,max=1000000000,dec=0){v=Number(v);if(!Number.isFinite(v)||v<0)return 0;v=Math.min(max,v);const p=Math.pow(10,dec);return Math.round(v*p)/p}
function trSig(it){return [String(it&&it.name||''),String(it&&it.slot||''),String(it&&it.rarity||''),String(it&&it.enh||0),String(it&&it.refId||''),String(it&&it.classKey||'')].join('|')}
function trUid(it){return String(it&&(it.uid||it.itemUid||it.itemId)||'')}
function trLocked(it){return !!(it&&(it.bound===true||it.tradeLocked===true||it.fartPickaxe===true||it.fartSlag===true||it.eventRewardStock===true))}
function trBag(state){state.bag=Array.isArray(state.bag)?state.bag:[];return state.bag}
function trCounter(state,kind){const k={material:'materials',stone:'stones',consumable:'consumables',grimoire:'grimoires',feather:'feathers'}[kind];if(!k)return null;state[k]=state[k]&&typeof state[k]==='object'?state[k]:{};return state[k]}
function trResolveBag(state,raw){
  const bag=trBag(state),x=raw&&typeof raw==='object'?(raw.item&&typeof raw.item==='object'?raw.item:raw):{};
  const uid=String(x.uid||x.itemUid||x.itemId||raw&&raw.uid||'');
  if(uid){const i=bag.findIndex(it=>it&&trUid(it)===uid);if(i>=0)return{i,item:bag[i]}}
  const ref=Number(raw&&((raw.bagIndex!=null)?raw.bagIndex:((raw.index!=null)?raw.index:raw.ref)));
  if(Number.isFinite(ref)&&ref>=0&&ref<bag.length&&bag[ref]){
    const sig=String(raw&&raw.sig||trSig(x));if(!sig||trSig(bag[ref])===sig)return{i:ref,item:bag[ref]};
  }
  const sig=String(raw&&raw.sig||trSig(x));if(sig){const i=bag.findIndex(it=>it&&trSig(it)===sig);if(i>=0)return{i,item:bag[i]}}
  return null;
}
function trNormalizeOffer(state,raw){
  raw=raw&&typeof raw==='object'?raw:{};
  if(raw.offer&&typeof raw.offer==='object')raw=raw.offer;
  let arr=Array.isArray(raw.items)?raw.items:(Array.isArray(raw.offerItems)?raw.offerItems:(raw.item?[raw.item]:[]));
  if(arr.length>12)throw Object.assign(new Error('В обмен можно положить максимум 12 позиций.'),{status:400});
  const out={items:[],gold:trNum(raw.gold!=null?raw.gold:raw.coins,1000000000,0),ppa:trNum(raw.ppa,1000000000,2)},seen=new Set();
  for(const entry of arr){
    const wrap=entry&&typeof entry==='object'?entry:{},obj=wrap.item&&typeof wrap.item==='object'?wrap.item:wrap;
    const kind=String(wrap.kind||obj.kind||'').toLowerCase();
    if(['material','stone','consumable','grimoire','feather'].includes(kind)){
      const refId=String(wrap.refId||obj.refId||obj.id||'').slice(0,80);
      const qty=Math.max(1,Math.min(999,Math.floor(Number(wrap.qty||wrap.count||1))));
      if(!refId)throw Object.assign(new Error('Не удалось определить ресурс для обмена.'),{status:400});
      const counter=trCounter(state,kind),have=Math.max(0,Math.floor(Number(counter[refId])||0));
      if(have<qty)throw Object.assign(new Error('Недостаточно предметов «'+String(obj.name||refId)+'».'),{status:409});
      const key=kind+':'+refId;if(seen.has(key))throw Object.assign(new Error('Одинаковую позицию добавь в обмен один раз.'),{status:400});seen.add(key);
      out.items.push({kind,refId,qty,item:{name:nm(obj.name||refId,60),rarity:String(obj.rarity||''),icon:String(obj.icon||obj.ic||''),img:String(obj.img||'')}});
      continue;
    }
    const r=trResolveBag(state,wrap);
    if(!r||!r.item)throw Object.assign(new Error('Предмет для обмена уже не найден в сумке.'),{status:409});
    if(trLocked(r.item))throw Object.assign(new Error('Этот предмет нельзя передавать.'),{status:409});
    const key='gear:'+(trUid(r.item)||('idx:'+r.i+':'+trSig(r.item)));if(seen.has(key))throw Object.assign(new Error('Один предмет нельзя положить в обмен дважды.'),{status:400});seen.add(key);
    out.items.push({kind:'gear',uid:trUid(r.item),bagIndex:r.i,sig:trSig(r.item),qty:1,item:trClone(r.item)});
  }
  const gold=Math.max(0,Number(state.gold)||0),ppa=Math.max(0,Number(state.ppa)||0);
  if(out.gold>gold)throw Object.assign(new Error('Недостаточно Gold для обмена.'),{status:409});
  if(out.ppa>ppa)throw Object.assign(new Error('Недостаточно PPA для обмена.'),{status:409});
  return out;
}
function trExtract(state,offer){
  const bundle={gear:[],counters:[],gold:trNum(offer&&offer.gold,1000000000,0),ppa:trNum(offer&&offer.ppa,1000000000,2)};
  const bag=trBag(state);
  for(const x of (offer&&offer.items)||[]){
    if(x.kind==='gear'){
      const r=trResolveBag(state,x);if(!r||!r.item||trLocked(r.item))throw Object.assign(new Error('Один из предметов предложения изменился или исчез.'),{status:409});
      bundle.gear.push(trClone(r.item));bag.splice(r.i,1);
    }else{
      const c=trCounter(state,x.kind),have=Math.max(0,Math.floor(Number(c&&c[x.refId])||0)),qty=Math.max(1,Math.floor(Number(x.qty)||1));
      if(!c||have<qty)throw Object.assign(new Error('Один из ресурсов предложения уже недоступен.'),{status:409});
      c[x.refId]=have-qty;bundle.counters.push({kind:x.kind,refId:x.refId,qty,item:x.item||{}});
    }
  }
  if(Math.max(0,Number(state.gold)||0)<bundle.gold)throw Object.assign(new Error('Недостаточно Gold для подтверждённого обмена.'),{status:409});
  if(Math.max(0,Number(state.ppa)||0)+1e-9<bundle.ppa)throw Object.assign(new Error('Недостаточно PPA для подтверждённого обмена.'),{status:409});
  state.gold=Math.max(0,(Number(state.gold)||0)-bundle.gold);
  state.ppa=Math.round((Math.max(0,Number(state.ppa)||0)-bundle.ppa)*100)/100;
  return bundle;
}
function trReceive(state,bundle){
  const bag=trBag(state);if(bag.length+(bundle.gear||[]).length>100)throw Object.assign(new Error('В сумке получателя недостаточно места.'),{status:409});
  for(const it of bundle.gear||[])bag.push(it);
  for(const x of bundle.counters||[]){const c=trCounter(state,x.kind);c[x.refId]=Math.max(0,Math.floor(Number(c[x.refId])||0))+Math.max(1,Math.floor(Number(x.qty)||1))}
  state.gold=Math.max(0,Number(state.gold)||0)+trNum(bundle.gold,1000000000,0);
  state.ppa=Math.round((Math.max(0,Number(state.ppa)||0)+trNum(bundle.ppa,1000000000,2))*100)/100;
}
async function trActive(env,cid,id,tradeId=''){
  const now=Date.now();await env.DB.prepare("UPDATE clan_trades SET status='expired',updated_at=?1 WHERE status='active' AND expires_at<=?1").bind(now).run();
  if(tradeId){const r=await env.DB.prepare("SELECT * FROM clan_trades WHERE id=?1 AND clan_id=?2 AND status='active' AND (player_a=?3 OR player_b=?3)").bind(String(tradeId),cid,id).first();if(r)return r}
  return env.DB.prepare("SELECT * FROM clan_trades WHERE clan_id=?1 AND status='active' AND expires_at>?2 AND (player_a=?3 OR player_b=?3) ORDER BY updated_at DESC LIMIT 1").bind(cid,now,id).first();
}
async function trView(env,cid,id){
  const now=Date.now();await env.DB.prepare("UPDATE clan_trades SET status='expired',updated_at=?1 WHERE status='active' AND expires_at<=?1").bind(now).run();
  const r=await env.DB.prepare("SELECT * FROM clan_trades WHERE clan_id=?1 AND (player_a=?2 OR player_b=?2) AND ((status='active' AND expires_at>?3) OR (status='completed' AND completed_at>?4)) ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,updated_at DESC LIMIT 1").bind(cid,id,now,now-TRADE_DONE_VISIBLE_MS).first();
  if(!r)return null;
  const mineA=String(r.player_a)===String(id),otherId=mineA?String(r.player_b):String(r.player_a);
  const pr=await env.DB.prepare('SELECT nickname,telegram_first_name,telegram_username FROM players WHERE telegram_id=?1').bind(otherId).first();
  const a=sj(r.offer_a_json||'{}',{items:[],gold:0,ppa:0}),b=sj(r.offer_b_json||'{}',{items:[],gold:0,ppa:0});
  const mine=mineA?a:b,other=mineA?b:a,mc=mineA?!!r.confirmed_a:!!r.confirmed_b,oc=mineA?!!r.confirmed_b:!!r.confirmed_a;
  return{id:String(r.id),tradeId:String(r.id),status:String(r.status),partnerId:otherId,targetId:otherId,otherId,partnerName:nm(pr&&pr.nickname||pr&&pr.telegram_first_name||pr&&pr.telegram_username||('ID '+otherId),24),myOffer:mine,mine,otherOffer:other,theirs:other,myConfirmed:mc,selfConfirmed:mc,otherConfirmed:oc,partnerConfirmed:oc,canExecute:String(r.status)==='active'&&mc&&oc,createdAt:Number(r.created_at)||0,updatedAt:Number(r.updated_at)||0,expiresAt:Number(r.expires_at)||0,completedAt:Number(r.completed_at)||0};
}
async function trExecute(env,cid,id,tradeId){
  const tr=await trActive(env,cid,id,tradeId);if(!tr)throw Object.assign(new Error('Активный обмен не найден.'),{status:409});
  if(!tr.confirmed_a||!tr.confirmed_b)throw Object.assign(new Error('Оба игрока должны подтвердить предложение.'),{status:409});
  const sa=await saveRow(env,String(tr.player_a)),sb=await saveRow(env,String(tr.player_b));if(!sa||!sb)throw Object.assign(new Error('Облачный сейв одного из игроков не найден.'),{status:409});
  if(!act(sa.state)||!act(sb.state))throw Object.assign(new Error('Обмен доступен только активированным аккаунтам.'),{status:403});
  const aState=trClone(sa.state),bState=trClone(sb.state);
  const oa=sj(tr.offer_a_json||'{}',{items:[],gold:0,ppa:0}),ob=sj(tr.offer_b_json||'{}',{items:[],gold:0,ppa:0});
  const ba=trExtract(aState,oa),bb=trExtract(bState,ob);trReceive(aState,bb);trReceive(bState,ba);
  const rawA=JSON.stringify(aState),rawB=JSON.stringify(bState);
  if(enc.encode(rawA).byteLength>1_800_000||enc.encode(rawB).byteLength>1_800_000)throw Object.assign(new Error('Сейв после обмена слишком большой.'),{status:413});
  const now=Date.now(),va=Number(sa.row.version)||0,vb=Number(sb.row.version)||0,gid='tg_'+crypto.randomUUID();
  try{
    await env.DB.batch([
      env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5').bind(va+1,rawA,now,String(tr.player_a),va),
      env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5').bind(vb+1,rawB,now,String(tr.player_b),vb),
      env.DB.prepare("UPDATE clan_trades SET status='completed',completed_at=?1,updated_at=?1 WHERE id=?2 AND status='active' AND confirmed_a=1 AND confirmed_b=1").bind(now,String(tr.id)),
      env.DB.prepare("INSERT INTO clan_trade_guard(id,ok) VALUES(?1,CASE WHEN EXISTS(SELECT 1 FROM saves WHERE telegram_id=?2 AND version=?3) AND EXISTS(SELECT 1 FROM saves WHERE telegram_id=?4 AND version=?5) AND EXISTS(SELECT 1 FROM clan_trades WHERE id=?6 AND status='completed' AND completed_at=?7) THEN 1 ELSE 0 END)").bind(gid,String(tr.player_a),va+1,String(tr.player_b),vb+1,String(tr.id),now),
      env.DB.prepare('DELETE FROM clan_trade_guard WHERE id=?1').bind(gid)
    ]);
  }catch(e){throw Object.assign(new Error('Состояние одного из игроков изменилось. Обнови обмен и подтверди ещё раз.'),{status:409})}
  return{tradeId:String(tr.id),completedAt:now};
}

async function state(env,id,p,includeDirectory=false){const m=await mem(env,id),name=nm((p&&p.nickname)||(p&&p.telegram_first_name)||('ID '+id));const base={connected:true,clan:null,self:{id,name,role:''},members:[],permissions:{},applications:[],authority:{},storageUnlocked:false,storage:{used:0,max:500,items:[]},history:[],events:[],bosses:[],wars:[],tradeSession:null,tradeEligible:false,clanProgress:progUi(prog0(),id),siegeReward:{}};const s=await saveRow(env,id);base.tradeEligible=act(s&&s.state);if(includeDirectory){const d=await clanDirectory(env,id);base.clanDirectory=d;base.clanRanking=d.slice();}if(!m)return base;const c=await env.DB.prepare('SELECT * FROM clans WHERE id=?1').bind(m.clan_id).first();if(!c)return base;const rows=await env.DB.prepare(`SELECT cm.telegram_id,cm.role,cm.joined_at,p.nickname,p.telegram_first_name,p.telegram_username,s.state_json FROM clan_members cm LEFT JOIN players p ON p.telegram_id=cm.telegram_id LEFT JOIN saves s ON s.telegram_id=cm.telegram_id WHERE cm.clan_id=?1 ORDER BY cm.joined_at`).bind(c.id).all(),meta=parseMeta(await metaRow(env,c.id));const members=(rows.results||[]).map(x=>{const activated=act(sj(x.state_json||'{}',{}));return{id:String(x.telegram_id),name:nm(x.nickname||x.telegram_first_name||x.telegram_username||('ID '+x.telegram_id)),role:x.role==='leader'?'Глава':'Участник',joinedAt:Number(x.joined_at)||0,tradeEligible:activated,activated,contribution:Number(meta.progress.personalByMember&&meta.progress.personalByMember[x.telegram_id])||0}});base.clan={id:c.id,name:c.name,leaderId:String(c.leader_id),ownerId:String(c.leader_id),createdAt:Number(c.created_at)||0};base.members=members;base.self=members.find(x=>x.id===id)||base.self;base.permissions=meta.permissions;base.applications=meta.applications;base.authority=meta.authority;base.storageUnlocked=!!c.storage_unlocked;base.storage={used:meta.storage.length,max:500,items:meta.storage};base.history=meta.history;base.events=meta.events;base.clanProgress=progUi(meta.progress,id);base.siegeReward=meta.siegeReward;base.tradeSession=await trView(env,c.id,id);return base}
function ev(meta,type,id,name,text){meta.events.unshift({id:'ce_'+crypto.randomUUID(),type,playerId:id,playerName:name,text,ts:Date.now()});meta.events=meta.events.slice(0,300)}
async function action(env,id,p,b){const a=String(b.action||''),pname=nm((p&&p.nickname)||(p&&p.telegram_first_name)||'Игрок');
 if(a==='create'){const name=nm(b.name);if(name.length<3)return jr({ok:false,message:'Название минимум 3 символа'},400);if(!p||!p.nickname)return jr({ok:false,message:'Сначала закрепи ник персонажа.'},409);if(await mem(env,id))return jr({ok:false,message:'Ты уже состоишь в клане.'},409);const s=await saveRow(env,id),blocked=Number(s&&s.state&&s.state.clanJoinBlockedUntil)||0;if(blocked>Date.now())return jr({ok:false,message:'После выхода новый клан будет доступен через 24 часа.'},409);if(await env.DB.prepare('SELECT id FROM clans WHERE name_key=?1').bind(nk(name)).first())return jr({ok:false,message:'Такое название уже занято.'},409);const cid='clan_'+crypto.randomUUID(),now=Date.now();await env.DB.prepare('INSERT INTO clans(id,name,name_key,leader_id,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)').bind(cid,name,nk(name),id,now).run();await env.DB.prepare("INSERT INTO clan_members(clan_id,telegram_id,role,joined_at) VALUES(?1,?2,'leader',?3)").bind(cid,id,now).run();const mr=await metaRow(env,cid),mm=parseMeta(mr);ev(mm,'createClan',id,pname,'Создан клан «'+name+'»');await writeMeta(env,cid,mm);await clearPendingApplications(env,id,cid);return jr({ok:true,state:await state(env,id,p,true),message:'Клан «'+name+'» создан.'})}
 if(a==='leaveClan'){const {m,c}=await reqClan(env,id),cnt=await env.DB.prepare('SELECT COUNT(*) AS n FROM clan_members WHERE clan_id=?1').bind(c.id).first(),n=Number(cnt&&cnt.n)||0;if(m.role==='leader'&&n>1)return jr({ok:false,message:'Сначала передай права главы.'},409);await env.DB.prepare('DELETE FROM clan_members WHERE telegram_id=?1').bind(id).run();if(n<=1){await env.DB.prepare('DELETE FROM clan_meta WHERE clan_id=?1').bind(c.id).run();await env.DB.prepare('DELETE FROM clans WHERE id=?1').bind(c.id).run()}return jr({ok:true,state:await state(env,id,p,true),message:'Ты вышел из клана.'})}
 if(a==='apply'){
   if(await mem(env,id))return jr({ok:false,message:'Ты уже состоишь в клане.'},409);
   const q=nk(b.name||b.query),c=await env.DB.prepare('SELECT * FROM clans WHERE name_key=?1').bind(q).first();
   if(!c)return jr({ok:false,message:'Клан не найден.'},404);
   const mm=parseMeta(await metaRow(env,c.id));
   if(mm.applications.some(x=>String(x.telegramId)===id))return jr({ok:true,state:await state(env,id,p,true),message:'Заявка уже отправлена.'});
   const d=await clanDirectory(env,id),pending=d.filter(x=>x.applied).length;
   if(pending>=5)return jr({ok:false,message:'Можно держать не больше 5 активных заявок.'},409);
   mm.applications.push({id:'app_'+crypto.randomUUID(),telegramId:id,name:pname,createdAt:Date.now()});
   await writeMeta(env,c.id,mm);
   return jr({ok:true,state:await state(env,id,p,true),message:'Заявка в «'+c.name+'» отправлена.'})
 }
 const {m,c}=await reqClan(env,id),meta=parseMeta(await metaRow(env,c.id));
 if(a==='setPermissions'){if(!can(m,meta,'manageStorageRights'))return jr({ok:false,message:'Нет права менять склад.'},403);const target=String(b.memberId||''),pp=b.permissions&&typeof b.permissions==='object'?b.permissions:{};meta.permissions[target]={canDeposit:!!pp.canDeposit,withdrawMode:['none','all','selected'].includes(pp.withdrawMode)?pp.withdrawMode:'none',allowed:pp.allowed&&typeof pp.allowed==='object'?pp.allowed:{}};await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),message:'Права склада сохранены.'})}
 if(a==='setAuthority'){if(m.role!=='leader')return jr({ok:false,message:'Права назначает только глава.'},403);const t=String(b.memberId||'');if(!t||t===id)return jr({ok:false,message:'Игрок не найден.'},400);const aa=b.authority&&typeof b.authority==='object'?b.authority:{};meta.authority[t]={acceptMembers:!!aa.acceptMembers,viewClanHistory:!!aa.viewClanHistory,manageStorageRights:!!aa.manageStorageRights,manageMembers:!!aa.manageMembers};await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),message:'Права участника сохранены.'})}
 if(a==='transferLeadership'){if(m.role!=='leader')return jr({ok:false,message:'Передать главу может только глава.'},403);const t=String(b.memberId||''),tm=await env.DB.prepare('SELECT telegram_id FROM clan_members WHERE clan_id=?1 AND telegram_id=?2').bind(c.id,t).first();if(!tm)return jr({ok:false,message:'Игрок не найден.'},404);await env.DB.prepare("UPDATE clan_members SET role='member' WHERE clan_id=?1 AND telegram_id=?2").bind(c.id,id).run();await env.DB.prepare("UPDATE clan_members SET role='leader' WHERE clan_id=?1 AND telegram_id=?2").bind(c.id,t).run();await env.DB.prepare('UPDATE clans SET leader_id=?1,updated_at=?2 WHERE id=?3').bind(t,Date.now(),c.id).run();delete meta.authority[t];await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),message:'Права главы переданы.'})}
 if(a==='acceptApplication'){if(!can(m,meta,'acceptMembers'))return jr({ok:false,message:'Нет права принимать игроков.'},403);const i=meta.applications.findIndex(x=>String(x.id)===String(b.applicationId||b.appId));if(i<0)return jr({ok:false,message:'Заявка не найдена.'},404);const ap=meta.applications.splice(i,1)[0];if(await mem(env,String(ap.telegramId)))return jr({ok:false,message:'Игрок уже состоит в клане.'},409);await env.DB.prepare("INSERT INTO clan_members(clan_id,telegram_id,role,joined_at) VALUES(?1,?2,'member',?3)").bind(c.id,String(ap.telegramId),Date.now()).run();await writeMeta(env,c.id,meta);await clearPendingApplications(env,String(ap.telegramId),c.id);return jr({ok:true,state:await state(env,id,p,true),message:'Игрок принят.'})}
 if(a==='rejectApplication'){if(!can(m,meta,'acceptMembers'))return jr({ok:false,message:'Нет права отклонять заявки.'},403);meta.applications=meta.applications.filter(x=>String(x.id)!==String(b.applicationId||b.appId));await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),message:'Заявка отклонена.'})}
 if(a==='kickMember'){if(!can(m,meta,'manageMembers'))return jr({ok:false,message:'Нет права исключать участников.'},403);const t=String(b.memberId||'');if(t===String(c.leader_id))return jr({ok:false,message:'Главу нельзя исключить.'},409);await env.DB.prepare('DELETE FROM clan_members WHERE clan_id=?1 AND telegram_id=?2').bind(c.id,t).run();delete meta.permissions[t];delete meta.authority[t];await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),message:'Игрок исключён.'})}
 if(a==='unlockStorage'){if(m.role!=='leader')return jr({ok:false,message:'Склад открывает только глава.'},403);if(c.storage_unlocked)return jr({ok:true,state:await state(env,id,p),message:'Склад уже открыт.'});const s=await saveRow(env,id),gold=Math.max(0,Number(s&&s.state&&s.state.gold)||0);if(!s||gold<1000000)return jr({ok:false,message:'Нужно 1 000 000 Gold.'},409);s.state.gold=gold-1000000;await writeSave(env,id,s);await env.DB.prepare('UPDATE clans SET storage_unlocked=1,updated_at=?1 WHERE id=?2').bind(Date.now(),c.id).run();ev(meta,'unlockStorage',id,pname,'Клановый склад открыт');await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),balances:{gold:s.state.gold},message:'Клановый склад открыт.'})}
 if(a==='history'){const e=b.entry&&typeof b.entry==='object'?b.entry:null;if(e){meta.history.unshift(Object.assign({},e,{playerId:id,playerName:pname,ts:Number(e.ts)||Date.now()}));meta.history=meta.history.slice(0,500);await writeMeta(env,c.id,meta)}return jr({ok:true,state:await state(env,id,p)})}
 if(a==='put'){if(!c.storage_unlocked)return jr({ok:false,message:'Склад не открыт.'},409);const pp=meta.permissions[id]||{};if(m.role!=='leader'&&!pp.canDeposit)return jr({ok:false,message:'Нет права класть вещи.'},403);const it=b.item&&typeof b.item==='object'?b.item:null;if(!it)return jr({ok:false,message:'Предмет не найден.'},400);if(meta.storage.length>=500)return jr({ok:false,message:'Склад заполнен.'},409);meta.storage.push(it);await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),message:'Предмет сохранён на сервере.'})}
 if(a==='take'){if(!c.storage_unlocked)return jr({ok:false,message:'Склад не открыт.'},409);const it=b.item&&typeof b.item==='object'?b.item:null,pp=meta.permissions[id]||{},allow=pp.allowed||{};if(m.role!=='leader'&&pp.withdrawMode!=='all'&&!(pp.withdrawMode==='selected'&&it&&Number(allow[it.uid]||0)>0))return jr({ok:false,message:'Нет права брать эту вещь.'},403);const i=meta.storage.findIndex(x=>it&&((it.uid&&x.uid===it.uid)||(!it.uid&&x.name===it.name)));if(i<0)return jr({ok:false,message:'Предмет уже забран.'},409);meta.storage.splice(i,1);await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),message:'Предмет выдан.'})}
 if(a==='upgradeBonus'){if(m.role!=='leader')return jr({ok:false,message:'Бонусы распределяет только глава.'},403);const k=String(b.bonusKey||''),keys=['mobDamage','bossDamage','hp','mp','xp','gold'];if(!keys.includes(k))return jr({ok:false,message:'Неизвестный бонус.'},400);const pu=progUi(meta.progress);if(pu.freePoints<=0)return jr({ok:false,message:'Нет свободных очков клана.'},409);meta.progress.bonuses=Object.assign(prog0().bonuses,meta.progress.bonuses||{});if((Number(meta.progress.bonuses[k])||0)>=3)return jr({ok:false,message:'Бонус уже максимальный.'},409);meta.progress.bonuses[k]=(Number(meta.progress.bonuses[k])||0)+1;await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),message:'Клановый бонус улучшен.'})}
 if(a==='castleCaptured'){meta.siegeReward=Object.assign({clanKey:c.id,clanName:c.name,capturedAt:Date.now(),expiresAt:Date.now()+3*24*3600000,xpPct:5,goldPct:5,resourcePct:5,movePct:3},b.reward||{});await writeMeta(env,c.id,meta);return jr({ok:true,state:await state(env,id,p),message:'Награда осады сохранена.'})}
 if(a==='startRaid')return jr({ok:false,code:'REALTIME_REQUIRED',message:'Клановый босс запускается через realtime.'},409)
 if(a==='requestTrade'){
   const target=String(b.memberId||b.targetId||b.partnerId||b.toId||'');
   if(!target||target===id)return jr({ok:false,message:'Выбери другого участника клана.'},400);
   const tm=await env.DB.prepare('SELECT telegram_id FROM clan_members WHERE clan_id=?1 AND telegram_id=?2').bind(c.id,target).first();if(!tm)return jr({ok:false,message:'Игрок уже не состоит в твоём клане.'},409);
   const ss=await saveRow(env,id),ts=await saveRow(env,target);if(!act(ss&&ss.state)||!act(ts&&ts.state))return jr({ok:false,message:'Клановый обмен доступен только активированным аккаунтам.'},403);
   const now=Date.now();await env.DB.prepare("UPDATE clan_trades SET status='expired',updated_at=?1 WHERE status='active' AND expires_at<=?1").bind(now).run();
   const busy=await env.DB.prepare("SELECT * FROM clan_trades WHERE clan_id=?1 AND status='active' AND expires_at>?2 AND (player_a IN (?3,?4) OR player_b IN (?3,?4)) ORDER BY updated_at DESC LIMIT 1").bind(c.id,now,id,target).first();
   if(busy){
     if((String(busy.player_a)===id&&String(busy.player_b)===target)||(String(busy.player_a)===target&&String(busy.player_b)===id))return jr({ok:true,state:await state(env,id,p),message:'Обмен уже открыт.'});
     return jr({ok:false,message:'Один из игроков уже участвует в другом обмене.'},409);
   }
   const tid='trade_'+crypto.randomUUID();await env.DB.prepare("INSERT INTO clan_trades(id,clan_id,player_a,player_b,created_at,updated_at,expires_at,status) VALUES(?1,?2,?3,?4,?5,?5,?6,'active')").bind(tid,c.id,id,target,now,now+TRADE_TTL_MS).run();
   return jr({ok:true,state:await state(env,id,p),tradeId:tid,message:'Клановый обмен открыт. Оба предложения должны быть подтверждены.'});
 }
 if(a==='setOffer'){
   const tr=await trActive(env,c.id,id,b.tradeId||b.id);if(!tr)return jr({ok:false,message:'Активный обмен не найден.'},409);
   const s=await saveRow(env,id);if(!s)return jr({ok:false,message:'Облачный сейв не найден.'},409);
   const raw=b.offer&&typeof b.offer==='object'?b.offer:{items:Array.isArray(b.items)?b.items:(b.item?[b.item]:[]),gold:b.gold,ppa:b.ppa};
   let offer;try{offer=trNormalizeOffer(s.state,raw)}catch(e){return jr({ok:false,message:String(e.message||e)},Number(e.status)||409)}
   const mineA=String(tr.player_a)===id,now=Date.now();
   if(mineA)await env.DB.prepare("UPDATE clan_trades SET offer_a_json=?1,confirmed_a=0,confirmed_b=0,updated_at=?2,expires_at=?3 WHERE id=?4 AND status='active'").bind(JSON.stringify(offer),now,now+TRADE_TTL_MS,String(tr.id)).run();
   else await env.DB.prepare("UPDATE clan_trades SET offer_b_json=?1,confirmed_a=0,confirmed_b=0,updated_at=?2,expires_at=?3 WHERE id=?4 AND status='active'").bind(JSON.stringify(offer),now,now+TRADE_TTL_MS,String(tr.id)).run();
   return jr({ok:true,state:await state(env,id,p),message:'Предложение обновлено. Подтверждения сброшены.'});
 }
 if(a==='confirm'){
   const tr=await trActive(env,c.id,id,b.tradeId||b.id);if(!tr)return jr({ok:false,message:'Активный обмен не найден.'},409);
   const mineA=String(tr.player_a)===id,now=Date.now();
   if(mineA)await env.DB.prepare("UPDATE clan_trades SET confirmed_a=1,updated_at=?1,expires_at=?2 WHERE id=?3 AND status='active'").bind(now,now+TRADE_TTL_MS,String(tr.id)).run();
   else await env.DB.prepare("UPDATE clan_trades SET confirmed_b=1,updated_at=?1,expires_at=?2 WHERE id=?3 AND status='active'").bind(now,now+TRADE_TTL_MS,String(tr.id)).run();
   return jr({ok:true,state:await state(env,id,p),message:'Предложение подтверждено.'});
 }
 if(a==='execute'){
   try{
     const done=await trExecute(env,c.id,id,b.tradeId||b.id);
     const pa=await env.DB.prepare('SELECT nickname,telegram_first_name FROM players WHERE telegram_id=?1').bind(id).first();
     const tr=await env.DB.prepare('SELECT player_a,player_b FROM clan_trades WHERE id=?1').bind(done.tradeId).first(),other=String(tr&&tr.player_a)===id?String(tr.player_b):String(tr.player_a);
     const po=await env.DB.prepare('SELECT nickname,telegram_first_name FROM players WHERE telegram_id=?1').bind(other).first();
     ev(meta,'trade',id,pname,'Обмен завершён: '+nm(pa&&pa.nickname||pa&&pa.telegram_first_name||pname)+' ↔ '+nm(po&&po.nickname||po&&po.telegram_first_name||'Игрок'));await writeMeta(env,c.id,meta);
     return jr({ok:true,state:await state(env,id,p),tradeCompleted:true,tradeId:done.tradeId,reload:true,message:'Обмен завершён сервером. Предметы и валюты переданы.'});
   }catch(e){return jr({ok:false,message:String(e.message||e)},Number(e.status)||409)}
 }
 if(a==='cancel'){
   const tr=await trActive(env,c.id,id,b.tradeId||b.id);if(!tr)return jr({ok:true,state:await state(env,id,p),message:'Активного обмена уже нет.'});
   await env.DB.prepare("UPDATE clan_trades SET status='cancelled',updated_at=?1 WHERE id=?2 AND status='active'").bind(Date.now(),String(tr.id)).run();
   return jr({ok:true,state:await state(env,id,p),message:'Обмен отменён.'});
 }
 if(a==='playerDeath')return jr({ok:true,state:await state(env,id,p),message:'Состояние игрока принято.'});
 return jr({ok:false,message:'Клановое действие не поддерживается.'},400)}

export async function handleClanOnline(request,env){const u=new URL(request.url);if(!u.pathname.startsWith('/api/clan/'))return null;if(request.method!=='POST')return jr({ok:false,message:'POST required'},405);try{let b={};try{b=await request.json()}catch(_){}const user=await auth(b.initData||request.headers.get('x-telegram-init-data')||'',env.BOT_TOKEN);await schema(env);const p=await ensurePlayer(env,user),id=String(user.id);if(u.pathname==='/api/clan/state')return jr({ok:true,state:await state(env,id,p,true)});if(u.pathname==='/api/clan/action')return action(env,id,p,b);return jr({ok:false,message:'Clan route not found'},404)}catch(e){const s=Number(e&&e.status)||500;console.error('PPA clan online',e);return jr({ok:false,message:String((e&&e.message)||'Clan server error')},s)}}
