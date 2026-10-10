import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripDeadPlayerSpriteAssets} from './player-source-cleanup-20261002.mjs';
import {patchGnomeCannonSource,functionRange} from './source-gnome-cannon-fix-20261002.mjs';

const ROOT=process.cwd();
const buildSource=fs.readFileSync('build.mjs','utf8');
const EXPECTED_SHA=buildSource.match(/const EXPECTED_SOURCE_SHA256 = '([a-f0-9]{64})'/)?.[1];
mustSha();
function mustSha(){if(!EXPECTED_SHA)throw new Error('Canonical build source SHA missing')}
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
const count=(s,n)=>(s.split(n).length-1);

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
for(const p of parts)must(fs.existsSync(p),'Missing packed source part '+p);
const packed=Buffer.concat(parts.map(p=>fs.readFileSync(p)));
const raw=zlib.gunzipSync(packed).toString('utf8');
const sha=crypto.createHash('sha256').update(raw).digest('hex');
must(sha===EXPECTED_SHA,'Canonical packed source SHA changed: '+sha);

// Exercise the exact pre-externalize build order.
const cleaned=stripDeadPlayerSpriteAssets(raw).source;
const transformed=patchGnomeCannonSource(cleaned).source;
must(count(transformed,'function basicAttackDamage(target,critMul)')===1,'basicAttackDamage helper missing/not unique');
must(count(transformed,"typeof api.muzzle==='function'")===1,'PvE Player3D muzzle bridge missing/not unique');
must(count(transformed,'pendingMin>=Math.max(1,Number(target.hp)||0)')===1,'lethal in-flight reservation missing/not unique');
must(transformed.includes('pendingMin+=Math.max(0,Number(b.minDamage)||0)'),'pending projectile damage accounting missing');
must(transformed.includes('minDamage:basicAttackDamage(target,1)')||transformed.includes('const minDamage=basicAttackDamage(target,1)'),'non-critical conservative damage reservation missing');
must(transformed.includes("let muzzleX=P.x+dx/dist*24"),'safe pre-3D muzzle fallback missing');
must(transformed.includes('const pdx=target.x-muzzleX,pdy=target.y-muzzleY'),'projectile vector is not recomputed from muzzle');
must(transformed.includes('remaining:pdist,target:target,minDamage:minDamage'),'projectile travel/reservation payload missing');

const build=fs.readFileSync('build.mjs','utf8');
must(build.includes("import {patchGnomeCannonSource} from './tools/source-gnome-cannon-fix-20261002.mjs';"),'build does not import cannon source transform');
must(build.includes('const gnomeCannonSource=patchGnomeCannonSource(playerSourceCleanup.source);'),'build order does not apply cannon transform after player cleanup');
must(!build.includes("'gnome realtime cannon visual'"),'obsolete gnome realtime build hook returned');
must(build.includes("'archer realtime arrow visual'"),'archer realtime visual hook was accidentally removed');

const p3=fs.readFileSync('gateway/player-3d-unified-runtime.js','utf8');
must(p3.includes("getObjectByName('DwarfCannon')"),'Player3D does not resolve DwarfCannon');
must(p3.includes('muzzle:muzzlePoint')&&!p3.includes('localMuzzle:'),'Player3D must expose one canonical muzzle API');
must(p3.includes('e.muzzle.updateWorldMatrix(true,false);'),'muzzle does not update only its parent chain');
must(!functionRange(p3,'muzzlePoint').text.includes('true,true'),'muzzle reintroduced full subtree matrix update');
must(p3.includes('(px-mapState.left)/dx')&&p3.includes('(py-mapState.top)/dy'),'muzzle screen-to-world projection missing');
must(p3.includes('syncLocalFromGame(now);')&&p3.includes('threeInitPromise'),'current Player3D lifecycle/init protections lost');

const fx=fs.readFileSync('gateway/remote-combat-fx.js','utf8');
must(fx.includes('window.PPA_LOCAL_COMBAT_FX=function(d)'),'local combat projectile renderer API missing');
must(fx.includes("Object.assign({from:'local'},d||{})"),'local combat FX does not reuse shared receive queue');

const rt=fs.readFileSync('gateway/realtime-client.js','utf8');
must(rt.includes('function combatFxOrigin(kind,sx,sy,tx,ty)'),'shared realtime combat FX origin helper missing');
must(rt.includes("api.muzzle('local')"),'realtime gnome cannon does not request the canonical Player3D muzzle');
must(rt.includes("kind==='gnome-cannon'&&window.PPA_LOCAL_COMBAT_FX"),'local PK/arena cannon visual missing');
must(count(rt,'emitCombatFx(kind,sx,sy,rp.x,rp.y,420);')===2,'PK and Arena do not share exactly two projectile FX call sites');
must(rt.includes('window.PPA_RT_COMBAT_FX(d)'),'remote peers no longer receive combat FX');

// Execute the actual canonical and transformed damage functions, including
// critical rolls, penetration, clan/shop multipliers and AI modifiers.
const math=Object.create(Math);
let random=0;
math.random=()=>random;
const ctx=vm.createContext({Math:math,P:{},window:{},EN:[],PT:[],PLAYER_CANNONBALLS:[],
  shopDamageMul:()=>1.15,clanDamageMulFor:()=>1.07,classBaseKey:()=>ctx.cls,
  v225AiOutgoingMul:()=>.75,v225AiIncomingDamageMul:()=>.8,
  targetIsValid:t=>t.hp>0,playerBasicRange:()=>500,findNearBasic:()=>ctx.EN[0]||null});
vm.runInContext(functionRange(raw,'basicAttackRoll').text.replace('basicAttackRoll','canonicalRoll'),ctx);
for(const name of ['basicAttackDamage','basicAttackRoll','gnomeFireCannonball','updatePlayerCannonballs']){
  vm.runInContext(functionRange(transformed,name).text,ctx);
}
let cases=0;
for(const cls of ['gnome','archer','mage','priest','assassin','tank','paladin','barbarian']){
  ctx.cls=cls;
  for(const atk of [0,12,93,1500])for(const def of [0,10,77.5,2500])for(const pen of [0,25,80])for(const ai of [false,true])for(const rng of [0,.99]){
    ctx.P={atk,dmgMul:1.2,crit:25,critDmg:180,magicPen:pen,armorPen:pen};
    const t={def,isAiFighter:ai}; random=rng;
    const before=ctx.canonicalRoll(t),after=ctx.basicAttackRoll(t);
    assert.equal(after.damage,before.damage);assert.equal(after.crit,before.crit);cases++;
  }
}
// The projectile updater itself must remain byte-for-byte unchanged: damage
// is invoked at arrival, never by reservation, travel FX or the build transform.
assert.equal(functionRange(transformed,'updatePlayerCannonballs').text,functionRange(raw,'updatePlayerCannonballs').text);
ctx.P={x:0,y:0,atk:100,dmgMul:1,crit:0,armorPen:0};ctx.cls='gnome';
const weak={id:'s1',x:200,y:0,hp:10,def:0};ctx.EN=[weak];
let peers=0,locals=0,hits=0;
ctx.window={PPA_PLAYER3D:{muzzle:()=>({x:24,y:-7})},PPA_RT_COMBAT_FX:d=>{peers++;assert.equal(d.originResolved,true)},PPA_LOCAL_COMBAT_FX:()=>locals++};
ctx.applyBasicAttackHit=t=>{hits++;t.hp=0};
assert.equal(ctx.gnomeFireCannonball(),true);
assert.equal(ctx.PLAYER_CANNONBALLS.length,1);assert.equal(weak.hp,10);assert.equal(hits,0);
assert.equal(ctx.gnomeFireCannonball(),true);assert.equal(ctx.PLAYER_CANNONBALLS.length,1);
assert.equal(peers,1);assert.equal(locals,0,'PvE must not render a duplicate local FX ball');
ctx.updatePlayerCannonballs();assert.equal(hits,0,'damage must wait for travel');
for(let i=0;i<80&&ctx.PLAYER_CANNONBALLS.length;i++)ctx.updatePlayerCannonballs();
assert.equal(hits,1);assert.equal(ctx.PLAYER_CANNONBALLS.length,0);
const respawn={...weak,hp:10};ctx.EN=[respawn];ctx.P.tid=respawn.id;
ctx.PLAYER_CANNONBALLS=[{target:weak,minDamage:999999,remaining:300}];
ctx.gnomeFireCannonball();assert.equal(ctx.PLAYER_CANNONBALLS.length,2,'same-ID respawn must not inherit dead target reservations');
const boss={...respawn,id:'b40',hp:9000};ctx.EN=[boss];ctx.P.tid=boss.id;ctx.PLAYER_CANNONBALLS=[];
ctx.gnomeFireCannonball();ctx.gnomeFireCannonball();assert.equal(ctx.PLAYER_CANNONBALLS.length,2,'boss must retain normal shot stream');

// PK and Arena must use the same resolved muzzle for local and peer FX. The
// sender must not resolve it a second time as the animated weapon moves.
const wire=[],local=[];let muzzleCalls=0;
const fxCtx=vm.createContext({window:{PPA_PLAYER3D:{muzzle:()=>({x:++muzzleCalls*10,y:7})},PPA_LOCAL_COMBAT_FX:d=>local.push({...d})},send:d=>{wire.push(d);return true}});
vm.runInContext(functionRange(rt,'combatFxOrigin').text+functionRange(rt,'emitCombatFx').text,fxCtx);
const senderStart=rt.indexOf('window.PPA_RT_COMBAT_FX=function(d){');
const senderEnd=rt.indexOf('\n  window.PPA_PLAYER_STEALTH=',senderStart);
vm.runInContext(rt.slice(senderStart,senderEnd),fxCtx);
fxCtx.emitCombatFx('gnome-cannon',1,2,100,80,420);
assert.equal(muzzleCalls,1);assert.equal(local.length,1);assert.equal(wire.length,1);
assert.equal(wire[0].x,local[0].x);assert.equal(wire[0].y,local[0].y);assert.equal(wire[0].ang,local[0].ang);
fxCtx.window.PPA_PLAYER3D.muzzle=()=>null;
fxCtx.emitCombatFx('gnome-cannon',1,2,100,80,420);assert.equal(wire[1].x,1);assert.equal(local[1].y,2);
fxCtx.emitCombatFx('archer-arrow',1,2,100,80,420);assert.equal(local.length,2);assert.equal(wire[2].kind,'archer-arrow');
console.log('Cannon behavior: damage parity '+cases+' cases; impact timing, respawn, boss stream, PvE broadcast and PK/Arena origin: OK');

const authority=fs.readFileSync('src/realtime-stable.js','utf8');
for(const [begin,end,expected] of [
  ['player-pk-hit','player-pk-control','1b1ec88abd43ccae0a2b8d1cb113c2a1934cea869f1664a57556d9f7d4a7df49'],
  ['arena-hit','arena-control','3512c15bf9d0eaa956bfe60666b8c1723cf650f6396680e761593b2409e6fde9'],
  ['mob-hit-event','mob-control-event','ff01d451b9974d85a9d091d21753497610cba0802a7864fb18c902060c43458b'],
]){
  const a=authority.indexOf("    if (m.type === '"+begin+"'");
  const b=authority.indexOf("    if (m.type === '"+end+"'",a);
  must(a>0&&b>a,'Missing authoritative damage handler '+begin);
  assert.equal(crypto.createHash('sha256').update(authority.slice(a,b)).digest('hex'),expected,'Authoritative '+begin+' handler changed');
}

if(process.argv.includes('--public')){
  const html=fs.readFileSync('public/index.html','utf8');
  const outP3=fs.readFileSync('public/game/player-3d-unified-runtime.js','utf8');
  const outFx=fs.readFileSync('public/game/remote-combat-fx.js','utf8');
  const outRt=fs.readFileSync('public/game/realtime-client.js','utf8');
  must(html.includes('function basicAttackDamage(target,critMul)'),'final public missing basic attack damage helper');
  must(html.includes('pendingMin>=Math.max(1,Number(target.hp)||0)'),'final public missing lethal reservation');
  must(html.includes("typeof api.muzzle==='function'"),'final public missing PvE muzzle bridge');
  must(outP3.includes("getObjectByName('DwarfCannon')")&&outP3.includes('muzzle:muzzlePoint'),'final Player3D muzzle API missing');
  must(outFx.includes('window.PPA_LOCAL_COMBAT_FX=function(d)'),'final local cannon FX API missing');
  must(count(outRt,'emitCombatFx(kind,sx,sy,rp.x,rp.y,420);')===2,'final PK/Arena projectile FX path missing');
  for(const f of ['dungeon-mob-events.js','dungeon60-dragon.js','boss-drop-boost.js','clan-boss-loot.js']){
    must(fs.existsSync('public/game/'+f),'Mob/boss regression guard missing '+f);
  }
}

console.log('Gnome cannon projectile invariants: OK'+(process.argv.includes('--public')?' (source + final public)':' (source/runtime)'));
