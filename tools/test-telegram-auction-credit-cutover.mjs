import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {serverCreditClaimsCutoff,legacyAuctionCreditCutoff} from '../src/shared-auction-credit-claim.js';

const online=readFileSync(new URL('../src/online.js',import.meta.url),'utf8');
const front=readFileSync(new URL('../gateway/online-client.js',import.meta.url),'utf8');
const sdk=readFileSync(new URL('../gateway/ppa-bridge.js',import.meta.url),'utf8');
for(const marker of ['serverCreditClaimMode','ppaAuctionServerCredits','ppaAuctionClaimCredit'])
 assert(front.includes(marker),'Telegram bridge missing '+marker);
assert(front.includes('window.location.reload()'),'Canonical saved wallet reload required');
assert(front.includes('serverCreditClaimMode&&!changed&&'),
 'Already-seen legacy records must not starve post-cutoff server credits');
assert(!front.includes('serverCreditClaimMode&&credits.length===0&&'),
 'New seller payouts must not depend on an empty legacy credit response');
assert(front.includes('if(changed){saveCreditSet(seen);saveGame()'),
 'New claims must defer until local legacy credit updates have been saved');
assert(front.includes('NEVER call saveGame()'),'No full stale save after server payout');
assert(sdk.includes('serverSellerCreditClaimGate=true'),'Cloud save gate not closed during claim');
assert(sdk.includes('cloudSaveLoaded=false'),'Cloud save must stay closed until reload');
assert(sdk.includes('await saveQueue.catch(function(){});'),'Pending saves must drain before claim');
assert.equal(serverCreditClaimsCutoff({PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED:'1'}),null);
assert.equal(serverCreditClaimsCutoff({PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED:'1',
 PPA_AUCTION_SERVER_CREDIT_CUTOFF_MS:'100'}),100);
assert.equal(legacyAuctionCreditCutoff({PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED:'0',
 PPA_AUCTION_SERVER_CREDIT_CUTOFF_MS:'100'}),100,
 'Rollback must preserve the legacy visibility boundary');
const get=(start,end)=>{
 const i=online.indexOf(start),j=online.indexOf(end,i+start.length);
 assert(i>=0&&j>i,start+' source missing');
 return online.slice(i,j);
};
const sample=get('async function auctionList(','async function auctionPlace(');
const ack=get('async function auctionAck(','function validTonAddress(');
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE auction_lots(id TEXT,seller_id TEXT,seller_name TEXT,ui_json TEXT,qty INTEGER,price REAL,currency TEXT,created_at INTEGER,expires_at INTEGER,status TEXT);'+
 'CREATE TABLE auction_credits(id TEXT,seller_id TEXT,lot_id TEXT,sold_qty INTEGER,currency TEXT,amount REAL,created_at INTEGER,acked INTEGER)');
sql.prepare('INSERT INTO auction_lots VALUES(?,?,?,?,?,?,?,?,?,?)')
 .run('lot1','other','Another',JSON.stringify({item:{name:'Original gear +7'}}),1,500,'ppa',0,Date.now()+100000,'active');
for(const [id,created_at,amount] of [['legacy_local',25,50],['native_server',200,900]])
 sql.prepare('INSERT INTO auction_credits VALUES(?,?,?,?,?,?,?,?)')
 .run(id,'ownerA','lot1',1,'ppa',amount,created_at,0);
const db={prepare(query){
 const pos=[...query.matchAll(/\?(\d+)/g)].map(x=>Number(x[1]));
 const stmt=sql.prepare(query.replace(/\?(\d+)/g,'?'));let args=[];
 return {bind(...v){args=pos.length?pos.map(i=>v[i-1]):v;return this;},
 run(){const r=stmt.run(...args);return{meta:{changes:Number(r.changes)}}},
 all(){return{results:stmt.all(...args)}},
 first(){return stmt.get(...args)}}}};
const ctx=vm.createContext({Date,Math,Number,String,Array,console,
 serverCreditClaimsCutoff,legacyAuctionCreditCutoff,
 expireAuction:async env=>{env.DB.prepare("UPDATE auction_lots SET status='expired' WHERE status='active' AND expires_at<=?1").bind(Date.now()).run();},
 safeJson:(s,f)=>{try{return JSON.parse(s)}catch{return f}},
 out:(data,status=200)=>({status,data})});
vm.runInContext(sample+'\n'+ack,ctx);
const env={DB:db};
let snap=await ctx.auctionList(env,'ownerA');
assert.equal(snap.credits.length,2,'Original pre-flag local payout must work');
assert.equal(snap.serverCreditClaimMode,false);
assert.equal(snap.lots.length,1,'Original lots unchanged');
env.PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED='1';
env.PPA_AUCTION_SERVER_CREDIT_CUTOFF_MS='100';
snap=await ctx.auctionList(env,'ownerA');
assert.equal(snap.serverCreditClaimMode,true);
assert.deepEqual(JSON.parse(JSON.stringify(snap.credits.map(x=>x.id))),['legacy_local'],
 'Old cached Telegram clients must NEVER receive server claim IDs');
const blocked=await ctx.auctionAck(env,'ownerA',{ids:['legacy_local','native_server']});
assert.equal(blocked.status,200);
assert.equal(sql.prepare('SELECT acked FROM auction_credits WHERE id=?').get('legacy_local').acked,1);
assert.equal(sql.prepare('SELECT acked FROM auction_credits WHERE id=?').get('native_server').acked,0,
 'Old Telegram ack must never eat a new unclaimed server credit');
const remaining=await ctx.auctionList(env,'ownerA');
assert.equal(remaining.credits.length,0);
assert.equal(remaining.serverCreditClaimMode,true);
env.PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED='0';
snap=await ctx.auctionList(env,'ownerA');
assert.equal(snap.serverCreditClaimMode,false);
assert.deepEqual(JSON.parse(JSON.stringify(snap.credits.map(x=>x.id))),[],
 'Claim-mode rollback must NOT re-expose post-cutoff credits to cached Telegram clients');
await ctx.auctionAck(env,'ownerA',{ids:['native_server']});
assert.equal(sql.prepare('SELECT acked FROM auction_credits WHERE id=?').get('native_server').acked,0,
 'Rollback must NOT allow legacy ACK of post-cutoff credit');
console.log('PPA_TELEGRAM_AUCTION_CREDIT_CUTOVER_OK old_mode=1 cutoff=1 old_ack_guard=1 server_credit_hidden_from_old_clients=1 save_gate=1 rollback_fail_closed=1');
