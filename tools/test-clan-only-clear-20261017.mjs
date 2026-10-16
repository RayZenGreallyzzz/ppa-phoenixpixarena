import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const src=fs.readFileSync('src/clan-online.js','utf8').replace('export async function handleClanOnline','async function handleClanOnline');
const cx=vm.createContext({crypto:webcrypto,TextEncoder,URLSearchParams,Response,console,setTimeout});
vm.runInContext(src,cx);
vm.runInContext("reqClan=async function(env,id){return {m:{role:env.DB.role},c:{id:env.DB.clan_id,leader_id:env.DB.leader_id}}};metaRow=async function(env,cid){return env.DB.items[cid]};state=async function(env,id){return {connected:true,storage:{used:JSON.parse(env.DB.items[env.DB.clan_id].storage_json).length,items:JSON.parse(env.DB.items[env.DB.clan_id].storage_json)}}}",cx);
const action=vm.runInContext('action',cx),writeMeta=vm.runInContext('writeMeta',cx);
const original=[{uid:'a',name:'Pet',rarity:'epic'},{uid:'b',name:'Bank',count:4},{uid:'c',name:'Resource',count:99}];
const initial=JSON.stringify(original);
const items={
  alpha:{clan_id:'alpha',storage_json:initial,updated_at:123,permissions_json:'{}',authority_json:'{}',applications_json:'[]',history_json:'[]',events_json:'[]',progress_json:'{}',siege_reward_json:'{}'},
  beta:{clan_id:'beta',storage_json:JSON.stringify([{uid:'other-clan',name:'Protected'}]),updated_at:124,permissions_json:'{}',authority_json:'{}',applications_json:'[]',history_json:'[]',events_json:'[]',progress_json:'{}',siege_reward_json:'{}'}
};
const db={role:'leader',clan_id:'alpha',leader_id:'777',items,backups:[],players:{'777':{bag:[{uid:'personal'}],storage:{personal:[{uid:'one'}],premium:[{uid:'premium'}],clan:original}}},prepare(sql){return {bind(...p){return {sql,p,async run(){
if(sql.startsWith('UPDATE clan_meta SET permissions_json')){
  const row=items[p[8]];
  Object.assign(row,{permissions_json:p[0],authority_json:p[1],applications_json:p[2],history_json:p[3],events_json:p[4],progress_json:p[5],siege_reward_json:p[6],updated_at:p[7]});
  return {meta:{changes:1}};
}throw Error('unexpected run '+sql);
}}}}},async batch(stmts){
  const [backup,clear]=stmts;if(stmts.length!==2||!backup.sql.includes('INSERT INTO clan_storage_reset_backups')||!clear.sql.includes('UPDATE clan_meta SET storage_json'))throw Error('unexpected transaction');
  const [backupId,actor,time,cid,expected]=backup.p;
  const src=items[cid];
  if(!src||src.storage_json!==expected)return [{meta:{changes:0}},{meta:{changes:0}}];
  const b={id:backupId,clan_id:cid,actor_id:actor,storage_json:src.storage_json,created_at:time};
  this.backups.push(b);
  if(src.storage_json===clear.p[2]){src.storage_json='[]';src.updated_at=clear.p[0];return [{meta:{changes:1}},{meta:{changes:1}}]}
  return [{meta:{changes:1}},{meta:{changes:0}}];
}};
async function request(id,body){const r=await action({DB:db},id,{nickname:'Глава'},body);return{status:r.status,data:await r.json()}}
const saveBefore=JSON.stringify(db.players);
let r=await request('777',{action:'put',item:original[0]});
assert.equal(r.status,423,'clan deposit must be locked');
r=await request('777',{action:'take',item:original[0]});
assert.equal(r.status,423,'clan withdrawal must be locked');
assert.equal(db.backups.length,0,'blocked requests cannot mutate');
r=await request('777',{action:'clearStorage'});
assert.equal(r.status,400,'missing explicit confirmation');
db.role='member';
r=await request('777',{action:'clearStorage',confirm:'CLEAR_CLAN_STORAGE_ALL'});
assert.equal(r.status,403,'member cannot clear warehouse');
db.role='leader';db.leader_id='other-id';
r=await request('777',{action:'clearStorage',confirm:'CLEAR_CLAN_STORAGE_ALL'});
assert.equal(r.status,403,'not the actual leader');
db.leader_id='777';
r=await request('777',{action:'clearStorage',confirm:'CLEAR_CLAN_STORAGE_ALL'});
assert.equal(r.status,200);assert.equal(r.data.ok,true);assert.equal(r.data.clearedCount,3);
assert.equal(items.alpha.storage_json,'[]','warehouse is empty');
assert.equal(db.backups.length,1,'backup saved');
assert.equal(db.backups[0].storage_json,initial,'backup retained byte-identical full item payload');
assert.equal(JSON.parse(items.beta.storage_json).length,1,'different clan untouched');
assert.equal(JSON.stringify(db.players),saveBefore,'personal bag / premium / resources unchanged');
r=await request('777',{action:'clearStorage',confirm:'CLEAR_CLAN_STORAGE_ALL'});
assert.equal(r.data.alreadyEmpty,true);assert.equal(db.backups.length,1,'repeat clear harmless');
await writeMeta({DB:db},'alpha',{history:[{id:'history'}]});
assert.equal(items.alpha.storage_json,'[]','clan metadata update cannot resurrect warehouse');
const html=fs.readFileSync('public/index.html','utf8');
assert.ok(html.includes("if(mode==='clan'){try{showPickup('Клановый склад временно только для просмотра'"),'both NPC moves locked before local splice');
assert.ok(html.includes('clanClearStorage'),'leader reset button and route present');
assert.ok(html.includes('ПОДТВЕРДИТЬ ОЧИСТКУ ВСЕГО СКЛАДА'),'two-tap confirmation present');
assert.ok(!html.includes('clanStorageSyncRuntime();saveGame();sendStorageState();sendClanState();'),'clan refresh must not upload stale personal save');
console.log('PASS: leader-only warehouse reset; atomic full backup; other clan intact; personal/premium/resources intact; both menus readonly.');
