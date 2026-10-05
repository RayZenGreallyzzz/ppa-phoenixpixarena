import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
const runtimePath=path.join(ROOT,'public','game','player-3d-unified-runtime.js');
const debugPath=path.join(ROOT,'public','game','realtime-debug-bridge.js');
for(const p of [htmlPath,runtimePath,debugPath])if(!fs.existsSync(p))throw new Error('Player3D telemetry: missing '+p);

let runtime=fs.readFileSync(runtimePath,'utf8');
let debug=fs.readFileSync(debugPath,'utf8');
let html=fs.readFileSync(htmlPath,'utf8');

function once(src,from,to,label){
  const n=src.split(from).length-1;
  if(n!==1)throw new Error('Player3D telemetry: '+label+' target count='+n);
  return src.replace(from,to);
}

runtime=once(
  runtime,
  "  let cameraYaw=0,lastW=0,lastH=0,lastFrameAt=performance.now(),frames=0,lastFpsAt=performance.now(),fps=0;",
  "  let cameraYaw=0,lastW=0,lastH=0,lastFrameAt=performance.now(),frames=0,lastFpsAt=performance.now(),fps=0;\n  // PPA_PLAYER3D_PERF_TELEMETRY_20261005\n  const perf={frameMs:0,renderMs:0,mixerMs:0,visible:0,mixers:0,calls:0,triangles:0,points:0,lines:0,geometries:0,textures:0,programs:0,samples:0};\n  function perfEwma(key,v){v=Number(v)||0;perf[key]=perf.samples?perf[key]*.82+v*.18:v}",
  'perf state'
);

runtime=once(
  runtime,
  "  function frame(now){\n    requestAnimationFrame(frame);",
  "  function frame(now){\n    requestAnimationFrame(frame);\n    const __perfFrameStart=performance.now();let __perfMixerMs=0,__perfVisible=0,__perfMixers=0;",
  'frame start'
);

runtime=once(
  runtime,
  "      e.root.visible=true;\n      e.root.position.copy(mapped.hit);",
  "      e.root.visible=true;__perfVisible++;\n      e.root.position.copy(mapped.hit);",
  'visible counter'
);

runtime=once(
  runtime,
  "      try{if(e.mixer)e.mixer.update(dt)}catch(_){}",
  "      try{if(e.mixer){const __mixStart=performance.now();e.mixer.update(dt);__perfMixerMs+=performance.now()-__mixStart;__perfMixers++}}catch(_){}",
  'mixer timing'
);

runtime=once(
  runtime,
  "    try{renderer.render(scene,camera)}catch(_){}\n    frames++;",
  "    const __renderStart=performance.now();\n    try{renderer.render(scene,camera)}catch(_){}\n    const __renderMs=performance.now()-__renderStart;\n    perfEwma('mixerMs',__perfMixerMs);perfEwma('renderMs',__renderMs);perfEwma('frameMs',performance.now()-__perfFrameStart);\n    perf.visible=__perfVisible;perf.mixers=__perfMixers;perf.samples++;\n    try{const ri=renderer.info||{},rr=ri.render||{},rm=ri.memory||{};perf.calls=Number(rr.calls)||0;perf.triangles=Number(rr.triangles)||0;perf.points=Number(rr.points)||0;perf.lines=Number(rr.lines)||0;perf.geometries=Number(rm.geometries)||0;perf.textures=Number(rm.textures)||0;perf.programs=Array.isArray(ri.programs)?ri.programs.length:0}catch(_){}\n    frames++;",
  'render timing'
);

runtime=once(
  runtime,
  "    diag:()=>({\n      version:'unified-v9-anim-speed-hotloop-fix',fps,",
  "    diag:()=>({\n      version:'unified-v9-anim-speed-hotloop-fix',fps,\n      perf:{frameMs:+perf.frameMs.toFixed(2),renderMs:+perf.renderMs.toFixed(2),mixerMs:+perf.mixerMs.toFixed(2),visible:perf.visible,mixers:perf.mixers,calls:perf.calls,triangles:perf.triangles,points:perf.points,lines:perf.lines,geometries:perf.geometries,textures:perf.textures,programs:perf.programs},",
  'diag payload'
);

if(!runtime.includes('PPA_PLAYER3D_PERF_TELEMETRY_20261005'))throw new Error('Player3D telemetry: runtime marker missing');
fs.writeFileSync(runtimePath,runtime,'utf8');

debug=once(debug,"    [0,1,2,3,5].forEach(function(n){","    [0,1,2,3,5,10].forEach(function(n){",'stress 10 button');

debug=once(
  debug,
  "      var stress=actualStressCount();\n      var stressLine=stress?('<div class=\"w\">LOCAL STRESS '+stress+'</div>'):'';",
  "      var stress=actualStressCount();\n      var stressLine=stress?('<div class=\"w\">LOCAL STRESS '+stress+'</div>'):'';\n      var pd=null;try{pd=window.PPA_PLAYER3D&&typeof window.PPA_PLAYER3D.diag==='function'?window.PPA_PLAYER3D.diag():null}catch(_){}\n      var pp=pd&&pd.perf?pd.perf:null,p3dLine='';\n      if(pp){\n        var tri=Math.max(0,Number(pp.triangles)||0),triText=tri>=1000000?(tri/1000000).toFixed(1)+'m':(tri>=1000?Math.round(tri/1000)+'k':String(Math.round(tri)));\n        p3dLine='<div class=\"d\">P3D V'+Math.max(0,Number(pp.visible)||0)+' · CALL '+Math.max(0,Number(pp.calls)||0)+' · TRI '+triText+'</div>'+\n          '<div class=\"d\">MIX '+Math.max(0,Number(pp.mixers)||0)+' '+Number(pp.mixerMs||0).toFixed(1)+'ms · REN '+Number(pp.renderMs||0).toFixed(1)+'ms · 3D '+Number(pp.frameMs||0).toFixed(1)+'ms</div>'+\n          '<div class=\"d\">GEO '+Math.max(0,Number(pp.geometries)||0)+' · TEX '+Math.max(0,Number(pp.textures)||0)+' · PROG '+Math.max(0,Number(pp.programs)||0)+'</div>';\n      }",
  'debug telemetry block'
);

debug=once(
  debug,
  "        '<div class=\"d\">PLAYERS '+players+' · ROOM '+roomPeers+' · VISIBLE '+visible+' / '+drawn+'</div>'+stressLine+instLine+authLine+",
  "        '<div class=\"d\">PLAYERS '+players+' · ROOM '+roomPeers+' · VISIBLE '+visible+' / '+drawn+'</div>'+stressLine+p3dLine+instLine+authLine+",
  'debug telemetry render'
);
fs.writeFileSync(debugPath,debug,'utf8');

const runtimeRx=/player-3d-unified-runtime\.js\?v=[^\"']+/g;
const debugRx=/realtime-debug-bridge\.js\?v=[^\"']+/g;
const runtimeMatches=html.match(runtimeRx)||[],debugMatches=html.match(debugRx)||[];
if(runtimeMatches.length!==1)throw new Error('Player3D telemetry: runtime script tag count='+runtimeMatches.length);
if(debugMatches.length!==1)throw new Error('Player3D telemetry: debug script tag count='+debugMatches.length);
html=html.replace(runtimeRx,'player-3d-unified-runtime.js?v=20261005perf1');
html=html.replace(debugRx,'realtime-debug-bridge.js?v=20261005perf1');
const buildMeta=/<meta name=\"ppa-client-build\" content=\"[^\"]+\">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v667-player3d-telemetry-20261005">');
fs.writeFileSync(htmlPath,html,'utf8');

console.log('[PPA BUILD] v667 Player3D telemetry: calls/triangles/mixer/render/frame + stress 10');
