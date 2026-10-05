import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
const remotePath=path.join(ROOT,'public','game','remote-player-3d-dispatch.js');
const mobPath=path.join(ROOT,'public','game','dungeon-mob-events.js');
for(const p of [htmlPath,remotePath,mobPath])if(!fs.existsSync(p))throw new Error('Combined low-FPS sync test: missing '+p);

let html=fs.readFileSync(htmlPath,'utf8');
const remote=fs.readFileSync(remotePath,'utf8');
let mobs=fs.readFileSync(mobPath,'utf8');

const requiredHtml=['PPA_FRAME_TIME_PLAYER_MOVEMENT_20261005','P.x+P.vx*_moveFrameScale'];
for(const marker of requiredHtml)if(!html.includes(marker))throw new Error('Combined low-FPS sync test: missing movement invariant '+marker);
if(!remote.includes('PPA_REMOTE_CANONICAL_POSITION_20261005'))throw new Error('Combined low-FPS sync test: canonical remote position patch missing');

const materializeRx=/var MATERIALIZE_R=\d+;(?:\s*\/\/[^\n]*)?/;
if(!materializeRx.test(mobs))throw new Error('Combined low-FPS sync test: MATERIALIZE_R declaration missing');
mobs=mobs.replace(materializeRx,'var MATERIALIZE_R=600; // PPA_DUNGEON_CLIENT_MOB_BUDGET_20261005_V2');

const smoothRx=/var minStep=smoothMobile\(\)\?\d+:16;/;
if(!smoothRx.test(mobs))throw new Error('Combined low-FPS sync test: mobile smoothing declaration missing');
mobs=mobs.replace(smoothRx,'var minStep=smoothMobile()?50:16;');

if(!mobs.includes('var MATERIALIZE_R=600; // PPA_DUNGEON_CLIENT_MOB_BUDGET_20261005_V2'))throw new Error('Combined low-FPS sync test: materialize radius patch failed');
if(!mobs.includes('var minStep=smoothMobile()?50:16;'))throw new Error('Combined low-FPS sync test: mobile smoothing patch failed');
fs.writeFileSync(mobPath,mobs,'utf8');

const remoteRx=/remote-player-3d-dispatch\.js\?v=[^"']+/g;
const remoteMatches=html.match(remoteRx)||[];
if(remoteMatches.length!==1)throw new Error('Combined low-FPS sync test: expected one remote dispatcher tag, found '+remoteMatches.length);
html=html.replace(remoteRx,'remote-player-3d-dispatch.js?v=20261005sync5');

const mobRx=/dungeon-mob-events\.js\?v=[^"']+/g;
const mobMatches=html.match(mobRx)||[];
if(mobMatches.length!==1)throw new Error('Combined low-FPS sync test: expected one dungeon mob events tag, found '+mobMatches.length);
html=html.replace(mobRx,'dungeon-mob-events.js?v=20261005mob600');

// Keep the admin diagnostic isolated from gameplay assets. This cache bump only
// makes the 1/2/3/5 threshold buttons arrive immediately on Telegram/WebView.
const debugRx=/realtime-debug-bridge\.js\?v=[^"']+/g;
const debugMatches=html.match(debugRx)||[];
if(debugMatches.length!==1)throw new Error('Combined low-FPS sync test: expected one realtime debug bridge tag, found '+debugMatches.length);
html=html.replace(debugRx,'realtime-debug-bridge.js?v=20261005threshold1235');

// Some build variants currently omit the ppa-client-build meta entirely. The
// build marker is cache/diagnostic metadata, not a gameplay prerequisite, so do
// not fail a valid build because the old marker is absent: replace it when
// present, otherwise create it in <head>.
const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
const nextMeta='<meta name="ppa-client-build" content="v667-player3d-threshold-1235-20261005">';
if(buildMeta.test(html)){
  html=html.replace(buildMeta,nextMeta);
}else{
  const headRx=/<head(?:\s[^>]*)?>/i;
  if(!headRx.test(html))throw new Error('Combined low-FPS sync test: <head> missing for build meta');
  html=html.replace(headRx,m=>m+'\n'+nextMeta);
}
if(!html.includes(nextMeta))throw new Error('Combined low-FPS sync test: build meta injection failed');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] v667 threshold test: frame-time movement + canonical remote Player3D + dungeon materialize 600 + mobile smoothing 50 ms + LOCAL STRESS 1/2/3/5');
