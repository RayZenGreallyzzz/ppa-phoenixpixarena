import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
const remotePath=path.join(ROOT,'public','game','remote-player-3d-dispatch.js');

if(!fs.existsSync(htmlPath))throw new Error('Arena Player3D stress postbuild: public/index.html missing');
if(!fs.existsSync(remotePath))throw new Error('Arena Player3D stress postbuild: remote dispatcher missing');

const remote=fs.readFileSync(remotePath,'utf8');
for(const marker of [
  'PPA_PLAYER3D_ARENA_STRESS_20261005',
  '__PPA_REMOTE_PLAYER3D_DISPATCH_V3',
  'PPA_3D_STRESS_CLASSES'
]){
  if(!remote.includes(marker))throw new Error('Arena Player3D stress postbuild: missing '+marker);
}

let html=fs.readFileSync(htmlPath,'utf8');
const rx=/remote-player-3d-dispatch\.js\?v=[^"']+/g;
const matches=html.match(rx)||[];
if(matches.length!==1)throw new Error('Arena Player3D stress postbuild: expected one remote dispatcher tag, found '+matches.length);
html=html.replace(rx,'remote-player-3d-dispatch.js?v=20261005arena3d1');

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v655-arena-player3d-stress-20261005">');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] Arena + stress bots use unified Player3D · cache v20261005arena3d1');
