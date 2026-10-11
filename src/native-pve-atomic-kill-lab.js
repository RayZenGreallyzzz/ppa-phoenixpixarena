// PPA shared PvE: ISOLATED kill + save CAS transaction lab.
// NOT imported by Worker/realtime. Not the production kill handler or a reward
// API. A synthetic marker is test provenance, NOT authentication or authority.
// Never call this with client packets or write the resulting plan to live D1.
const ROOM=/^dungeon-(?:1-20|21-40|41-60)-i[1-9][0-9]{0,5}$/;
const KEY=/^(?:s(?:0|[1-9][0-9]{0,3})|p20|b40|b60)$/;
const OWNER=/^\d{1,24}$/;
const REQUEST=/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const UID=/^[A-Za-z0-9][A-Za-z0-9:_-]{5,127}$/;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const uint=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const only=(o,keys)=>Object.keys(o).every(k=>keys.includes(k));
const deny=code=>Object.freeze({ok:false,code});
const PROOF_KEYS=['origin','room','key','spawnGeneration','ownerId','requestId',
  'expectedVersion','save','reward','now'];
const REWARD_KEYS=['xp','gold','item'];
const ITEM_KEYS=['uid','name','kind'];
const MAX_XP=1_000_000;
const MAX_GOLD=1_000_000;

export const NATIVE_PVE_KILL_LAB_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS ppa_native_pve_lab_kills (
    room TEXT NOT NULL, mob_key TEXT NOT NULL, spawn_generation INTEGER NOT NULL,
    owner_id TEXT NOT NULL, request_id TEXT NOT NULL,
    reward_json TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY(room,mob_key,spawn_generation),
    UNIQUE(owner_id,request_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ppa_native_pve_lab_guard (
    id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1)
  )`
];

// Returns SQL for one SQLite/D1-style atomic batch, but never executes it.
// In the test harness, all SQL runs in ONE transaction; a unique-kill conflict
// or failed versioned save CAS rolls back the kill claim and ALL rewards.
// Current Telegram kill/gold/XP semantics are NOT migrated to this prototype.
export function prepareSyntheticPveKill(proof) {
  if(!isObject(proof)||!only(proof,PROOF_KEYS)||
     proof.origin!=='synthetic-server-kill-only'||!ROOM.test(proof.room||'')||
     !KEY.test(proof.key||'')||!uint(proof.spawnGeneration)||proof.spawnGeneration<1||
     !OWNER.test(proof.ownerId||'')||!REQUEST.test(proof.requestId||'')||
     !uint(proof.expectedVersion)||proof.expectedVersion<1||
     !uint(proof.now)||!isObject(proof.save)||!isObject(proof.reward)||
     !only(proof.reward,REWARD_KEYS)||!uint(proof.reward.xp,MAX_XP)||
     !uint(proof.reward.gold,MAX_GOLD))
     return deny('UNVERIFIED_SYNTHETIC_KILL');

  const source=proof.save;
  if(!uint(source.xp,1e12)||!uint(source.gold,1e12)||
     !Array.isArray(source.bag)||source.bag.length>99||
     source.xp+proof.reward.xp>1e12||
     source.gold+proof.reward.gold>1e12)
     return deny('SYNTHETIC_SAVE_NOT_READY');

  let item=null;
  if(proof.reward.item!=null) {
    if(!isObject(proof.reward.item)||!only(proof.reward.item,ITEM_KEYS)||
       !UID.test(proof.reward.item.uid||'')||
       typeof proof.reward.item.name!=='string'||
       proof.reward.item.name.length<1||proof.reward.item.name.length>80||
       proof.reward.item.kind!=='synthetic-loot'||
       source.bag.some(x=>x&&x.uid===proof.reward.item.uid))
      return deny('SYNTHETIC_LOOT_INVALID_OR_DUPLICATE');
    item={uid:proof.reward.item.uid,name:proof.reward.item.name,kind:'synthetic-loot'};
  }

  const next=structuredClone(source);
  next.xp+=proof.reward.xp;
  next.gold+=proof.reward.gold;
  if(item)next.bag.push(item);

  const oldJson=JSON.stringify(source),nextJson=JSON.stringify(next);
  if(oldJson.length>1_000_000||nextJson.length>1_000_000)
    return deny('SAVE_TOO_LARGE');
  const rewardJson=JSON.stringify({xp:proof.reward.xp,gold:proof.reward.gold,
    itemUid:item?.uid||null});
  const guardId=`${proof.ownerId}|${proof.requestId}`;

  return {
    ok:true,code:'SYNTHETIC_TRANSACTION_PLAN_ONLY',
    readOnly:true,canAttack:false,canReceiveRewards:false,
    receipt:Object.freeze({room:proof.room,key:proof.key,
      spawnGeneration:proof.spawnGeneration,ownerId:proof.ownerId,
      requestId:proof.requestId,rewardJson}),
    statements:[
      {sql:`INSERT INTO ppa_native_pve_lab_kills
        (room,mob_key,spawn_generation,owner_id,request_id,reward_json,created_at)
        VALUES(?1,?2,?3,?4,?5,?6,?7)`,
        params:[proof.room,proof.key,proof.spawnGeneration,
          proof.ownerId,proof.requestId,rewardJson,proof.now]},
      {sql:`UPDATE saves SET version=?1,state_json=?2,updated_at=?3
        WHERE telegram_id=?4 AND version=?5 AND state_json=?6`,
        params:[proof.expectedVersion+1,nextJson,proof.now,
          proof.ownerId,proof.expectedVersion,oldJson]},
      {sql:`INSERT INTO ppa_native_pve_lab_guard(id,ok)
        VALUES(?1,CASE WHEN changes()=1 THEN 1 ELSE 0 END)`,
        params:[guardId]},
      {sql:'DELETE FROM ppa_native_pve_lab_guard WHERE id=?1',
        params:[guardId]}
    ]
  };
}
