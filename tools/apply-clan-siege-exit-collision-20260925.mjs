import fs from 'node:fs';

const path='build.mjs';
let s=fs.readFileSync(path,'utf8');

function replaceOnce(name, from, to){
  if(!s.includes(from)) throw new Error(name+' target not found');
  s=s.replace(from,to);
}

const before=s;

replaceOnce('client build id', /const CLIENT_BUILD = '[^']+';/.exec(s)[0], "const CLIENT_BUILD = 'v601-clan-siege-exit-collision-native-20260925';");

// Keep the exit button in the same visual coordinate system as the compact siege HUD,
// directly below it, instead of floating behind/away from the panel.
replaceOnce(
  'native exit button placement',
  "b.style.cssText='position:fixed;right:12px;top:108px;z-index:58;display:none;min-width:96px;height:34px;padding:0 11px;border:1px solid #c58435;border-radius:8px;background:linear-gradient(#542815,#2b160d);color:#ffd787;box-shadow:0 3px 12px rgba(0,0,0,.65);font:800 10px monospace;touch-action:manipulation';",
  "b.style.cssText='position:fixed;left:calc(60% - 30px);top:42px;transform:translateX(-50%);z-index:58;display:none;min-width:96px;height:32px;padding:0 11px;border:1px solid #c58435;border-radius:8px;background:linear-gradient(#542815,#2b160d);color:#ffd787;box-shadow:0 3px 12px rgba(0,0,0,.65);font:800 10px monospace;touch-action:manipulation';"
);

// Track one-time cleanup so collision removal never becomes a per-frame FPS cost.
replaceOnce(
  'native siege state castle cleanup flag',
  "baseStats:null,hud:null,exitBtn:null,hudHtml:'',hudLastAt:0",
  "baseStats:null,hud:null,exitBtn:null,hudHtml:'',hudLastAt:0,castleCleared:false"
);

replaceOnce(
  'native siege reset castle cleanup flag',
  "PPA_SIEGE.captureLastAt=Date.now();PPA_SIEGE.enemyInZone=false;PPA_SIEGE.winner='';PPA_SIEGE.castleShownAt=0;PPA_SIEGE.hudHtml='';PPA_SIEGE.hudLastAt=0;",
  "PPA_SIEGE.captureLastAt=Date.now();PPA_SIEGE.enemyInZone=false;PPA_SIEGE.winner='';PPA_SIEGE.castleShownAt=0;PPA_SIEGE.hudHtml='';PPA_SIEGE.hudLastAt=0;PPA_SIEGE.castleCleared=false;"
);

const hudStart = '"function clanSiegeHudUpdate(force=false){\\n  const h=clanSiegeEnsureHud();';
const nativeCleanup = '"function clanSiegeClearCastleObstacles(){\\n  if(PPA_SIEGE.castleCleared)return;\\n  PPA_SIEGE.castleCleared=true;\\n  const hit=o=>{\\n    if(!o)return false;\\n    const id=String(o.id||o.key||o.type||\'\').toLowerCase();\\n    const name=String(o.name||o.title||\'\').toUpperCase();\\n    return !!(o.isClanSiegeCastle||o.clanSiegeCastle||id.indexOf(\'clan_siege_castle\')>=0||id.indexOf(\'clansiegecastle\')>=0||id.indexOf(\'castle\')>=0&&id.indexOf(\'siege\')>=0||name.indexOf(\'ЗАМОК\')>=0);\\n  };\\n  const kill=o=>{if(!o)return;o.dead=true;o.hp=0;o.solid=false;o.block=false;o.blocking=false;o.collide=false;o.collision=false;o.noCollision=true;o.visible=false;o.hidden=true;};\\n  try{\\n    if(Array.isArray(EN)){for(let i=EN.length-1;i>=0;i--){const e=EN[i];if(hit(e)){kill(e);EN.splice(i,1);}}}\\n  }catch(_){}\\n  try{\\n    [\'OBS\',\'OBSTACLES\',\'SOLIDS\',\'COLLIDERS\',\'COLLISIONS\',\'WALLS\',\'BLOCKERS\',\'STATIC_OBSTACLES\',\'MAP_OBSTACLES\'].forEach(k=>{const a=window[k];if(!Array.isArray(a))return;for(let i=a.length-1;i>=0;i--){if(hit(a[i])){kill(a[i]);a.splice(i,1);}}});\\n  }catch(_){}\\n}\\nfunction clanSiegeHudUpdate(force=false){\\n  const h=clanSiegeEnsureHud();';
replaceOnce('native castle collision cleanup helper', hudStart, nativeCleanup);

replaceOnce(
  'native castle collision cleanup call',
  "  const exit=PPA_SIEGE.exitBtn;\\n  if(P.scene!=='clansiege'||!PPA_SIEGE.active){",
  "  const exit=PPA_SIEGE.exitBtn;\\n  if(PPA_SIEGE.phase==='won')clanSiegeClearCastleObstacles();\\n  if(P.scene!=='clansiege'||!PPA_SIEGE.active){"
);

replaceOnce(
  'native siege audit collision cleanup',
  "   !output.includes(\"PPA_SIEGE.hudLastAt\") ||\n   !output.includes(\"left:calc(60% - 30px)\") ||",
  "   !output.includes(\"PPA_SIEGE.hudLastAt\") ||\n   !output.includes(\"clanSiegeClearCastleObstacles\") ||\n   !output.includes(\"castleCleared\") ||\n   !output.includes(\"left:calc(60% - 30px)\") ||"
);

if(s===before) throw new Error('No changes applied');
if(!s.includes("v601-clan-siege-exit-collision-native-20260925")) throw new Error('build id not updated');
if(!s.includes("top:42px;transform:translateX(-50%)")) throw new Error('exit button placement missing');
if(!s.includes("clanSiegeClearCastleObstacles")) throw new Error('castle cleanup helper missing');

fs.writeFileSync(path,s,'utf8');
console.log('Applied native clan siege exit placement and castle collision cleanup.');
