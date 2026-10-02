import fs from 'node:fs';

const p='gateway/player-3d-unified-runtime.js';
let s=fs.readFileSync(p,'utf8');
function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1)throw new Error(`Stage 4B ${label}: expected 1 target, got ${n}`);
  s=s.replace(from,to);
}

once(
"  function applyHidden(e){\n    if(!e.model)return;\n    const hidden=e.kind==='remote'&&Number(e.data&&e.data.hiddenUntil)>Date.now();",
"  function applyHidden(e,wallNow){\n    if(!e.model)return;\n    const hidden=e.kind==='remote'&&Number(e.data&&e.data.hiddenUntil)>wallNow;",
'pass frame wall clock to hidden state');

once(
"  function drawHud(e){\n    if(!hx||!e.hud)return;\n    const h=e.hud,remote=e.kind==='remote',r=e.data||{};\n    hx.save();\n    if(remote&&Number(r.hiddenUntil)>Date.now())hx.globalAlpha=.38;",
"  function drawHud(e,wallNow){\n    if(!hx||!e.hud)return;\n    const h=e.hud,remote=e.kind==='remote',r=e.data||{};\n    hx.save();\n    if(remote&&Number(r.hiddenUntil)>wallNow)hx.globalAlpha=.38;",
'pass frame wall clock to HUD');

once(
"    prepareWorldMap();\n    const dt=Math.max(0,Math.min(.05,(now-lastFrameAt)/1000));lastFrameAt=now;\n    hx.clearRect(0,0,view.w,view.h);",
"    prepareWorldMap();\n    const wallNow=Date.now();\n    const dt=Math.max(0,Math.min(.05,(now-lastFrameAt)/1000));lastFrameAt=now;\n    hx.clearRect(0,0,view.w,view.h);",
'compute wall clock once per frame');

once(
"      applyHidden(e);\n      e.root.updateWorldMatrix(true,true);\n      updateHudAnchor(e,view,mapped.z);\n      drawHud(e);",
"      applyHidden(e,wallNow);\n      // Head.getWorldPosition() updates only the required parent chain for HUD.\n      // The renderer updates the full scene graph later during render(), so a\n      // forced full-tree update here was duplicate work for every visible GLB.\n      updateHudAnchor(e,view,mapped.z);\n      drawHud(e,wallNow);",
'remove duplicate full-tree matrix update');

for(const bad of [
  'e.root.updateWorldMatrix(true,true);',
  "Number(e.data&&e.data.hiddenUntil)>Date.now()",
  "Number(r.hiddenUntil)>Date.now()"
])if(s.includes(bad))throw new Error('Stage 4B old per-player work survived: '+bad);

for(const keep of [
  'const wallNow=Date.now();','applyHidden(e,wallNow);','drawHud(e,wallNow);',
  'if(e.head)e.head.getWorldPosition(scratchHead);','try{renderer.render(scene,camera)}catch(_){}',
  'try{if(e.mixer)e.mixer.update(dt)}catch(_){}'
])if(!s.includes(keep))throw new Error('Stage 4B required behavior missing: '+keep);

fs.writeFileSync(p,s,'utf8');
console.log('Stage 4B applied: one wall clock read per frame and duplicate full-tree matrix update removed; Head projection and renderer matrix updates preserved');
