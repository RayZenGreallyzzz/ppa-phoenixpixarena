import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {sharedAuctionAction} from '../src/shared-auction-actions.js';
import {nativeAuctionReadOnly} from '../src/native-auction-readonly.js';

const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE saves(telegram_id TEXT PRIMARY KEY,version INTEGER,state_json TEXT,updated_at INTEGER);'+
 'CREATE TABLE auction_lots(id TEXT PRIMARY KEY,seller_id TEXT,seller_name TEXT,item_json TEXT,ui_json TEXT,qty INTEGER,price REAL,currency TEXT,created_at INTEGER,expires_at INTEGER,status TEXT);'+
 'CREATE TABLE auction_credits(id TEXT PRIMARY KEY,seller_id TEXT,lot_id TEXT,sold_qty INTEGER,currency TEXT,amount REAL,created_at INTEGER,acked INTEGER)');
const gear=uid=>({uid,name:'Меч +7 '+uid,slot:'weapon',rarity:'epic',enh:7,
 enhBaseStats:{atk:100},stats:{atk:190,magicResist:12},bm:3000});
const seller={cls:'mage',nickname:'Продавец',ppa:6000,gram:20,
 premiumShop:{auctionSlotGram:10},bag:[gear('original-weapon'),gear('cancel-weapon')],
 equipped:{weapon:null},storage:{personal:[],premium:[]}};
const buyer={cls:'mage',nickname:'Покупатель',ppa:9000,gram:3,bag:[],premiumShop:{auctionSlotGram:1}};
for(const [id,state] of [['seller',seller],['buyer',buyer]])
 sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run(id,5,JSON.stringify(state),Date.now());
let commits=0,injection=null;
const DB={prepare(query){
 const indexes=[...query.matchAll(/\?(\d+)/g)].map(x=>Number(x[1]));
 const stmt=sql.prepare(query.replace(/\?(\d+)/g,'?'));let args=[];
 return {bind(...values){args=indexes.length?indexes.map(n=>values[n-1]):values;return this},
  first(){return stmt.get(...args)||null},all(){return{results:stmt.all(...args)}},
  run(){const result=stmt.run(...args);return{meta:{changes:Number(result.changes)}}}};
},async batch(actions){
 if(injection){const f=injection;injection=null;f();}
 sql.exec('BEGIN IMMEDIATE');
 try{for(const action of actions)action.run();sql.exec('COMMIT');commits++;}
 catch(e){sql.exec('ROLLBACK');throw e;}
}};
const env={DB,PPA_AUCTION_ACTIONS_ENABLED:'1'};
const persist={
 load:async owner=>{
  const s=sql.prepare('SELECT version,state_json FROM saves WHERE telegram_id=?').get(owner);
  return s?{ok:true,version:s.version,state:structuredClone(JSON.parse(s.state_json))}:{ok:false};
 },
 save:async(id,state,version)=>{
  const row=sql.prepare('SELECT version FROM saves WHERE telegram_id=?').get(id);
  if(row.version!==version)return{ok:false,status:409};
  sql.prepare('UPDATE saves SET version=?,state_json=?,updated_at=? WHERE telegram_id=?')
   .run(version+1,JSON.stringify(state),Date.now(),id);
  return{ok:true,version:version+1};
 }
};
const send=(owner,action,uid,extra={})=>sharedAuctionAction(env,owner,{
 requestId:extra.requestId||'a'.repeat(32),action,version:extra.version??5,
 ...uid,...extra},persist);
const place=await send('seller','place',{uid:'original-weapon',price:1200,currency:'ppa'});
assert.equal(place.status,200,JSON.stringify(place));
const id=place.data.receipt.id;
assert(/^nat_[a-f0-9]{32}$/.test(id));
assert.equal(place.data.receipt.enh,7);
assert.equal(commits,1);
let state=JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('seller').state_json);
assert.equal(state.bag.length,1,'Seller kept an escrowed item');
const escrow=JSON.parse(sql.prepare('SELECT item_json FROM auction_lots WHERE id=?').get(id).item_json).gear;
assert.deepEqual(escrow,gear('original-weapon'));
assert.deepEqual(await send('seller','place',{uid:'original-weapon',price:1200,currency:'ppa'}),place);
assert.equal(commits,1,'Replay reminted seller lot');
const native=await nativeAuctionReadOnly(env,'buyer',id=>persist.load(id));
assert.equal(native.status,200);
assert.equal(native.data.actions.includes('buy'),true);
assert.equal(native.data.state.lots[0].canBuy,true);
const original=await nativeAuctionReadOnly(env,'seller',id=>persist.load(id));
assert.equal(original.data.state.mine[0].canCancel,true);
const buy=await send('buyer','buy',{lotId:id,expectedUnitPrice:1200,currency:'ppa'},
 {requestId:'b'.repeat(32)});
assert.equal(buy.status,200,JSON.stringify(buy));
assert.equal(buy.data.receipt.total,1200);
state=JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('buyer').state_json);
assert.equal(state.ppa,7800);
assert.deepEqual(state.bag[0],gear('original-weapon'));
assert.equal(sql.prepare('SELECT amount FROM auction_credits').get().amount,1080,'Seller fee 10%');
assert.deepEqual(await send('buyer','buy',{lotId:id,expectedUnitPrice:1200,currency:'ppa'},
 {requestId:'b'.repeat(32)}),buy,'Replay must not buy twice');
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM auction_credits').get().n,1);
const soldCancel=await send('seller','cancel',{lotId:id},{requestId:'c'.repeat(32),version:6});
assert.equal(soldCancel.status,409);
const listing2=await send('seller','place',{uid:'cancel-weapon',price:50,currency:'gram'},
 {requestId:'d'.repeat(32),version:6});
assert.equal(listing2.status,200,JSON.stringify(listing2));
const id2=listing2.data.receipt.id;
const cancel=await send('seller','cancel',{lotId:id2},
 {requestId:'e'.repeat(32),version:7});
assert.equal(cancel.status,200,JSON.stringify(cancel));
state=JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('seller').state_json);
assert.equal(state.bag.length,1);
assert.deepEqual(state.bag[0],gear('cancel-weapon'));
assert.deepEqual(await send('seller','cancel',{lotId:id2},
 {requestId:'e'.repeat(32),version:7}),cancel);
const expiry=await send('seller','place',{uid:'cancel-weapon',price:200,currency:'ppa'},
 {requestId:'7'.repeat(32),version:8});
assert.equal(expiry.status,200,JSON.stringify(expiry));
const expiredId=expiry.data.receipt.id;
sql.prepare("UPDATE auction_lots SET status='expired',expires_at=? WHERE id=?")
 .run(Date.now()-1000,expiredId);
const expiredList=await nativeAuctionReadOnly(env,'seller',owner=>persist.load(owner));
assert.equal(expiredList.data.state.recoverable.length,1,'Unclaimed original item must be visible');
assert.equal(expiredList.data.state.recoverable[0].uid,'cancel-weapon');
const stolen=await send('buyer','recover',{lotId:expiredId},
 {requestId:'8'.repeat(32),version:6});
assert.equal(stolen.status,409,'Other players cannot return a seller escrow');
let sellerRow=sql.prepare("SELECT version,state_json FROM saves WHERE telegram_id='seller'").get();
const unfilled=JSON.parse(sellerRow.state_json);
const filled=structuredClone(unfilled);
filled.bag=Array.from({length:100},(_,i)=>({uid:'filler'+i}));
sql.prepare("UPDATE saves SET state_json=? WHERE telegram_id='seller'")
 .run(JSON.stringify(filled));
const full=await send('seller','recover',{lotId:expiredId},
 {requestId:'9'.repeat(32),version:9});
assert.equal(full.status,409);
assert.equal(full.data.code,'AUCTION_BAG_FULL');
assert.equal(sql.prepare('SELECT status FROM auction_lots WHERE id=?').get(expiredId).status,'expired');
sql.prepare("UPDATE saves SET state_json=? WHERE telegram_id='seller'")
 .run(JSON.stringify(unfilled));
const recovered=await send('seller','recover',{lotId:expiredId},
 {requestId:'0'.repeat(32),version:9});
assert.equal(recovered.status,200,JSON.stringify(recovered));
assert.equal(recovered.data.receipt.enh,7);
state=JSON.parse(sql.prepare("SELECT state_json FROM saves WHERE telegram_id='seller'").get().state_json);
assert.deepEqual(state.bag[0],gear('cancel-weapon'));
assert.equal(sql.prepare('SELECT status FROM auction_lots WHERE id=?').get(expiredId).status,'returned');
assert.deepEqual(await send('seller','recover',{lotId:expiredId},
 {requestId:'0'.repeat(32),version:9}),recovered);
assert.equal(sql.prepare('SELECT status FROM auction_lots WHERE id=?').get(expiredId).status,'returned');
const no=await send('buyer','cancel',{lotId:id2},{requestId:'f'.repeat(32),version:6});
assert.equal(no.status,409);
const legacy=await send('buyer','buy',{lotId:'legacy123',expectedUnitPrice:100,currency:'ppa'},
 {requestId:'1'.repeat(32),version:6});
assert.equal(legacy.status,400,'Legacy lots remain inaccessible from native buy until ownership parity');
const off=await sharedAuctionAction({...env,PPA_AUCTION_ACTIONS_ENABLED:'0'},'buyer',{
 action:'buy',version:6,lotId:id,expectedUnitPrice:1200,currency:'ppa',requestId:'2'.repeat(32)},persist);
assert.equal(off.status,404);
console.log('PPA_SHARED_AUCTION_ESCROW_OK listed_real_uid=1 original_plus7=1 buyer_wallet=1 native_buy=1 cancel_restore=1 expired_recover=1 full_bag_wait=1 other_owner_denied=1 fee=10 replay=1 legacy_guard=1');
