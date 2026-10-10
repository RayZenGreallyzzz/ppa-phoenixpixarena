import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the real Telegram bridge (not a copy of its control flow).
// Every call is local. No live Telegram, money, Cloudflare or D1 access.
const code=readFileSync(new URL('../gateway/ppa-bridge.js',import.meta.url),'utf8');
function response(data,status=200){
 return {ok:status>=200&&status<300,status,async json(){return data}};
}
function scenario(options={}){
 const calls=[], storage={getItem(){return null},setItem(){},removeItem(){}};
 const window={
  Telegram:{WebApp:{initData:'signed-offline-test',ready(){},expand(){}}},
  PPA_CLOUD:{ready:true,version:null}
 };
 let savedVersion=5;
 const fetch=async (url,init)=>{
  const body=JSON.parse(init.body);
  if(url==='/api/auth')return response({ok:true,profile:{telegramId:'ownerA'}});
  if(url==='/api/save/load')return response({ok:true,version:savedVersion,
   state:{ppa:300,gram:7.25,bag:[{uid:'same_plus7',enh:7}]}});
  if(url==='/api/save'){
   calls.push({type:'save',version:body.version});
   if(options.save)await options.save(body);
   savedVersion+=1;
   return response({ok:true,version:savedVersion});
  }
  if(url==='/api/auction/claim-credit'){
   calls.push({type:'claim',version:body.version,id:body.creditId});
   if(options.claim)await options.claim(body);
   savedVersion+=1;
   return response({ok:true,version:savedVersion});
  }
  throw new Error('Unexpected route '+url);
 };
 vm.runInNewContext(code,{window,localStorage:storage,sessionStorage:storage,
  fetch,console,Date,Math,JSON,Promise,Number,String,Object,Array,Set,Error,
  setTimeout,clearTimeout});
 return {client:window.PPA,window,calls};
}
function gated(error){
 return error && error.code==='AUCTION_CREDIT_SAVE_GATE';
}

// Pending old saves must be allowed to finish before the payout. Saves
// enqueued after the payout begins must not overwrite the canonical wallet.
let saveStarted;
const started=new Promise(resolve=>{saveStarted=resolve});
let releaseSave;
const held=new Promise(resolve=>{releaseSave=resolve});
const a=scenario({save:async ()=>{saveStarted();await held}});
await a.client.ppaLoadSave();
const oldSave=a.client.ppaSaveGame({ppa:301},5);
await started;
const claim=a.client.ppaAuctionClaimCredit('credit_server_1',5);
const stale=a.client.ppaSaveGame({ppa:99999},5);
releaseSave();
await oldSave;
await assert.rejects(stale,gated);
const receipt=await claim;
assert.equal(receipt.ok,true);
assert.deepEqual(a.calls.map(x=>x.type),['save','claim']);
assert.equal(a.calls[1].version,6,
 'Claim must use version after the queued legacy save');
assert.equal(a.window.PPA_AUCTION_CLAIM_RELOAD_REQUIRED,true);
await assert.rejects(a.client.ppaSaveGame({ppa:1},5),gated);

// Lost response AFTER the server may have committed must never open saves.
// Even a read of the new snapshot does not apply it to the running INV.
const b=scenario({claim:async ()=>{throw new Error('Connection lost after DB commit')}});
await b.client.ppaLoadSave();
await assert.rejects(b.client.ppaAuctionClaimCredit('credit_server_2',5),
 /Connection lost after DB commit/);
assert.equal(b.calls.filter(x=>x.type==='claim').length,1);
assert.equal(b.window.PPA_AUCTION_CLAIM_RELOAD_REQUIRED,true);
await assert.rejects(b.client.ppaSaveGame({ppa:999},5),gated);
await b.client.ppaLoadSave();
await assert.rejects(b.client.ppaSaveGame({ppa:999},5),gated);

// If an earlier character save FAILED, the bridge must never claim over it.
const c=scenario({save:async ()=>{throw new Error('Pending save failed')}});
await c.client.ppaLoadSave();
await assert.rejects(c.client.ppaSaveGame({ppa:302},5),/Pending save failed/);
await assert.rejects(c.client.ppaAuctionClaimCredit('credit_server_3',5),
 /Pending save failed/);
assert.equal(c.calls.filter(x=>x.type==='claim').length,0);
assert.equal(c.window.PPA_AUCTION_CLAIM_RELOAD_REQUIRED,true);

console.log('PPA_AUCTION_CLAIM_GATE_OK pending_save_drain=1 stale_save_blocked=1 canonical_version=1 response_lost=1 fail_closed=1 load_not_bypass=1 failed_pending_save_no_claim=1');
