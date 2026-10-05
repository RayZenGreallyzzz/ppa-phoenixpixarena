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

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(!buildMeta.test(html))throw new Error('Combined low-FPS sync test: build meta missing');
html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v666-combined-lowfps-sync-test-20261005">');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] v666 combined test applied: frame-time movement + canonical remote Player3D + dungeon materialize 600 + mobile smoothing 50 ms + mob cache-bust');
