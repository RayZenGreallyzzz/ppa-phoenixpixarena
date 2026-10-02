import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {stripDeadPlayerSpriteAssets} from './player-source-cleanup-20261002.mjs';
import {patchGnomeCannonSource} from './source-gnome-cannon-fix-20261002.mjs';

const ROOT=process.cwd();
const EXPECTED_SHA='caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
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
must(count(transformed,"typeof api.localMuzzle==='function'")===1,'PvE Player3D muzzle bridge missing/not unique');
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
must(p3.includes('localMuzzle:localMuzzle'),'Player3D local muzzle API is not exported');
must(p3.includes('cannon.updateWorldMatrix(true,false)'),'muzzle does not update only the cannon parent chain');
must(!p3.includes('cannon.updateWorldMatrix(true,true)'),'muzzle reintroduced full subtree matrix update');
must(p3.includes('(apx-mapState.left)/denX')&&p3.includes('(apy-mapState.top)/denY'),'muzzle screen-to-world projection missing');

const fx=fs.readFileSync('gateway/remote-combat-fx.js','utf8');
must(fx.includes('window.PPA_LOCAL_COMBAT_FX=function(d)'),'local combat projectile renderer API missing');
must(fx.includes("Object.assign({from:'local'},d||{})"),'local combat FX does not reuse shared receive queue');

const rt=fs.readFileSync('gateway/realtime-client.js','utf8');
must(rt.includes('function combatFxOrigin(kind,sx,sy,tx,ty)'),'shared realtime combat FX origin helper missing');
must(rt.includes("api.localMuzzle(tx,ty)"),'realtime gnome cannon does not request Player3D muzzle');
must(rt.includes("kind==='gnome-cannon'&&window.PPA_LOCAL_COMBAT_FX"),'local PK/arena cannon visual missing');
must(count(rt,'emitCombatFx(kind,sx,sy,rp.x,rp.y,420);')===2,'PK and Arena do not share exactly two projectile FX call sites');
must(rt.includes('window.PPA_RT_COMBAT_FX(d)'),'remote peers no longer receive combat FX');

if(process.argv.includes('--public')){
  const html=fs.readFileSync('public/index.html','utf8');
  const outP3=fs.readFileSync('public/game/player-3d-unified-runtime.js','utf8');
  const outFx=fs.readFileSync('public/game/remote-combat-fx.js','utf8');
  const outRt=fs.readFileSync('public/game/realtime-client.js','utf8');
  must(html.includes('function basicAttackDamage(target,critMul)'),'final public missing basic attack damage helper');
  must(html.includes('pendingMin>=Math.max(1,Number(target.hp)||0)'),'final public missing lethal reservation');
  must(html.includes("typeof api.localMuzzle==='function'"),'final public missing PvE muzzle bridge');
  must(outP3.includes("getObjectByName('DwarfCannon')")&&outP3.includes('localMuzzle:localMuzzle'),'final Player3D muzzle API missing');
  must(outFx.includes('window.PPA_LOCAL_COMBAT_FX=function(d)'),'final local cannon FX API missing');
  must(count(outRt,'emitCombatFx(kind,sx,sy,rp.x,rp.y,420);')===2,'final PK/Arena projectile FX path missing');
  for(const f of ['dungeon-mob-events.js','dungeon60-dragon.js','boss-drop-boost.js','clan-boss-loot.js']){
    must(fs.existsSync('public/game/'+f),'Mob/boss regression guard missing '+f);
  }
}

console.log('Gnome cannon projectile invariants: OK'+(process.argv.includes('--public')?' (source + final public)':' (source/runtime)'));
