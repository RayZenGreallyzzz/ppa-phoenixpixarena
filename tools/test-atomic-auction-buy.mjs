import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const online=readFileSync(new URL('../src/online.js',import.meta.url),'utf8');
const start=online.indexOf('function addAuctionPayload(');
const end=online.indexOf('\nasync function openStatChest(',start);
assert(start>0&&end>start,'Original Telegram auction functions not found');
const code=online.slice(start,end);
assert(code.includes('await env.DB.batch(['),'Original buyer wallet and lot updates not atomic');
assert(code.includes('credit = Math.round(gross * 0.90 * 100) / 100'));

const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE saves(telegram_id TEXT PRIMARY KEY,version INTEGER,state_json TEXT,updated_at INTEGER);'+
'CREATE TABLE auction_lots(id TEXT PRIMARY KEY,seller_id TEXT,seller_name TEXT,item_json TEXT,ui_json TEXT,qty INTEGER,price REAL,currency TEXT,created_at INTEGER,expires_at INTEGER,status TEXT);'+
'CREATE TABLE auction_credits(id TEXT PRIMARY KEY,seller_id TEXT,lot_id TEXT,sold_qty INTEGER,currency TEXT,amount REAL,created_at INTEGER,acked INTEGER)');
const initial=(id)=>JSON.stringify({cls:'mage',telegramId:id,bag:[],ppa:5000,gram:10});
for(const owner of ['buyerA','buyerB','seller'])
 sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run(owner,7,initial(owner),Date.now());
const offer=(name,uid)=>JSON.stringify({kind:'gear',gear:{uid,name,rarity:'epic',slot:'weapon',enh:7,
 enhBaseStats:{atk:100},stats:{atk:190},bm:1000}});
const addLot=(id,qty=1)=>sql.prepare('INSERT INTO auction_lots VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
 id,'seller','Продавец',offer('Посох +7',id+'-uid'),
 JSON.stringify({item:{name:'Посох +7',enh:7}}),qty,1000,'ppa',Date.now(),Date.now()+100000,'active');
addLot('first');
let injection=null,commits=0;
const env={DB:{prepare(query){
 const inds=[...query.matchAll(/\?(\d+)/g)].map(x=>Number(x[1]));
 const stmt=sql.prepare(query.replace(/\?(\d+)/g,'?'));let params=[];
 return {bind(...args){params=inds.length?inds.map(n=>args[n-1]):args;return this},
  first(){return stmt.get(...params)||null},all(){return{results:stmt.all(...params)}},
  run(){const result=stmt.run(...params);return{meta:{changes:Number(result.changes)}}}};
},async batch(actions){
 if(injection){const fn=injection;injection=null;fn();}
 sql.exec('BEGIN IMMEDIATE');
 try{for(const action of actions)action.run();sql.exec('COMMIT');commits++;}
 catch(e){sql.exec('ROLLBACK');throw e;}
}}};
const saved=async(_env,id)=>{
 const row=sql.prepare('SELECT version,state_json FROM saves WHERE telegram_id=?').get(id);
 return row?{row,state:JSON.parse(row.state_json)}:null;
};
const context=vm.createContext({TextEncoder,Date,Number,Math,crypto:{randomUUID},
 expireAuction:async()=>{},sanitizeLotId:String,sanitizeCurrency:s=>String(s).toLowerCase(),
 safeJson:(s,f)=>{try{return JSON.parse(s)}catch{return f}},
 statChestConfigFromItem:()=>null,loadSaveRow:saved,
 out:(data,status=200)=>({status,data})});
vm.runInContext(code,context);
const payload=lotId=>({lotId,qty:1,currency:'ppa',expectedUnitPrice:1000});
let response=await context.auctionBuy(env,'buyerA',payload('first'));
assert.equal(response.status,200,JSON.stringify(response));
assert.equal(response.data.total,1000);
assert.equal(response.data.balances.ppa,4000);
assert.equal(response.data.item.gear.enh,7);
const buyer=sql.prepare('SELECT state_json,version FROM saves WHERE telegram_id=?').get('buyerA');
assert.equal(buyer.version,8);
assert.equal(JSON.parse(buyer.state_json).bag[0].uid,'first-uid');
assert.equal(JSON.parse(buyer.state_json).bag[0].enh,7);
assert.equal(sql.prepare('SELECT status,qty FROM auction_lots WHERE id=?').get('first').status,'sold');
const paid=sql.prepare('SELECT seller_id,amount,currency FROM auction_credits').all();
assert.equal(paid.length,1);
assert.equal(paid[0].seller_id,'seller');
assert.equal(paid[0].amount,900,'10% auction fee');
response=await context.auctionBuy(env,'buyerB',payload('first'));
assert.equal(response.status,409);
assert.equal(commits,1);
assert.equal(JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('buyerB').state_json).bag.length,0);

// CAS save-change race (independent action before our transaction starts).
addLot('save-race');
injection=()=>sql.prepare('UPDATE saves SET version=version+1 WHERE telegram_id=?').run('buyerB');
response=await context.auctionBuy(env,'buyerB',payload('save-race'));
assert.equal(response.status,409,'Buyer save version race must roll back lot debit');
assert.equal(response.data.code,'AUCTION_VERSION_CONFLICT');
assert.equal(sql.prepare('SELECT status FROM auction_lots WHERE id=?').get('save-race').status,'active');
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM auction_credits').get().n,1);
assert.equal(JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('buyerB').state_json).bag.length,0);

// Competing buyer, seller cancellation or changed lot must not mint an item.
addLot('lot-race');
injection=()=>sql.prepare("UPDATE auction_lots SET status='cancelled' WHERE id=?").run('lot-race');
response=await context.auctionBuy(env,'buyerB',payload('lot-race'));
assert.equal(response.status,409);
assert.equal(sql.prepare('SELECT status FROM auction_lots WHERE id=?').get('lot-race').status,'cancelled');
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM auction_credits').get().n,1);
assert.equal(JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('buyerB').state_json).bag.length,0);

// Reject historical multi-quantity gear lots: one original UID per piece.
addLot('broken-stack',2);
response=await context.auctionBuy(env,'buyerB',payload('broken-stack'));
assert.equal(response.status,409);
assert.equal(sql.prepare('SELECT qty FROM auction_lots WHERE id=?').get('broken-stack').qty,2);
assert.equal(commits,1,'Only the first real purchase may commit');
console.log('PPA_ATOMIC_LEGACY_AUCTION_BUY_OK seller_fee=10 immutable_plus7=1 double_buy=0 save_race=1 cancel_race=1 malformed_stack=1 no_partial_credit=1');
