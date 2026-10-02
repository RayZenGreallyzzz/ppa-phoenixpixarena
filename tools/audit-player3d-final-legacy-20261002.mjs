import fs from 'node:fs';

const html=fs.readFileSync('public/index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const buildScript=String(pkg.scripts?.build||'');

function countText(text,needle){let n=0,p=0;while((p=text.indexOf(needle,p))!==-1){n++;p+=Math.max(1,needle.length);}return n;}
function showContexts(label,needle,limit=8,radius=220){
  let p=0,n=0;
  while((p=html.indexOf(needle,p))!==-1&&n<limit){
    const s=html.slice(Math.max(0,p-radius),Math.min(html.length,p+needle.length+radius)).replace(/\s+/g,' ');
    console.log(`CTX ${label} #${n+1}: ${s}`);
    p+=needle.length;n++;
  }
}

const forbidden=[
  'playerAnimDef(','playerUsesGnomeSprites','playerUsesArcherSprites','playerUsesAssassinSprites','playerUsesTankSprites',
  'playerUsesBerserkerSprites','playerUsesPriestSprites','playerUsesMageSprites','playerUsesPaladinSprites',
  'SPR_IDLE','SPR_RUN','SPR_ATK','imgIdle','imgRun','imgAtk','mobile-sprite-performance.js','remote-sprite-renderer.js'
];
for(const token of forbidden){
  const n=countText(html,token);
  console.log(`FORBIDDEN ${token}: ${n}`);
  if(n)showContexts(token,token,4);
}

const stressAllowed=['v174AiSpriteCfg','v174DrawAiTrainingFighter','PPA_ONLINE_STRESS','GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM'];
for(const token of stressAllowed){
  const n=countText(html,token);
  console.log(`STRESS ${token}: ${n}`);
  if(n)showContexts(token,token,3);
}

const playerTerms=['sprite','Sprite','SPR_','_ANIM','drawPlayer','playerDir','playerNickname','VisualTop','drawImage'];
const drawStart=html.indexOf('function drawPlayer(){');
console.log('drawPlayer index:',drawStart);
if(drawStart>=0){
  const chunk=html.slice(drawStart,Math.min(html.length,drawStart+2200));
  console.log('DRAWPLAYER_CHUNK:',chunk.replace(/\s+/g,' '));
}
for(const term of playerTerms){
  const n=countText(html,term);
  console.log(`GLOBAL_TERM ${term}: ${n}`);
}

console.log('BUILD postbuild-paladin-frame-cleanup:',buildScript.includes('postbuild-paladin-frame-cleanup-20260928.mjs'));
console.log('BUILD player-3d-unified:',buildScript.includes('postbuild-player-3d-unified-20261002.mjs'));
console.log('BUILD player-sprite-preload-cleanup:',buildScript.includes('postbuild-player-sprite-preload-cleanup-20261002.mjs'));
console.log('BUILD player-sprite-asset-cleanup:',buildScript.includes('postbuild-player-sprite-asset-cleanup-20261002.mjs'));
console.log('BUILD player-generic-sprite-cleanup:',buildScript.includes('postbuild-player-generic-sprite-cleanup-20261002.mjs'));

for(const protectedPath of ['public/game/dungeon-mob-events.js','public/game/dungeon60-dragon.js','public/game/boss-drop-boost.js','public/game/clan-boss-loot.js']){
  console.log(`PROTECTED ${protectedPath}:`,fs.existsSync(protectedPath));
  if(!fs.existsSync(protectedPath))throw new Error('protected mob/boss runtime missing: '+protectedPath);
}

console.log('FINAL_LEGACY_AUDIT_DONE');
