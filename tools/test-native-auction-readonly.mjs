import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {nativeAuctionReadOnly} from '../src/native-auction-readonly.js';

// Offline reproduction of the EXISTING Telegram online.js auction schema,
// not a second Godot auction table. We must not mutate legacy lots or credits.
const online=readFileSync(new URL('../src/online.js',import.meta.url),'utf8');
assert(online.includes('CREATE TABLE IF NOT EXISTS auction_lots'));
assert(online.includes('CREATE TABLE IF NOT EXISTS auction_credits'));
assert(online.includes('const credit = Math.round(gross * 0.90 * 100) / 100'));
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE auction_lots (id TEXT,seller_id TEXT,seller_name TEXT,item_json TEXT,ui_json TEXT,qty INTEGER,price REAL,currency TEXT,created_at INTEGER,expires_at INTEGER,status TEXT);"+
"CREATE TABLE auction_credits (id TEXT,seller_id TEXT,lot_id TEXT,sold_qty INTEGER,currency TEXT,amount REAL,created_at INTEGER,acked INTEGER)");
const t=Date.now();
const item=(name,enh)=>JSON.stringify({item:{name,kind:'gear',rarity:'epic',enh,slot:'weapon'}});
for(const [id,seller,itemName,qty,price,currency,status,expires] of [
 ['a','ownerB','Посох +7',1,1200,'ppa','active',t+120000],
 ['b','ownerA','Кольцо +5',1,400,'gram','active',t+120000],
 ['c','ownerC','Неактивный',1,500,'ppa','cancelled',t+120000],
 ['d','ownerC','Истёк',1,200,'ppa','active',t-1],
 ['e','ownerC','Обманная цена',1,-100,'ppa','active',t+120000]
])db.prepare('INSERT INTO auction_lots VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
 id,seller,'Игрок '+seller,JSON.stringify({kind:'gear'}),item(itemName,7),
 qty,price,currency,t,expires,status);
db.prepare('INSERT INTO auction_credits VALUES(?,?,?,?,?,?,?,?)').run(
 'credit1','ownerA','old',1,'ppa',900,t,0);
db.prepare('INSERT INTO auction_credits VALUES(?,?,?,?,?,?,?,?)').run(
 'credit2','ownerB','old',1,'gram',30,t,0);
db.prepare('INSERT INTO auction_credits VALUES(?,?,?,?,?,?,?,?)').run(
 'credit3','ownerA','old',1,'gram',75,t,1);
const wrap={prepare(sql){
 const stmt=db.prepare(sql.replace(/\?(\d+)/g,'?'));let args=[];
 return {bind(...params){args=params;return this},
  all(){return {results:stmt.all(...args)}},first(){return stmt.get(...args)}};
}};
let saveCalls=0,sqlWrites=0;
const env={DB:wrap},saves={
 ownerA:{ok:true,version:4,state:{ppa:900,gram:90,
  bag:[{uid:'original-weapon',name:'Оружие +7',slot:'weapon',enh:7,rarity:'epic'}]}},
 ownerB:{ok:true,version:12,state:{ppa:10000,gram:0,bag:[]}}
};
const load=async owner=>{saveCalls++;return saves[owner]};
const beforeLots=db.prepare('SELECT * FROM auction_lots ORDER BY id').all();
const beforeCredits=db.prepare('SELECT * FROM auction_credits ORDER BY id').all();
const a=await nativeAuctionReadOnly(env,'ownerA',load);
assert.equal(a.status,200,JSON.stringify(a));
assert.equal(a.data.contract,'ppa-auction-readonly-v1');
assert.equal(a.data.state.commissionPct,10);
assert.deepEqual(a.data.actions,[],'No unaudited buy/sell actions allowed');
assert.equal(a.data.state.lots.length,1);
assert.equal(a.data.state.lots[0].item.name,'Посох +7');
assert.equal(a.data.state.lots[0].canBuy,false);
assert.equal(a.data.state.mine[0].id,'b');
assert.equal(a.data.state.mine[0].canCancel,false);
assert.equal(a.data.state.wallet.ppa,900);
assert.equal(a.data.state.pendingCredits.length,1);
assert.equal(a.data.state.pendingCredits[0].amount,900);
assert.equal(a.data.state.bag[0].enh,7);
assert.equal(a.data.state.version,4);
const b=await nativeAuctionReadOnly(env,'ownerB',load);
assert.equal(b.data.state.lots.length,1);
assert.equal(b.data.state.lots[0].id,'b');
assert.equal(b.data.state.mine[0].id,'a');
assert.equal(b.data.state.pendingCredits[0].amount,30);
assert.equal(b.data.ownerId,'ownerB');
assert.equal((await nativeAuctionReadOnly(env,'unknown',load)).status,409);
assert.deepEqual(db.prepare('SELECT * FROM auction_lots ORDER BY id').all(),beforeLots);
assert.deepEqual(db.prepare('SELECT * FROM auction_credits ORDER BY id').all(),beforeCredits);
assert.equal(saveCalls,3);
assert.equal(sqlWrites,0);
console.log('PPA_AUCTION_READONLY_ORIGINAL_OK source_tables=2 seller_credits=1 own_lots=1 version=1 no_writes=1 commission=10');
