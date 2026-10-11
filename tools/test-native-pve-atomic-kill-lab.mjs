import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {NATIVE_PVE_KILL_LAB_SCHEMA,prepareSyntheticPveKill}
  from '../src/native-pve-atomic-kill-lab.js';

// SQLite in-memory fixture. NO Cloudflare/D1, no original Telegram player
// data, no live mob, no deposit, and no permission to run damage.
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE saves(telegram_id TEXT PRIMARY KEY,version INTEGER NOT NULL,state_json TEXT NOT NULL,updated_at INTEGER NOT NULL)');
for(const stmt of NATIVE_PVE_KILL_LAB_SCHEMA)sql.exec(stmt);
const original=(owner)=>({xp:100,gold:500,ppa:80,bag:[
  {uid:'existing-plus7-'+owner,kind:'gear',enh:7}
]});
for(const owner of ['11','22']) {
  sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run(owner,10,
    JSON.stringify(original(owner)),0);
}
const row=(owner)=>sql.prepare('SELECT * FROM saves WHERE telegram_id=?').get(owner);
const claim=(room,key,spawn)=>sql.prepare(
 'SELECT * FROM ppa_native_pve_lab_kills WHERE room=? AND mob_key=? AND spawn_generation=?'
).get(room,key,spawn);
const count=()=>sql.prepare('SELECT COUNT(*) AS n FROM ppa_native_pve_lab_kills').get().n;
const src=original('11');
const make=(args={})=>({origin:'synthetic-server-kill-only',
 room:'dungeon-1-20-i1',key:'s0',spawnGeneration:1,ownerId:'11',
 requestId:'kill_12345678',expectedVersion:10,save:src,
 reward:{xp:25,gold:17,item:{uid:'synthetic-drop-00001',
   name:'Synthetic QA loot',kind:'synthetic-loot'}},now:1800000000000,...args});
const commit=(plan)=>{
 assert.equal(plan.ok,true,plan.code);
 sql.exec('BEGIN IMMEDIATE');
 try{
   for(const statement of plan.statements)
     sql.prepare(statement.sql).run(...statement.params);
   sql.exec('COMMIT');
   return {ok:true};
 }catch(e){
   sql.exec('ROLLBACK');
   return {ok:false,error:String(e)};
 }
};
const proof=make(), first=prepareSyntheticPveKill(proof);
assert.equal(first.ok,true);
assert.equal(first.canAttack,false);
assert.equal(first.canReceiveRewards,false);
assert.equal(first.readOnly,true);
const snap=JSON.stringify(proof);
assert.equal(commit(first).ok,true);
assert.equal(JSON.stringify(proof),snap,'synthetic proof was mutated');
assert.equal(row('11').version,11);
let value=JSON.parse(row('11').state_json);
assert.equal(value.xp,125);
assert.equal(value.gold,517);
assert.equal(value.ppa,80);
assert.equal(value.bag.length,2);
assert.equal(value.bag[0].enh,7,'original existing +7 gear downgraded');
assert.equal(value.bag[1].uid,'synthetic-drop-00001');
assert.equal(claim(proof.room,proof.key,1).owner_id,'11');
assert.equal(count(),1);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM ppa_native_pve_lab_guard').get().n,0);

// Exact repeated request: no duplicate credit and no duplicate gear.
const duplicate=commit(first);
assert.equal(duplicate.ok,false);
assert.equal(count(),1);
assert.equal(row('11').version,11);
assert.equal(JSON.parse(row('11').state_json).bag.length,2);

// A second owner cannot kill the same *spawn generation*, even with a
// distinct request ID and valid own save. The claim is UNIQUE per spawn.
const other=prepareSyntheticPveKill(make({
 ownerId:'22',requestId:'kill_22222222',expectedVersion:10,
 save:original('22'),reward:{xp:500,gold:900,item:null}}));
assert.equal(commit(other).ok,false);
assert.equal(row('22').version,10);
assert.equal(JSON.parse(row('22').state_json).xp,100);
assert.equal(count(),1);

// A request ID cannot be recycled to kill another monster/generation.
const sameId=prepareSyntheticPveKill(make({
 key:'s1',spawnGeneration:2,expectedVersion:11,
 save:JSON.parse(row('11').state_json),
 reward:{xp:1,gold:1,item:null}
}));
assert.equal(commit(sameId).ok,false);
assert.equal(count(),1);

// A genuinely fresh spawn can be claimed independently with new request ID.
const next=prepareSyntheticPveKill(make({
 spawnGeneration:2,requestId:'kill_33333333',expectedVersion:11,
 save:JSON.parse(row('11').state_json),
 reward:{xp:2,gold:3,item:null}
}));
assert.equal(commit(next).ok,true);
assert.equal(row('11').version,12);
assert.equal(JSON.parse(row('11').state_json).xp,127);
assert.equal(count(),2);

// Simulate a Telegram save update AFTER reading the snapshot but BEFORE
// the atomic kill+credit transaction: CAS must fail and roll back claim.
const old=JSON.parse(row('22').state_json);
const stale=prepareSyntheticPveKill(make({
 key:'s5',spawnGeneration:7,ownerId:'22',requestId:'kill_44444444',
 expectedVersion:10,save:old,reward:{xp:3,gold:5,item:null}
}));
sql.prepare('UPDATE saves SET version=version+1 WHERE telegram_id=?').run('22');
assert.equal(commit(stale).ok,false);
assert.equal(claim('dungeon-1-20-i1','s5',7),undefined);
assert.equal(row('22').version,11);
assert.equal(JSON.parse(row('22').state_json).xp,100);
assert.equal(count(),2);

// Both writer and credit must roll back if the save *JSON* changes under
// the same version (legacy corruption/race).
const nowRow=row('22');
sql.prepare('UPDATE saves SET state_json=? WHERE telegram_id=?')
 .run(JSON.stringify({...old,ppa:999}), '22');
const mismatch=prepareSyntheticPveKill(make({
 key:'s6',spawnGeneration:8,ownerId:'22',requestId:'kill_55555555',
 expectedVersion:11,save:JSON.parse(nowRow.state_json),
 reward:{xp:40,gold:50,item:null}
}));
assert.equal(commit(mismatch).ok,false);
assert.equal(claim('dungeon-1-20-i1','s6',8),undefined);
assert.equal(count(),2);

// Invalid, client-authored or unsupported inputs NEVER generate a SQL plan.
for(const patch of [
 {origin:'telegram-mob-hit-event'},{origin:'godot-packet'},
 {room:'safe'},{key:'fake'},{spawnGeneration:0},
 {ownerId:'hacker'},{requestId:'../bad'},
 {reward:{xp:99999999,gold:1,item:null}},
 {reward:{xp:1,gold:1,item:{uid:'existing-plus7-11',
  name:'Overwrite gear',kind:'synthetic-loot'}}},
 {reward:{xp:1,gold:1,item:{uid:'fake-gear',name:'gear',kind:'gear'}}},
 {damage:999999},{position:{x:0,y:0}},{loot:{gold:99999}},
 {hp:0},{mhp:500},{currency:'gram'}
]){
 const plan=prepareSyntheticPveKill(make(patch));
 assert.equal(plan.ok,false,'forged proof accepted '+JSON.stringify(patch));
}
// Entire original live pipeline is still untouched, and the lab is not wired
// to original Telegram/Godot realtime, which currently trusts client damage.
const realtime=readFileSync(new URL('../src/realtime-stable.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
assert(!realtime.includes('prepareSyntheticPveKill'));
assert(!worker.includes('prepareSyntheticPveKill'));
const code=readFileSync(new URL('../src/native-pve-atomic-kill-lab.js',import.meta.url),'utf8');
assert(!/\.run\(|\.batch\(|\.fetch\(/.test(code),
 'The plan module must not execute SQL or dispatch live routes');
console.log('PPA_NATIVE_ATOMIC_KILL_LAB_OK exactly_once_spawn=1 one_claim_owner=1 new_generation=1 save_CAS=1 item_plus7_preserved=1 no_live_writer=1 no_rewards_production=1');
