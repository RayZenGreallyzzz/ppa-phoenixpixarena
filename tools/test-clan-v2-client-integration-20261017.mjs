import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/index.html','utf8');
const client=fs.readFileSync('gateway/online-client.js','utf8');
const server=fs.readFileSync('src/clan-online.js','utf8');
for(const [name,condition] of [
  ['pilot leader toggle',html.includes('clanV2Pilot')&&html.includes('ENABLE_CLAN_PILOT_V2')],
  ['pilot field in both UIs',html.includes('CLAN_LOCAL_STATE.warehouseV2Pilot=!!state.warehouseV2Pilot')&&html.includes('warehouseV2Pilot:!!CLAN_LOCAL_STATE.warehouseV2Pilot')],
  ['Keeper pilot-only buttons',html.includes('if(!ST.warehouseV2Pilot){put.disabled=true;putAll.disabled=true;take.disabled=true;takeAll.disabled=true;}')],
  ['Clan Master pilot-only clicks',html.includes('if(!STATE.warehouseV2Pilot)')],
  ['parent cannot fall through into legacy storageMove',html.includes("if(d.mode==='clan'||d.source==='clanMenu'){ppaClanStorageTransferV2(")],
  ['legacy clan mutation remains blocked',html.includes("function storageMove(mode,direction,idx,source){if(mode==='clan'){try{showPickup(")],
  ['mass clan transfer remains blocked',html.includes("else if(d.type==='storageMoveAll'){if(d.mode==='clan')")],
  ['client cloud save is flushed before transfer',client.includes('await flushClanTradeSave();')&&client.includes('var moved=await PPA.ppaClanAction(req);')],
  ['client does not push success state to old local bag',client.includes('if(moved&&moved.ok&&window.PPA_CLOUD)window.PPA_CLOUD.ready=false;')],
  ['pilot scoped by leader',server.includes("m.role!=='leader'||String(c.leader_id)!==id")&&server.includes("pilot&&Number(pilot.enabled)===1")],
  ['pilot schema default off',server.includes("CREATE TABLE IF NOT EXISTS clan_warehouse_pilot_v2")]
])assert.ok(condition,name);

const a=html.indexOf('var PPA_CLAN_V2_BUSY=false;');
const b=html.indexOf('function storageMove(',a);
assert.ok(a>=0&&b>a&&b-a<6000,'Server-only transfer source extracted');
const src=html.slice(a,b);
const potions={uid:'hp_medium',name:'Среднее зелье HP',kind:'consumable',refId:'hp_medium',count:15,rarity:'common',x:'secret-untouched'};
function setup({piloted=true,warehouse=[],bag=[potions],handler=async()=>({ok:true,reload:true})}={}){
  const state={bag:structuredClone(bag),storage:{clan:structuredClone(warehouse),personal:[{name:'personal'}],premium:[{name:'premium'}]}};
  const calls=[],alerts=[],timers=[];
  let reloads=0;
  const ctx={window:{PPA_SERVER_CLAN_STATE:{storage:{items:structuredClone(warehouse)}},PPA_CLAN_STORAGE_HANDLER:async req=>{calls.push(structuredClone(req));return handler(req);}},CLAN_LOCAL_STATE:{warehouseV2Pilot:piloted},INV:state,
    showPickup:(s)=>alerts.push(s),setTimeout:(fn,n)=>timers.push({fn,n}),location:{reload(){reloads++}},console};
  vm.createContext(ctx);vm.runInContext(src,ctx);
  return {ctx,state,calls,alerts,timers,get reloads(){return reloads}};
}
async function settle(){await Promise.resolve();await Promise.resolve();await new Promise(r=>setImmediate(r));}
let t=setup();
const before=structuredClone(t.state);
t.ctx.ppaClanStorageTransferV2('put',0,'keeper');
t.ctx.ppaClanStorageTransferV2('put',0,'clanMenu');
assert.deepEqual(t.state,before,'15 potions stay in bag even while server is responding');
await settle();
assert.equal(t.calls.length,1,'double click blocked');
assert.equal(t.calls[0].item.count,15,'send count 15');
assert.equal(t.calls[0].item.kind,'consumable','send kind');
assert.equal(t.calls[0].item.refId,'hp_medium','send refId');
assert.equal(t.calls[0].bagIndex,0,'correct original bag slot');
assert.match(t.calls[0].requestId,/^w2_[A-Za-z0-9_-]{16,90}$/);
assert.deepEqual(t.state,before,'success cannot locally splice or overwrite items');
assert.equal(t.reloads,1,'authoritative reload after success');
t=setup({warehouse:[potions],bag:[]});
t.ctx.ppaClanStorageTransferV2('take',0,'clanMenu',{uid:'hp_medium',name:'Среднее зелье HP',count:15});
await settle();
assert.equal(t.calls[0].storageIndex,0);
assert.equal(t.calls[0].action,'take');
assert.equal(t.state.bag.length,0,'no speculative withdrawal');
assert.equal(t.state.storage.clan.length,1,'no speculative storage deletion');
assert.equal(t.reloads,1);
t=setup({handler:async()=>{throw Error('D1 outage')}});
t.ctx.ppaClanStorageTransferV2('put',0,'keeper');
await settle();
assert.equal(t.state.bag[0].count,15,'failed move cannot consume 15 potions');
assert.equal(t.state.storage.clan.length,0,'failed move cannot fake item in storage');
assert.equal(t.reloads,0);
assert.equal(t.timers.length,1,'failure reloads old client for fresh cloud state');
t=setup({piloted:false});
t.ctx.ppaClanStorageTransferV2('put',0,'keeper');
await settle();
assert.equal(t.calls.length,0,'pilot disabled sends no server request');
assert.equal(t.state.bag[0].count,15);
console.log('PASS V2 client end-to-end: Keeper + Clan Master, 15 potions, metadata, double tap, authoritative reload, failed request, pilot off.');
