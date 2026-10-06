import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const runtimePath=path.join(ROOT,'public','game','player-3d-unified-runtime.js');
const htmlPath=path.join(ROOT,'public','index.html');
for(const p of [runtimePath,htmlPath])if(!fs.existsSync(p))throw new Error('Player3D stress LOD35 cache: missing '+p);

const runtime=fs.readFileSync(runtimePath,'utf8');
if(!runtime.includes('PPA_PLAYER3D_STRESS_BUILD_LOD35_20261006'))throw new Error('Player3D stress LOD35 cache: stress LOD marker missing');
if(runtime.includes('PPA_PLAYER3D_DISTANCE_LOD_20261006'))throw new Error('Player3D stress LOD35 cache: distance LOD must not be active');

let html=fs.readFileSync(htmlPath,'utf8');
const rx=/player-3d-unified-runtime\.js\?v=[^"']+/g;
const matches=html.match(rx)||[];
if(matches.length!==1)throw new Error('Player3D stress LOD35 cache: runtime script tag count='+matches.length);
html=html.replace(rx,'player-3d-unified-runtime.js?v=20261006stresslod35rollback2');
const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v670-player3d-stress-lod35-rollback-20261006">');
fs.writeFileSync(htmlPath,html,'utf8');

console.log('[PPA BUILD] Player3D rollback: real players + AI full quality; stress bots use static LOD35 only');
