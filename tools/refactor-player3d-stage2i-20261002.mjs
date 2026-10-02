import fs from 'node:fs';

function replaceExact(path, from, to, expected=1){
  let s=fs.readFileSync(path,'utf8');
  const n=s.split(from).length-1;
  if(n!==expected)throw new Error(`${path}: expected ${expected} occurrence(s), got ${n}: ${from.slice(0,120)}`);
  s=s.split(from).join(to);
  fs.writeFileSync(path,s,'utf8');
}
function assertIncludes(path, needle){
  const s=fs.readFileSync(path,'utf8');
  if(!s.includes(needle))throw new Error(`${path}: missing expected token ${needle}`);
}

const oldRemote='gateway/remote-sprite-renderer.js';
const newRemote='gateway/remote-player-3d-dispatch.js';
const mobile='gateway/mobile-sprite-performance.js';
if(!fs.existsSync(oldRemote)||fs.existsSync(newRemote))throw new Error('Stage 2I: remote source rename precondition failed');
if(!fs.existsSync(mobile))throw new Error('Stage 2I: mobile no-op helper missing');
let remote=fs.readFileSync(oldRemote,'utf8');
if(remote.includes('v174AiSpriteCfg')||remote.includes('drawImage')||remote.includes('phoneCharacterBodySize'))throw new Error('Stage 2I: remote module still contains sprite renderer code');
if(!remote.includes("PPA_PLAYER3D.remote(r,anchor)"))throw new Error('Stage 2I: remote module is not Player3D dispatch');
remote=remote.replaceAll('__PPA_REMOTE3D_ADAPTER_V2','__PPA_REMOTE_PLAYER3D_DISPATCH_V1');
fs.writeFileSync(newRemote,remote,'utf8');
fs.unlinkSync(oldRemote);
fs.unlinkSync(mobile);

const build='build.mjs';
replaceExact(build,"const remoteSprite=fs.readFileSync(path.join(ROOT,'gateway/remote-sprite-renderer.js'),'utf8');","const remotePlayer3dDispatch=fs.readFileSync(path.join(ROOT,'gateway/remote-player-3d-dispatch.js'),'utf8');");
replaceExact(build,"\nconst mobilePerf=fs.readFileSync(path.join(ROOT,'gateway/mobile-sprite-performance.js'),'utf8');",'');
replaceExact(build,"if (remoteSprite.includes('forcedAttack') || remoteSprite.includes('__ppaAttackDir')) {","if (remotePlayer3dDispatch.includes('forcedAttack') || remotePlayer3dDispatch.includes('__ppaAttackDir')) {");
replaceExact(build,"if (!mobilePerf.includes('__PPA_MOBILE_SPRITE_PERF_V2') ||\n      !mobilePerf.includes('imageCache') ||\n      !remoteSprite.includes('canvasHitMetrics(now)') ||","if (!remotePlayer3dDispatch.includes('canvasHitMetrics(now)') ||");
replaceExact(build,"  ['gateway/mobile-sprite-performance.js','mobile-sprite-performance.js','Mobile sprite performance helper missing'],\n",'');
replaceExact(build,"  ['gateway/remote-sprite-renderer.js','remote-sprite-renderer.js','Remote sprite renderer missing'],","  ['gateway/remote-player-3d-dispatch.js','remote-player-3d-dispatch.js','Remote Player3D dispatch missing'],");
replaceExact(build,"<script src=\"${js('mobile-sprite-performance.js')}\"></script>\\\n",'');
replaceExact(build,"<script src=\"${js('remote-sprite-renderer.js')}\"></script>\\\n","<script src=\"${js('remote-player-3d-dispatch.js')}\"></script>\\\n");
replaceExact(build,"console.log('Mobile sprite performance: /game/mobile-sprite-performance.js');\n",'');
replaceExact(build,"console.log('Remote player sprites: /game/remote-sprite-renderer.js');","console.log('Remote Player3D dispatch: /game/remote-player-3d-dispatch.js');");

const post='tools/postbuild-player-3d-unified-20261002.mjs';
replaceExact(post,"const remoteSrc=path.join(ROOT,'gateway','remote-sprite-renderer.js');","const remoteSrc=path.join(ROOT,'gateway','remote-player-3d-dispatch.js');");
replaceExact(post,"const remoteDst=path.join(gameDir,'remote-sprite-renderer.js');","const remoteDst=path.join(gameDir,'remote-player-3d-dispatch.js');");
replaceExact(post,"html=html.replace(/remote-sprite-renderer\\.js\\?v=[^\"']+/g,'remote-sprite-renderer.js?v=20261002u4');","html=html.replace(/remote-player-3d-dispatch\\.js\\?v=[^\"']+/g,'remote-player-3d-dispatch.js?v=20261002u5');");

const unified='.github/workflows/test-unified-player3d.yml';
let u=fs.readFileSync(unified,'utf8');
u=u.replaceAll('gateway/remote-sprite-renderer.js','gateway/remote-player-3d-dispatch.js');
u=u.replaceAll('public/game/remote-sprite-renderer.js','public/game/remote-player-3d-dispatch.js');
u=u.replaceAll('__PPA_REMOTE3D_ADAPTER_V2','__PPA_REMOTE_PLAYER3D_DISPATCH_V1');
u=u.replaceAll('remote-sprite-renderer.js?v=20261002u4','remote-player-3d-dispatch.js?v=20261002u5');
fs.writeFileSync(unified,u,'utf8');

const preload='.github/workflows/test-player-sprite-preload-cleanup.yml';
let p=fs.readFileSync(preload,'utf8');
p=p.replace("      - run: node --check gateway/mobile-sprite-performance.js\n",'');
p=p.replace("      - name: Verify mobile sprite helper is AI-only\n        run: |\n          ! grep -Eq \"playerAnimDef|playerUses[A-Za-z]*Sprites|wrapPlayer\" gateway/mobile-sprite-performance.js\n          grep -q \"v174AiSpriteCfg\" gateway/mobile-sprite-performance.js\n          grep -q \"playerSprites:false\" gateway/mobile-sprite-performance.js\n","      - name: Verify obsolete mobile sprite wrapper is removed\n        run: |\n          test ! -e gateway/mobile-sprite-performance.js\n");
p=p.replace("          grep -q \"mobile-sprite-performance.js?v=20261002ai3\" public/index.html\n          ! grep -Eq \"playerAnimDef|playerUses[A-Za-z]*Sprites|wrapPlayer\" public/game/mobile-sprite-performance.js\n          grep -q \"v174AiSpriteCfg\" public/game/mobile-sprite-performance.js\n","          ! grep -q \"mobile-sprite-performance.js\" public/index.html\n          test ! -e public/game/mobile-sprite-performance.js\n");
fs.writeFileSync(preload,p,'utf8');

assertIncludes(build,"remote-player-3d-dispatch.js");
assertIncludes(post,"remote-player-3d-dispatch.js?v=20261002u5");
assertIncludes(unified,"__PPA_REMOTE_PLAYER3D_DISPATCH_V1");
for(const path of [build,post,unified,preload]){
 const s=fs.readFileSync(path,'utf8');
 if(s.includes('remote-sprite-renderer.js'))throw new Error(`${path}: old remote filename survived`);
}
if(fs.readFileSync(build,'utf8').includes('mobile-sprite-performance.js'))throw new Error('build.mjs: obsolete mobile helper survived');
console.log('Stage 2I refactor complete: remote real-player path named as Player3D dispatch; obsolete mobile sprite wrapper removed');
