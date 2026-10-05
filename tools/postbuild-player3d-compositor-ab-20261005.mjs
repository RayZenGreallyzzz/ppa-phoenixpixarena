import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const runtimePath=path.join(root,'public','game','player-3d-unified-runtime.js');
const htmlPath=path.join(root,'public','index.html');

function replaceOnce(text,from,to,label){
  const first=text.indexOf(from);
  if(first<0)throw new Error('Player3D compositor A/B: missing '+label);
  if(text.indexOf(from,first+from.length)>=0)throw new Error('Player3D compositor A/B: duplicate '+label);
  return text.slice(0,first)+to+text.slice(first+from.length);
}

let runtime=fs.readFileSync(runtimePath,'utf8');

runtime=replaceOnce(
  runtime,
  '      renderer.toneMapping=THREE.ACESFilmicToneMapping;\n      renderer.toneMappingExposure=1.18;',
  '      // PPA_PLAYER3D_COMPOSITOR_AB_20261005\n      // A/B test: remove the full-screen ACES pass on weak Android/WebView GPUs.\n      renderer.toneMapping=THREE.NoToneMapping;\n      renderer.toneMappingExposure=1;',
  'ACES tone mapping block'
);

runtime=replaceOnce(
  runtime,
  "      renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;filter:saturate(1.28) contrast(1.06) brightness(1.04);';",
  "      renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';",
  'full-screen CSS filter'
);

fs.writeFileSync(runtimePath,runtime,'utf8');

let html=fs.readFileSync(htmlPath,'utf8');
const rx=/player-3d-unified-runtime\.js\?v=[^"']+/g;
const matches=html.match(rx)||[];
if(matches.length!==1)throw new Error('Player3D compositor A/B: expected one runtime script tag, found '+matches.length);
html=html.replace(rx,'player-3d-unified-runtime.js?v=20261005comp1');
fs.writeFileSync(htmlPath,html,'utf8');

console.log('[PPA BUILD] Player3D compositor A/B: ACES OFF + CSS filter OFF · comp1');
