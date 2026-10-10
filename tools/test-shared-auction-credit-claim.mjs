import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {claimOriginalAuctionCredit} from '../src/shared-auction-credit-claim.js';

const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE saves(telegram_id TEXT PRIMARY KEY,version INTEGER,state_json TEXT,updated_at INTEGER);'+
 'CREATE TABLE auction_credits(id TEXT PRIMARY KEY,seller_id TEXT,lot_id TEXT,sold_qty INTEGER,currency TEXT,amount REAL,created_at INTEGER,acked INTEGER)');
const original={ppa:300,gram:7.25,bag:[{uid:'real_7',enh:7,stats:{atk:190}}],nickname:'Seller'};
for(const [owner,state] of [['seller',original],['other',{ppa:10,gram:0,bag:[]}]])
 sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run(owner,5,JSON.stringify(state),0);
for(const [id,owner,cur,amount,acked] of [
 ['credit_pp','seller','ppa',900,0],['credit_g','seller','gram',2.5,0],
 ['credit_other','other','ppa',15,0],['credit_done','seller','ppa',12,1],
 ['credit_bad','seller','gram',-1,0]])
 sql.prepare('INSERT INTO auction_credits VALUES(?,?,?,?,?,?,?,?)')
 .run(id,owner,'lot',1,cur,amount,0,acked);
let committed=0,injection=null;
const DB={prepare(query){
 const order=[...query.matchAll(/\?(\d+)/g)].map(x=>Number(x[1]));
 const stmt=sql.prepare(query.replace(/\?(\d+)/g,'?'));let args=[];
 return {bind(...v){args=order.length?order.map(n=>v[n-1]):v;return this;},
 first(){return stmt.get(...args)||null},
 all(){return{results:stmt.all(...args)}},
 run(){const r=stmt.run(...args);return{meta:{changes:Number(r.changes)}}}};
},async batch(steps){
 if(injection){const fn=injection;injection=null;fn();}
 sql.exec('BEGIN IMMEDIATE');
 try{for(const step of steps)step.run();sql.exec('COMMIT');committed++;}
 catch(e){sql.exec('ROLLBACK');throw e;}
}};
const env={DB,PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED:'1'};
const save=owner=>JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get(owner).state_json);
const credit=id=>sql.prepare('SELECT acked FROM auction_credits WHERE id=?').get(id).acked;
const countVersion=owner=>sql.prepare('SELECT version FROM saves WHERE telegram_id=?').get(owner).version;
const first=await claimOriginalAuctionCredit(env,'seller','credit_pp',5);
assert.equal(first.status,200,JSON.stringify(first));
assert.equal(first.data.receipt.amount,900);
assert.equal(first.data.balances.ppa,1200);
assert.equal(save('seller').ppa,1200);
assert.equal(save('seller').bag[0].enh,7);
assert.equal(credit('credit_pp'),1);
assert.equal(committed,1);
assert.equal((await claimOriginalAuctionCredit(env,'seller','credit_pp',6)).status,409);
assert.equal(committed,1);
assert.equal((await claimOriginalAuctionCredit(env,'other','credit_g',5)).status,409);
assert.equal((await claimOriginalAuctionCredit(env,'seller','credit_other',6)).status,409);
assert.equal((await claimOriginalAuctionCredit(env,'seller','credit_done',6)).status,409);
assert.equal((await claimOriginalAuctionCredit(env,'seller','credit_bad',6)).data.code,'AUCTION_CREDIT_INVALID');
assert.equal(save('other').ppa,10);
const gram=await claimOriginalAuctionCredit(env,'seller','credit_g',6);
assert.equal(gram.status,200);
assert.equal(save('seller').gram,9.75);
assert.equal(credit('credit_g'),1);
assert.equal(countVersion('seller'),7);
const disabled=await claimOriginalAuctionCredit({...env,PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED:'0'},'seller','credit_pp',7);
assert.equal(disabled.status,404);

// Concurrent Telegram/local save change before D1 batch: old credits NOT
// ACKed and neither the mutated bag nor wallet is overwritten by claim.
sql.prepare('INSERT INTO auction_credits VALUES(?,?,?,?,?,?,?,?)')
 .run('race_save','seller','lot',1,'ppa',10,0,0);
injection=()=>sql.prepare('UPDATE saves SET version=version+1 WHERE telegram_id=?').run('seller');
const before=save('seller').ppa;
const clash=await claimOriginalAuctionCredit(env,'seller','race_save',7);
assert.equal(clash.status,409);
assert.equal(clash.data.code,'AUCTION_CREDIT_CONFLICT');
assert.equal(save('seller').ppa,before);
assert.equal(credit('race_save'),0);

// Concurrent acknowledgment elsewhere: transaction must roll back the
// increased save balance and not pay an already ACKed record.
const version=countVersion('seller');
injection=()=>sql.prepare('UPDATE auction_credits SET acked=1 WHERE id=?').run('race_save');
const acked=await claimOriginalAuctionCredit(env,'seller','race_save',version);
assert.equal(acked.status,409);
assert.equal(acked.data.code,'AUCTION_CREDIT_CONFLICT');
assert.equal(save('seller').ppa,before);
assert.equal(credit('race_save'),1);
// Failure on DB batch cannot leave a "paid but not ACKed" partial result.
assert.equal(committed,2,'Only the two clean claims should commit');
console.log('PPA_ATOMIC_AUCTION_CREDIT_CLAIM_OK one_credit=1 ppa=1 gram=1 owner=1 +7_untouched=1 replay=1 save_race=1 ack_race=1 rollback=1 flag_off=1');
