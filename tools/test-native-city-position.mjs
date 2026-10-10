import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const source=fs.readFileSync('src/realtime-stable.js','utf8');
const start=source.indexOf('  async webSocketMessage(ws, message) {');
const end=source.indexOf('\n  scheduleGoneCheck(',start);
assert(start>0&&end>start);
const prefix=source.slice(source.indexOf('\nfunction attOf('),source.indexOf('export class RealtimeHub'));
let now=10000;
const clock={now:()=>now};
const Hub=new Function('BaseRealtimeHub','Date',prefix+'\nreturn class extends BaseRealtimeHub {'+source.slice(start,end)+'};')(class{},clock);
function harness(overrides={},flag='1'){
  const actor={pid:'p:0123456789abcdef0123456789abcdef',telegramId:'123',name:'Hero',classKey:'gnome',
    room:'safe',h:200,m:900,atk:99,def:77,crit:25,critDmg:180,atkSpd:1.2,
    deadLocked:false,deadAt:0,pkEnabled:false,arenaMatchId:'',q:0,lastMove:0,...overrides};
  const messages=[],broadcasts=[];
  const ws={deserializeAttachment:()=>structuredClone(actor),serializeAttachment:a=>Object.assign(actor,a),send:raw=>messages.push(JSON.parse(raw))};
  const hub=new Hub();hub.env={PPA_GODOT_REALTIME_ENABLED:flag};
  hub.roomBroadcast=(room,packet,except)=>broadcasts.push({room,packet,except});
  hub.sendRoomSnapshot=()=>{};
  return {actor,messages,broadcasts,ws,send:p=>hub.webSocketMessage(ws,JSON.stringify(p))};
}
const good={type:'player-position',room:'safe',x:1395,y:1463,f:0,a:'run'};
const h=harness(),before=structuredClone(h.actor);
await h.send({...good,h:0,m:999999,dead:true,at:2500,df:2500,amount:99999,
  pid:'evil',telegramId:'evil',c:'mage',target:'evil',reward:'fake'});
assert.equal(h.broadcasts.length,1);assert.equal(h.broadcasts[0].packet.type,'move');
assert.equal(h.broadcasts[0].packet.player.i,before.pid);
assert.equal(h.broadcasts[0].packet.player.f,0,'up=0 must survive');
assert.equal(h.messages[0].type,'player-position-ack');
const permitted=new Set(['x','y','f','a','q','lastNativePosition','lastSeenAt','lastSnapshotPush']);
for(const [key,value] of Object.entries(before))if(!permitted.has(key))assert.deepEqual(h.actor[key],value,'city movement changed '+key);
for(const key of Object.keys(h.actor))assert(before.hasOwnProperty(key)||permitted.has(key),'unexpected actor mutation: '+key);
await h.send({...good,x:1400});assert.equal(h.broadcasts.length,1,'server must rate-limit city movement');
now+=120;await h.send({...good,x:1400});assert.equal(h.broadcasts.length,2);
for(const [overrides,packet,flag,code] of [
  [{},good,'','NATIVE_REALTIME_DISABLED'],
  [{room:'dungeon-1'},good,'1','CITY_ONLY'],
  [{arenaMatchId:'match'},good,'1','CITY_ONLY'],
  [{deadLocked:true},good,'1','PLAYER_DEAD'],
  [{},{...good,room:'pvp1'},'1','CITY_ONLY'],
  [{},{...good,x:'123'},'1','INVALID_POSITION'],
  [{},{...good,x:null},'1','INVALID_POSITION'],
  [{},{...good,y:-1},'1','INVALID_POSITION'],
  [{},{...good,x:2822.1},'1','INVALID_POSITION'],
]){
  const denied=harness(overrides,flag),saved=structuredClone(denied.actor);
  await denied.send(packet);
  assert.equal(denied.messages[0].code,code);
  assert.deepEqual(denied.actor,saved);assert.equal(denied.broadcasts.length,0);
}
// Exact damage-handler bytes from main: the adapter must never change server
// PK/Arena/PvE adjudication, cooldowns, rewards or hit timing.
const guards=[
  ['player-pk-hit','player-pk-control','1b1ec88abd43ccae0a2b8d1cb113c2a1934cea869f1664a57556d9f7d4a7df49'],
  ['arena-hit','arena-control','3512c15bf9d0eaa956bfe60666b8c1723cf650f6396680e761593b2409e6fde9'],
  ['mob-hit-event','mob-control-event','ff01d451b9974d85a9d091d21753497610cba0802a7864fb18c902060c43458b'],
];
for(const [begin,finish,expected] of guards){
  const a=source.indexOf("    if (m.type === '"+begin+"'");
  const b=source.indexOf("    if (m.type === '"+finish+"'",a);
  assert(a>0&&b>a);
  assert.equal(crypto.createHash('sha256').update(source.slice(a,b)).digest('hex'),expected,begin+' authority changed');
}
console.log('NATIVE_CITY_POSITION_OK original_pid=1 pixel_coords=1 health_unchanged=1 authority_unchanged=1 dead_locked=1 safe_only=1 rate_120ms=1');
