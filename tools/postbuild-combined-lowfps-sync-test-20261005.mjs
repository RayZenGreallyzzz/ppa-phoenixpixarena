import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
const remotePath=path.join(ROOT,'public','game','remote-player-3d-dispatch.js');
const mobPath=path.join(ROOT,'public','game','dungeon-mob-events.js');
for(const p of [htmlPath,remotePath,mobPath])if(!fs.existsSync(p))throw new Error('Combined low-FPS sync test: missing '+p);

let html=fs.readFileSync(htmlPath,'utf8');
const remote=fs.readFileSync(remotePath,'utf8');
const mobs=fs.readFileSync(mobPath,'utf8');

const requiredHtml=['PPA_FRAME_TIME_PLAYER_MOVEMENT_20261005','P.x+P.vx*_moveFrameScale'];
for(const marker of requiredHtml)if(!html.includes(marker))throw new Error('Combined low-FPS sync test: missing movement invariant '+marker);
if(!remote.includes('PPA_REMOTE_CANONICAL_POSITION_20261005'))throw new Error('Combined low-FPS sync test: canonical remote position patch missing');
if(!mobs.includes('var MATERIALIZE_R=600; // PPA_DUNGEON_CLIENT_MOB_BUDGET_20261005_V2'))throw new Error('Combined low-FPS sync test: materialize radius is not 600');
if(!mobs.includes('var minStep=smoothMobile()?50:16;'))throw new Error('Combined low-FPS sync test: mobile smoothing is not 50 ms');

const remoteRx=/remote-player-3d-dispatch\.js\?v=[^"']+/g;
const remoteMatches=html.match(remoteRx)||[];
if(remoteMatches.length!==1)throw new Error('Combined low-FPS sync test: expected one remote dispatcher tag, found '+remoteMatches.length);
html=html.replace(remoteRx,'remote-player-3d-dispatch.js?v=20261005sync3');

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(!buildMeta.test(html))throw new Error('Combined low-FPS sync test: build meta missing');
html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v664-combined-lowfps-sync-test-20261005">');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] v664 combined test: frame-time player movement + canonical remote Player3D + dungeon materialize 600 + mobile mob smoothing 50 ms');
