import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const runtimePath=path.join(ROOT,'public','game','player-3d-unified-runtime.js');
const htmlPath=path.join(ROOT,'public','index.html');
for(const p of [runtimePath,htmlPath])if(!fs.existsSync(p))throw new Error('Player3D low-end budget: missing '+p);

function count(text,needle){return text.split(needle).length-1}
function replaceOnce(text,oldText,newText,label){
  const n=count(text,oldText);
  if(n!==1)throw new Error('Player3D low-end budget: '+label+' anchor count '+n);
  return text.replace(oldText,newText);
}

let src=fs.readFileSync(runtimePath,'utf8');
if(!src.includes('PPA_PLAYER3D_ARENA_AI_STRESS_20261005'))throw new Error('Player3D low-end budget: arena/stress Player3D patch must run first');

const stateOld="  let cameraYaw=0,lastW=0,lastH=0,lastFrameAt=performance.now(),frames=0,lastFpsAt=performance.now(),fps=0;";
const stateNew=`  let cameraYaw=0,lastW=0,lastH=0,lastFrameAt=performance.now(),frames=0,lastFpsAt=performance.now(),fps=0;
  // PPA_PLAYER3D_LOWEND_BUDGET_20261005
  const PPA_UA=String((typeof navigator!=='undefined'&&navigator.userAgent)||'');
  const PPA_DEVICE_MEMORY=Math.max(0,Number((typeof navigator!=='undefined'&&navigator.deviceMemory)||0));
  const PPA_CPU_CORES=Math.max(0,Number((typeof navigator!=='undefined'&&navigator.hardwareConcurrency)||0));
  const PPA_ANDROID=/Android/i.test(PPA_UA);
  const PPA_MOBILE_LIKE=PPA_ANDROID||/iPhone|iPad|iPod/i.test(PPA_UA)||!!(typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches);
  const PPA_LOW_END_DEVICE=PPA_MOBILE_LIKE&&((PPA_DEVICE_MEMORY>0&&PPA_DEVICE_MEMORY<=4)||(PPA_CPU_CORES>0&&PPA_CPU_CORES<=4)||(PPA_ANDROID&&PPA_DEVICE_MEMORY===0));
  let ppaLast3DRenderAt=0,ppaLastVisible=0,ppaSkippedRafs=0;
  let ppaLastMixerUpdates=0,ppaLastFrameMs=0,ppaLastLogicMs=0,ppaLastRenderSubmitMs=0;
  let ppaLastDrawCalls=0,ppaLastTriangles=0,ppaLastLines=0,ppaLastPoints=0;
  let ppaPerfHud=null,ppaPerfHudAt=0;
  const PPA_HUD_TEXT_CACHE=new Map();
  function ppa3DMinFrameMs(visible){
    visible=Math.max(0,Number(visible)||0);
    if(PPA_LOW_END_DEVICE){
      if(visible>=9)return 33.34;
      if(visible>=5)return 25.00;
    }
    if(PPA_MOBILE_LIKE&&visible>=12)return 25.00;
    if(!PPA_MOBILE_LIKE&&visible>=18)return 20.00;
    return 0;
  }
  function ppaHudTextBitmap(text,font,fill){
    text=String(text||'');font=String(font||'12px Arial');fill=String(fill||'#fff');
    const key=font+'\\n'+fill+'\\n'+text;
    let rec=PPA_HUD_TEXT_CACHE.get(key);
    if(rec){rec.used=performance.now();return rec}
    const probe=document.createElement('canvas'),pg=probe.getContext('2d');
    pg.font=font;
    const w=Math.max(8,Math.ceil(pg.measureText(text).width)+8),h=20;
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const g=c.getContext('2d');g.font=font;g.textAlign='center';g.textBaseline='bottom';
    g.lineJoin='round';g.lineWidth=2.4;g.strokeStyle='rgba(18,8,5,.92)';g.fillStyle=fill;
    g.strokeText(text,w*.5,h-2);g.fillText(text,w*.5,h-2);
    rec={canvas:c,w,h,used:performance.now()};PPA_HUD_TEXT_CACHE.set(key,rec);
    if(PPA_HUD_TEXT_CACHE.size>96){
      let oldestKey=null,oldest=Infinity;
      for(const [k,v] of PPA_HUD_TEXT_CACHE){if(v.used<oldest){oldest=v.used;oldestKey=k}}
      if(oldestKey!==null)PPA_HUD_TEXT_CACHE.delete(oldestKey);
    }
    return rec;
  }
  function ppaHasPerfTestEntity(){
    for(const e of instances){
      const v=e&&e[1];
      if(v&&v.kind==='remote'&&v.data&&(isStressBot(v.data)||v.data.isAiFighter))return true;
    }
    return false;
  }
  function ppaUpdatePerfHud(now){
    if(now-ppaPerfHudAt<500)return;ppaPerfHudAt=now;
    const show=ppaHasPerfTestEntity();
    if(!show){if(ppaPerfHud)ppaPerfHud.style.display='none';return}
    if(!ppaPerfHud){
      ppaPerfHud=document.createElement('div');ppaPerfHud.id='ppaPlayer3DPerfHud';
      ppaPerfHud.style.cssText='position:fixed;left:8px;top:82px;z-index:2147483500;pointer-events:none;padding:3px 6px;border:1px solid rgba(92,210,255,.55);border-radius:4px;background:rgba(0,0,0,.68);color:#dff7ff;font:10px/1.25 monospace;white-space:pre;text-shadow:0 1px 1px #000';
      document.body.appendChild(ppaPerfHud);
    }
    ppaPerfHud.style.display='block';
    const tri=ppaLastTriangles>=1000000?(ppaLastTriangles/1000000).toFixed(2)+'M':Math.round(ppaLastTriangles/1000)+'k';
    ppaPerfHud.textContent='3D '+fps+'fps  V:'+ppaLastVisible+'  calls:'+ppaLastDrawCalls+'  tri:'+tri+'\\nMIX:'+ppaLastMixerUpdates+'  CPU:'+ppaLastLogicMs.toFixed(1)+'ms  submit:'+ppaLastRenderSubmitMs.toFixed(1)+'ms';
  }`;
src=replaceOnce(src,stateOld,stateNew,'device/perf state');

const materialCloneOld=`      const clone=SkeletonUtils.clone(a.scene);
      clone.traverse(o=>{
        if(!o||!o.material)return;
        try{
          if(Array.isArray(o.material))o.material=o.material.map(m=>m&&m.clone?m.clone():m);
          else if(o.material.clone)o.material=o.material.clone();
        }catch(_){}
      });`;
const materialCloneNew=`      const clone=SkeletonUtils.clone(a.scene);
      // PPA_PLAYER3D_SHARED_MATERIALS_20261005
      // Geometry, textures and materials remain shared until opacity diverges.`;
src=replaceOnce(src,materialCloneOld,materialCloneNew,'eager material cloning');

const hiddenOld=`  function applyHidden(e,wallNow){
    if(!e.model)return;
    const hidden=e.kind==='remote'&&Number(e.data&&(e.data.aiHiddenUntil||e.data.hiddenUntil))>wallNow;
    if(e.hiddenState===hidden)return;
    e.hiddenState=hidden;
    e.model.traverse(o=>{`;
const hiddenNew=`  function isolateMaterialsForHidden(e){
    if(!e||!e.model||e.materialsIsolated)return;
    e.model.traverse(o=>{
      if(!o||!o.material)return;
      try{
        if(Array.isArray(o.material))o.material=o.material.map(m=>m&&m.clone?m.clone():m);
        else if(o.material.clone)o.material=o.material.clone();
      }catch(_){}
    });
    e.materialsIsolated=true;
  }
  function applyHidden(e,wallNow){
    if(!e.model)return;
    const hidden=e.kind==='remote'&&Number(e.data&&(e.data.aiHiddenUntil||e.data.hiddenUntil))>wallNow;
    if(e.hiddenState===hidden)return;
    if(!hidden&&e.hiddenState===null){e.hiddenState=false;return}
    if(hidden)isolateMaterialsForHidden(e);
    e.hiddenState=hidden;
    e.model.traverse(o=>{`;
src=replaceOnce(src,hiddenOld,hiddenNew,'lazy hidden materials');

const textOld=`  function textStrokeFill(text,x,y,font,fill){
    hx.font=font;hx.textAlign='center';hx.textBaseline='bottom';hx.lineJoin='round';hx.lineWidth=2.4;
    hx.strokeStyle='rgba(18,8,5,.92)';hx.strokeText(text,x,y);hx.fillStyle=fill;hx.fillText(text,x,y);
  }`;
const textNew=`  function textStrokeFill(text,x,y,font,fill){
    const rec=ppaHudTextBitmap(text,font,fill);
    hx.drawImage(rec.canvas,Math.round(x-rec.w*.5),Math.round(y-(rec.h-2)));
  }`;
src=replaceOnce(src,textOld,textNew,'HUD text cache');

const staleOld=`      if(!e.alive||(e.kind==='remote'&&now-e.seenAt>1800)){removeEntry(id,e);continue}`;
const staleNew=`      const ppaRemoteStaleMs=e.kind==='remote'&&e.data&&(isStressBot(e.data)||e.data.isAiFighter)?300:1800;
      if(!e.alive||(e.kind==='remote'&&now-e.seenAt>ppaRemoteStaleMs)){removeEntry(id,e);continue}`;
src=replaceOnce(src,staleOld,staleNew,'test entity TTL');

const frameStartOld=`    syncLocalFromGame(now);
    const view=resize();if(!view)return;`;
const frameStartNew=`    syncLocalFromGame(now);
    const ppaMinFrameMs=ppa3DMinFrameMs(ppaLastVisible);
    if(ppaMinFrameMs>0&&now-ppaLast3DRenderAt<ppaMinFrameMs){ppaSkippedRafs++;return}
    ppaLast3DRenderAt=now;
    const ppaFrameStart=performance.now();
    let ppaVisibleNow=0,ppaMixerNow=0;
    const view=resize();if(!view)return;`;
src=replaceOnce(src,frameStartOld,frameStartNew,'adaptive frame start');

const visibleOld=`      if(!mapped){e.root.visible=false;continue}
      e.root.visible=true;`;
const visibleNew=`      if(!mapped){e.root.visible=false;continue}
      e.root.visible=true;
      ppaVisibleNow++;`;
src=replaceOnce(src,visibleOld,visibleNew,'visible counter');

const mixerOld=`      try{if(e.mixer)e.mixer.update(dt)}catch(_){}`;
const mixerNew=`      try{if(e.mixer){e.mixer.update(dt);ppaMixerNow++}}catch(_){}`;
src=replaceOnce(src,mixerOld,mixerNew,'mixer counter');

const renderOld=`    try{renderer.render(scene,camera)}catch(_){}
    frames++;
    if(now-lastFpsAt>=1000){fps=Math.round(frames*1000/(now-lastFpsAt));frames=0;lastFpsAt=now}`;
const renderNew=`    const ppaBeforeRender=performance.now();
    try{renderer.render(scene,camera)}catch(_){}
    const ppaAfterRender=performance.now();
    ppaLastVisible=ppaVisibleNow;
    ppaLastMixerUpdates=ppaMixerNow;
    ppaLastLogicMs=Math.max(0,ppaBeforeRender-ppaFrameStart);
    ppaLastRenderSubmitMs=Math.max(0,ppaAfterRender-ppaBeforeRender);
    ppaLastFrameMs=Math.max(0,ppaAfterRender-ppaFrameStart);
    try{
      const ri=renderer.info&&renderer.info.render;
      if(ri){
        ppaLastDrawCalls=Number(ri.calls)||0;
        ppaLastTriangles=Number(ri.triangles)||0;
        ppaLastLines=Number(ri.lines)||0;
        ppaLastPoints=Number(ri.points)||0;
      }
    }catch(_){}
    frames++;
    if(now-lastFpsAt>=1000){fps=Math.round(frames*1000/(now-lastFpsAt));frames=0;lastFpsAt=now}
    ppaUpdatePerfHud(now);`;
src=replaceOnce(src,renderOld,renderNew,'render diagnostics');

const diagOld=`      version:'unified-v9-anim-speed-hotloop-fix',fps,
      instances:`;
const diagNew=`      version:'unified-v9-anim-speed-hotloop-fix',fps,
      perfVersion:'lowend-budget-v2',
      device:{mobile:PPA_MOBILE_LIKE,android:PPA_ANDROID,lowEnd:PPA_LOW_END_DEVICE,deviceMemoryGB:PPA_DEVICE_MEMORY,cpuCores:PPA_CPU_CORES},
      render:{visible:ppaLastVisible,targetMinFrameMs:ppa3DMinFrameMs(ppaLastVisible),drawCalls:ppaLastDrawCalls,triangles:ppaLastTriangles,lines:ppaLastLines,points:ppaLastPoints,mixerUpdates:ppaLastMixerUpdates,frameMs:Number(ppaLastFrameMs.toFixed(2)),logicMs:Number(ppaLastLogicMs.toFixed(2)),renderSubmitMs:Number(ppaLastRenderSubmitMs.toFixed(2)),skippedRafs:ppaSkippedRafs},
      memory:{geometries:Number(renderer&&renderer.info&&renderer.info.memory&&renderer.info.memory.geometries)||0,textures:Number(renderer&&renderer.info&&renderer.info.memory&&renderer.info.memory.textures)||0},
      hudTextCache:PPA_HUD_TEXT_CACHE.size,
      instances:`;
src=replaceOnce(src,diagOld,diagNew,'diag payload');

for(const marker of ['PPA_PLAYER3D_LOWEND_BUDGET_20261005','PPA_PLAYER3D_SHARED_MATERIALS_20261005'])if(!src.includes(marker))throw new Error('Player3D low-end budget: marker missing '+marker);
if(src.includes('clone.traverse(o=>{\n        if(!o||!o.material)return;'))throw new Error('Player3D low-end budget: eager material clone survived');
fs.writeFileSync(runtimePath,src,'utf8');

let html=fs.readFileSync(htmlPath,'utf8');
const runtimeRx=/player-3d-unified-runtime\.js\?v=[^"']+/g;
const matches=html.match(runtimeRx)||[];
if(matches.length!==1)throw new Error('Player3D low-end budget: expected one runtime tag, found '+matches.length);
html=html.replace(runtimeRx,'player-3d-unified-runtime.js?v=20261005u21lowend2');
const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v658-player3d-lowend-budget2-20261005">');
fs.writeFileSync(htmlPath,html,'utf8');

console.log('[PPA BUILD] Player3D low-end budget v2: shared materials + cached HUD + fast test TTL + adaptive 60/40/30 Hz + diagnostics · u21lowend2');
