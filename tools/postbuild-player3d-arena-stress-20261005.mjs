import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
const remotePath=path.join(ROOT,'public','game','remote-player-3d-dispatch.js');
const runtimePath=path.join(ROOT,'public','game','player-3d-unified-runtime.js');

for(const p of [htmlPath,remotePath,runtimePath]){
  if(!fs.existsSync(p))throw new Error('Arena Player3D stress postbuild: missing '+p);
}

function count(text,needle){return text.split(needle).length-1}
function balancedEnd(text,openAt){
  let depth=0,quote='',state='code',escaped=false;
  for(let i=openAt;i<text.length;i++){
    const ch=text[i],nx=text[i+1]||'';
    if(state==='line'){if(ch==='\n')state='code';continue}
    if(state==='block'){if(ch==='*'&&nx==='/'){state='code';i++;}continue}
    if(state==='string'){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch===quote){state='code';quote=''}
      continue;
    }
    if(ch==='/'&&nx==='/'){state='line';i++;continue}
    if(ch==='/'&&nx==='*'){state='block';i++;continue}
    if(ch==='\''||ch==='"'||ch==='`'){state='string';quote=ch;continue}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  throw new Error('Arena Player3D stress postbuild: unbalanced function');
}
function functionRange(text,signature){
  const start=text.indexOf(signature);
  if(start<0||text.indexOf(signature,start+signature.length)>=0)throw new Error('Arena Player3D stress postbuild: function anchor invalid '+signature);
  const open=text.indexOf('{',start),end=balancedEnd(text,open);
  return [start,open,end];
}

let runtime=fs.readFileSync(runtimePath,'utf8');
const registerOld=`  function registerRemote(r,a){
    if(!r||isStressBot(r))return false;
    const cls=normalizeClass(r.cls||r.classKey||r.className);`;
const registerNew=`  function registerRemote(r,a){
    /* PPA_PLAYER3D_ARENA_AI_STRESS_20261005 */
    if(!r)return false;
    const cls=normalizeClass(r.aiClass||r.__ppa3DClass||r.c||r.cls||r.classKey||r.className);`;
if(count(runtime,registerOld)!==1)throw new Error('Arena Player3D stress postbuild: runtime remote guard target changed');
runtime=runtime.replace(registerOld,registerNew);

const remoteAttackOld="const remoteAttack=String(r.anim||'').toLowerCase()==='attack';";
const remoteAttackNew="const remoteAttack=String(r.aiAnim||r.anim||'').toLowerCase()==='attack';";
if(count(runtime,remoteAttackOld)!==1)throw new Error('Arena Player3D stress postbuild: remote attack target changed');
runtime=runtime.replace(remoteAttackOld,remoteAttackNew);

const desiredOld="const r=e.data||{},a=String(r.anim||'').toLowerCase();";
const desiredNew="const r=e.data||{},a=String(r.aiAnim||r.anim||'').toLowerCase();";
if(count(runtime,desiredOld)!==1)throw new Error('Arena Player3D stress postbuild: desired animation target changed');
runtime=runtime.replace(desiredOld,desiredNew);

const hiddenOld="const hidden=e.kind==='remote'&&Number(e.data&&e.data.hiddenUntil)>wallNow;";
const hiddenNew="const hidden=e.kind==='remote'&&Number(e.data&&(e.data.aiHiddenUntil||e.data.hiddenUntil))>wallNow;";
if(count(runtime,hiddenOld)!==1)throw new Error('Arena Player3D stress postbuild: hidden target changed');
runtime=runtime.replace(hiddenOld,hiddenNew);

const hudHiddenOld="if(remote&&Number(r.hiddenUntil)>wallNow)hx.globalAlpha=.38;";
const hudHiddenNew="if(remote&&Number(r.aiHiddenUntil||r.hiddenUntil)>wallNow)hx.globalAlpha=.38;";
if(count(runtime,hudHiddenOld)!==1)throw new Error('Arena Player3D stress postbuild: HUD hidden target changed');
runtime=runtime.replace(hudHiddenOld,hudHiddenNew);

fs.writeFileSync(runtimePath,runtime,'utf8');

const remote=fs.readFileSync(remotePath,'utf8');
for(const marker of [
  'PPA_PLAYER3D_ARENA_STRESS_20261005',
  '__PPA_REMOTE_PLAYER3D_DISPATCH_V3',
  'PPA_3D_STRESS_CLASSES'
]){
  if(!remote.includes(marker))throw new Error('Arena Player3D stress postbuild: missing '+marker);
}

let html=fs.readFileSync(htmlPath,'utf8');
const aiSig='function v174DrawAiTrainingFighter(e,sx,sy){';
const [aiStart,aiOpen,aiEnd]=functionRange(html,aiSig);
let aiFn=html.slice(aiStart,aiEnd+1);
const primitive="cx.fillStyle='#9d63db';cx.beginPath();cx.arc(sx,sy-10,aiVisualSize*.35,0,Math.PI*2);cx.fill();";
if(count(aiFn,primitive)!==1)throw new Error('Arena Player3D stress postbuild: AI primitive body target changed');
const aiBridge=`
  /* PPA_AI_TRAINING_PLAYER3D_20261005 */
  try{
    if(e){
      e.cls=e.aiClass||e.cls;
      e.anim=e.aiAnim||e.anim||'idle';
      e.name=(e.type&&e.type.n)?String(e.type.n):('ИИ · '+String(e.aiClass||'fighter'));
      e.hasPos=true;
      e.scene='pvp1';
      e.hiddenUntil=Math.max(Number(e.hiddenUntil)||0,Number(e.aiHiddenUntil)||0);
      if(e.aiAnim==='attack'&&typeof P!=='undefined'&&P){
        const dx=Number(P.x)-Number(e.x);
        if(Math.abs(dx)>.01)e.face=dx<0?-1:1;
      }
      let a=e.__ppaAi3DAnchor;
      if(!a)a=e.__ppaAi3DAnchor={classKey:'',worldX:0,worldY:0,nearCount:1,scene:'pvp1'};
      a.classKey=String(e.aiClass||e.cls||'assassin');
      a.worldX=Number(e.x);a.worldY=Number(e.y);a.scene='pvp1';a.nearCount=1;
      if(window.PPA_PLAYER3D&&typeof window.PPA_PLAYER3D.remote==='function')window.PPA_PLAYER3D.remote(e,a);
    }
  }catch(_){}
`;
aiFn=aiFn.slice(0,aiOpen-aiStart+1)+aiBridge+aiFn.slice(aiOpen-aiStart+1);
aiFn=aiFn.replace(primitive,'/* PPA_AI_TRAINING_BODY_OWNED_BY_PLAYER3D_20261005 */');
html=html.slice(0,aiStart)+aiFn+html.slice(aiEnd+1);

if(html.includes(primitive))throw new Error('Arena Player3D stress postbuild: old AI primitive body survived');
if(!html.includes('PPA_AI_TRAINING_PLAYER3D_20261005'))throw new Error('Arena Player3D stress postbuild: AI Player3D bridge missing');

const remoteRx=/remote-player-3d-dispatch\.js\?v=[^"']+/g;
const remoteMatches=html.match(remoteRx)||[];
if(remoteMatches.length!==1)throw new Error('Arena Player3D stress postbuild: expected one remote dispatcher tag, found '+remoteMatches.length);
html=html.replace(remoteRx,'remote-player-3d-dispatch.js?v=20261005arena3d2');

const runtimeRx=/player-3d-unified-runtime\.js\?v=[^"']+/g;
const runtimeMatches=html.match(runtimeRx)||[];
if(runtimeMatches.length!==1)throw new Error('Arena Player3D stress postbuild: expected one unified runtime tag, found '+runtimeMatches.length);
html=html.replace(runtimeRx,'player-3d-unified-runtime.js?v=20261005u20');

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v656-arena-ai-player3d-stress-20261005">');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] Arena AI + real players + stress bots use unified Player3D · runtime u20 · dispatcher arena3d2');
