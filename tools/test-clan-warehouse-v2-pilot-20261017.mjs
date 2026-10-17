import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const src=fs.readFileSync('src/clan-online.js','utf8').replace('export async function handleClanOnline','async function handleClanOnline');
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,URLSearchParams,Response,console,setTimeout});
vm.runInContext(src,ctx);
vm.runInContext([
"reqClan=async function(env,id){return{m:{role:env.DB.role},c:{id:env.DB.clan_id,leader_id:env.DB.leaderId,storage_unlocked:1}}};",
"metaRow=async function(env,cid){return {clan_id:cid,storage_json:JSON.stringify(env.DB.items),history_json:'[]',permissions_json:'{}'}};",
"state=async function(env,id){return {warehouseV2Pilot:!!env.DB.enabled,storage:{used:env.DB.items.length}}};",
"mem=async function(env,id){return {clan_id:env.DB.clan_id,role:env.DB.role}};"
].join('\n'),ctx);
const action=vm.runInContext('action',ctx);
function mock(){let db={role:'leader',clan_id:'alpha',leaderId:'777',enabled:false,items:[],prepare(sql){return{bind(...args){return{async first(){
 if(sql.startsWith('SELECT id,leader_id FROM clans'))return{id:'alpha',leader_id:db.leaderId};
 if(sql.startsWith('SELECT enabled,leader_id FROM clan_warehouse_pilot_v2'))return db.enabled?{enabled:1,leader_id:db.leaderId}:null;
 throw Error('unexpected SELECT '+sql);
},async run(){
 if(sql.startsWith('INSERT INTO clan_warehouse_pilot_v2')){db.enabled=args[2]===1;return{meta:{changes:1}}}
 throw Error('unexpected RUN '+sql);
}}}}}};return db}
async function invoke(db,body){const r=await action({DB:db},'777',{nickname:'Leader'},body);return{status:r.status,data:await r.json()}}
let db=mock();
let r=await invoke(db,{action:'put',requestId:'w2_testnonce_00000001',item:{name:'No source'}});
assert.equal(r.status,423,'pilot disabled even for valid V2 request');
assert.equal(db.enabled,false);
r=await invoke(db,{action:'warehousePilot',confirm:'wrong'});
assert.equal(r.status,400,'pilot cannot be enabled by accidental button');
db.role='member';
r=await invoke(db,{action:'warehousePilot',confirm:'ENABLE_CLAN_PILOT_V2'});
assert.equal(r.status,403,'member cannot opt into pilot');
db.role='leader';db.leaderId='other';
r=await invoke(db,{action:'warehousePilot',confirm:'ENABLE_CLAN_PILOT_V2'});
assert.equal(r.status,403,'must match true leader ID');
db.leaderId='777';db.items=[{name:'existing'}];
r=await invoke(db,{action:'warehousePilot',confirm:'ENABLE_CLAN_PILOT_V2'});
assert.equal(r.status,409,'cannot start pilot on loaded clan warehouse');
db.items=[];
r=await invoke(db,{action:'warehousePilot',confirm:'ENABLE_CLAN_PILOT_V2'});
assert.equal(r.status,200);assert.equal(db.enabled,true);
assert.equal(r.data.state.warehouseV2Pilot,true,'toggle immediately echoed');
r=await invoke(db,{action:'warehousePilot',confirm:'DISABLE_CLAN_PILOT_V2'});
assert.equal(r.status,200);assert.equal(db.enabled,false);
assert.equal(r.data.state.warehouseV2Pilot,false);
console.log('PASS: explicit leader-only opt-in, empty-clan requirement, default off, no members and clean opt-out.');
