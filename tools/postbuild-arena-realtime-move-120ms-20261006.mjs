import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const runtimePath=path.join(ROOT,'public','game','realtime-client.js');
const htmlPath=path.join(ROOT,'public','index.html');
for(const p of [runtimePath,htmlPath]){
  if(!fs.existsSync(p))throw new Error('Arena realtime 120ms test: missing '+p);
}

let runtime=fs.readFileSync(runtimePath,'utf8');
let html=fs.readFileSync(htmlPath,'utf8');

const oldCadence="var now=Date.now();if(!force&&now-RT.lastMove<220)return;";
const newCadence="var now=Date.now(),arenaFast=!!(RT.arenaRoom||RT.arenaMatchId);try{var _ars=String(typeof P!=='undefined'&&P?P.scene:'');arenaFast=arenaFast||_ars==='pvp1'||_ars==='pvpteam'}catch(_){}var moveMin=arenaFast?120:220;/* PPA_ARENA_MOVE_120MS_20261006 */if(!force&&now-RT.lastMove<moveMin)return;";
const cadenceCount=runtime.split(oldCadence).length-1;
if(cadenceCount!==1)throw new Error('Arena realtime 120ms test: cadence target count='+cadenceCount);
runtime=runtime.replace(oldCadence,newCadence);
if(!runtime.includes('PPA_ARENA_MOVE_120MS_20261006'))throw new Error('Arena realtime 120ms test: marker missing');
fs.writeFileSync(runtimePath,runtime,'utf8');

const rtRx=/realtime-client\.js\?v=[^"']+/g;
const matches=html.match(rtRx)||[];
if(matches.length!==1)throw new Error('Arena realtime 120ms test: realtime-client tag count='+matches.length);
html=html.replace(rtRx,'realtime-client.js?v=20261006arena120');

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
const nextMeta='<meta name="ppa-client-build" content="v668-arena-realtime-120ms-20261006">';
if(buildMeta.test(html))html=html.replace(buildMeta,nextMeta);
else{
  const headRx=/<head(?:\s[^>]*)?>/i;
  if(!headRx.test(html))throw new Error('Arena realtime 120ms test: <head> missing');
  html=html.replace(headRx,m=>m+'\n'+nextMeta);
}
fs.writeFileSync(htmlPath,html,'utf8');

console.log('[PPA BUILD] v668 arena realtime test: movement cadence 120ms in pvp1/pvpteam only; world remains 220ms');
