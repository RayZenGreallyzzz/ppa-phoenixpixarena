import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
const runtimePath=path.join(ROOT,'public','game','player-3d-unified-runtime.js');
const remotePath=path.join(ROOT,'public','game','remote-player-3d-dispatch.js');

for(const p of [htmlPath,runtimePath,remotePath]){
  if(!fs.existsSync(p))throw new Error('Player render ownership audit: missing build artifact '+p);
}

const html=fs.readFileSync(htmlPath,'utf8');
const runtime=fs.readFileSync(runtimePath,'utf8');
const remote=fs.readFileSync(remotePath,'utf8');
const failures=[];
const warnings=[];

function count(haystack,needle){return haystack.split(needle).length-1}
function fail(msg){failures.push(msg)}
function warn(msg){warnings.push(msg)}

// These symbols belong exclusively to the retired local 2D player renderer.
// AI-training primitives, mobs, pets and world sprites are intentionally NOT in
// this list: the audit guards ownership of real player rendering only.
const obsoletePlayerSymbols=[
  'GNOME_IDLE_SRC','GNOME_RUN_SRC','GNOME_ATTACK_SRC',
  'ARCHER_IDLE_SRC','ARCHER_RUN_SRC','ARCHER_ATTACK_SRC',
  'ASSASSIN_IDLE_SRC','ASSASSIN_RUN_SRC','ASSASSIN_ATTACK_SRC',
  'TANK_IDLE_SRC','TANK_RUN_SRC','TANK_ATTACK_SRC',
  'BERSERKER_IDLE_SRC','BERSERKER_RUN_SRC','BERSERKER_ATTACK_SRC',
  'PRIEST_IDLE_SRC','PRIEST_RUN_SRC','PRIEST_ATTACK_SRC',
  'MAGE_IDLE_SRC','MAGE_RUN_SRC','MAGE_ATTACK_SRC',
  'PALADIN_IDLE_SRC','PALADIN_RUN_SRC','PALADIN_ATTACK_SRC',
  'imgGnomeIdle','imgGnomeRun','imgGnomeAttack',
  'imgArcherIdle','imgArcherRun','imgArcherAttack',
  'imgAssassinIdle','imgAssassinRun','imgAssassinAttack',
  'imgTankIdle','imgTankRun','imgTankAttack',
  'imgBerserkerIdle','imgBerserkerRun','imgBerserkerAttack',
  'imgPriestIdle','imgPriestRun','imgPriestAttack',
  'imgMageIdle','imgMageRun','imgMageAttack',
  'imgPaladinIdle','imgPaladinRun','imgPaladinAttack',
  'SPR_IDLE','SPR_RUN','SPR_ATK','imgIdle','imgRun','imgAtk',
  'GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM',
  'BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM',
  'GNOME_SOURCE_ROW','ARCHER_SOURCE_ROW','ASSASSIN_RUN_SOURCE_ROW','ASSASSIN_4DIR_ROW',
  'TANK_4DIR_ROW','BERSERKER_4DIR_ROW','PRIEST_4DIR_ROW','MAGE_4DIR_ROW','PALADIN_4DIR_ROW',
  'GNOME_FLIP_BY_DIR','ARCHER_FLIP_BY_DIR',
  'GNOME_DRAW_SCALE','ARCHER_DRAW_SCALE','ASSASSIN_RUN_DRAW_SCALE','ASSASSIN_IDLE_DRAW_SCALE',
  'ASSASSIN_ATTACK_DRAW_SCALE','TANK_DRAW_SCALE','BERSERKER_DRAW_SCALE','PRIEST_DRAW_SCALE',
  'MAGE_DRAW_SCALE','PALADIN_DRAW_SCALE',
  'playerUsesGnomeSprites','playerUsesArcherSprites','playerUsesAssassinSprites','playerUsesTankSprites',
  'playerUsesBerserkerSprites','playerUsesPriestSprites','playerUsesMageSprites','playerUsesPaladinSprites',
  'playerUsesEightDirSprites','playerDir8','dir8Canonical','playerAnimDef'
];
for(const sym of obsoletePlayerSymbols){
  if(html.includes(sym))fail('retired local 2D player symbol survived final build: '+sym);
}
if(/\bconst\s+ANIM\s*=/.test(html))fail('retired generic local player ANIM table survived final build');

const canonicalMarker='PPA_PLAYER3D_LOCAL_ONLY_20261002';
if(count(html,canonicalMarker)!==1)fail('expected exactly one canonical local Player3D marker, found '+count(html,canonicalMarker));
if(count(html,'function drawPlayer(){')!==1)fail('expected exactly one drawPlayer() owner, found '+count(html,'function drawPlayer(){'));
if(!html.includes('PPA_PLAYER_SPRITE_SOURCE_CLEANUP_20261002'))fail('canonical packed-source 2D player cleanup marker missing');
if(!html.includes('PPA_PLAYER3D_HUD_OWNS_LOCAL_LABELS_20261002'))fail('Player3D local HUD ownership marker missing');

for(const deadTag of ['remote-sprite-renderer.js','player-3d-runtime.js?v=','remote-player-3d-runtime.js?v=']){
  if(html.includes(deadTag))fail('obsolete player runtime tag survived final build: '+deadTag);
}
if(!runtime.includes('__PPA_PLAYER3D_UNIFIED_V2'))fail('unified Player3D runtime marker missing');
if(!runtime.includes('PPA_PLAYER3D_RUNTIME_OWNS_LOCAL_STATE_20261003'))fail('runtime-owned local Player3D marker missing');
if(!runtime.includes('syncLocalFromGame(now);'))fail('runtime does not synchronize local player from canonical P');
if(runtime.includes("e.kind==='local'?500:1800"))fail('local Player3D still depends on 500ms draw-call TTL');
if(!runtime.includes('threeInitPromise'))fail('Player3D Three.js initialization is not serialized');
if(runtime.includes('__PPA3D_LOCAL_PENDING'))fail('legacy pending local registration survived runtime');
if(!remote.includes('__PPA_REMOTE_PLAYER3D_DISPATCH_V2'))fail('remote Player3D V2 dispatch marker missing');
if(!remote.includes('PPA_PLAYER3D_REMOTE_SCRATCH_20261003'))fail('remote Player3D reusable scratch marker missing');
if(/\bdrawImage\s*\(/.test(remote))fail('remote real-player dispatch contains Canvas drawImage path');

function functionRange(src,start){
  const open=src.indexOf('{',start);
  if(open<0)return null;
  let depth=0,state='code',quote='',escaped=false;
  for(let i=open;i<src.length;i++){
    const ch=src[i],next=src[i+1]||'';
    if(state==='line'){if(ch==='\n')state='code';continue}
    if(state==='block'){if(ch==='*'&&next==='/'){state='code';i++}continue}
    if(state==='string'){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch===quote){state='code';quote=''}
      continue;
    }
    if(state==='template'){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch==='`'){state='code'}
      continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue}
    if(ch==='/'&&next==='*'){state='block';i++;continue}
    if(ch==='\''||ch==='"'){state='string';quote=ch;continue}
    if(ch==='`'){state='template';continue}
    if(ch==='{'){depth++;continue}
    if(ch==='}'){
      depth--;
      if(depth===0)return [start,i+1];
      if(depth<0)return null;
    }
  }
  return null;
}

// Verify the one compatibility drawPlayer() is registration-only and can never
// paint a legacy body onto the Canvas.
const drawStart=html.indexOf('function drawPlayer(){');
if(drawStart>=0){
  const r=functionRange(html,drawStart);
  if(!r)fail('cannot parse canonical drawPlayer()');
  else{
    const body=html.slice(r[0],r[1]);
    if(!body.includes(canonicalMarker))fail('drawPlayer() is not the canonical Player3D compatibility owner');
    for(const bad of ['drawImage','fillRect','ellipse(','arc(','ANIM[','visualBody','phoneCharacter','playerUses','__PPA3D_LOCAL_PENDING','worldX','worldY','PPA_PLAYER3D.local']){
      if(body.includes(bad))fail('canonical drawPlayer() contains Canvas/legacy body token: '+bad);
    }
  }
}

// Diagnostic pass: enumerate any *other* named function that mixes canonical
// local-player coordinates with Canvas image drawing. It is intentionally
// reported as a warning until individually classified, avoiding false positives
// from effects/projectiles while still making hidden scene-specific renderers
// visible in every CI run.
const fnRe=/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
let m;
while((m=fnRe.exec(html))){
  const name=m[1];
  const r=functionRange(html,m.index);
  if(!r)continue;
  const body=html.slice(r[0],r[1]);
  const touchesLocal=/\bP\.(?:x|y|cls|classKey|anim|face|dir8)\b/.test(body);
  const paintsImage=/\b(?:cx|ctx|c)\.drawImage\s*\(/.test(body);
  if(name!=='drawPlayer'&&touchesLocal&&paintsImage){
    const legacyHint=/player|character|sprite|body|anim/i.test(name+' '+body.slice(0,500));
    const msg=`candidate local Canvas image path: ${name} (legacyHint=${legacyHint?'yes':'no'}, bytes=${body.length})`;
    warn(msg);
  }
  fnRe.lastIndex=r[1];
}

// Strong fallback signature: a direct Canvas image draw using a local-player
// class animation table would be a definite ownership violation even if it is
// inside an anonymous callback.
if(/drawImage\s*\([^\n;]{0,220}(?:P\.anim|P\.dir8|P\.face)/.test(html)){
  fail('anonymous/direct Canvas drawImage path is still driven by local player animation state');
}

for(const w of warnings)console.warn('[PLAYER RENDER AUDIT WARN] '+w);
if(failures.length){
  for(const f of failures)console.error('[PLAYER RENDER AUDIT FAIL] '+f);
  throw new Error('Player render ownership audit failed with '+failures.length+' invariant violation(s)');
}
console.log('Player render ownership audit passed: real local/remote players are Player3D-owned; retired 2D player symbols are absent.');
console.log('Player render ownership diagnostic candidates: '+warnings.length);