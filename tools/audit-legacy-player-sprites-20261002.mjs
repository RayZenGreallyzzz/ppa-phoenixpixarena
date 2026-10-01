import fs from 'node:fs';
import path from 'node:path';

const htmlPath=path.join(process.cwd(),'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('legacy player audit: public/index.html missing; run build first');
const html=fs.readFileSync(htmlPath,'utf8');

const symbols=[
  'playerAnimDef','playerUsesGnomeSprites','playerUsesArcherSprites','playerUsesAssassinSprites',
  'playerUsesTankSprites','playerUsesBerserkerSprites','playerUsesPriestSprites','playerUsesMageSprites',
  'playerUsesPaladinSprites','playerUsesEightDirSprites','playerDir8','dir8Canonical',
  'GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM',
  'GNOME_SOURCE_ROW','ARCHER_SOURCE_ROW','ASSASSIN_SOURCE_ROW','TANK_SOURCE_ROW','BERSERKER_SOURCE_ROW','PRIEST_SOURCE_ROW','MAGE_SOURCE_ROW','PALADIN_SOURCE_ROW',
  'GNOME_FLIP_BY_DIR','ARCHER_FLIP_BY_DIR','ASSASSIN_FLIP_BY_DIR',
  'SPR_IDLE','SPR_RUN','SPR_ATK'
];

function indexesOf(needle){
  const out=[];let p=0;
  while((p=html.indexOf(needle,p))>=0){out.push(p);p+=needle.length}
  return out;
}
function clean(s){
  return s
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'[DATA_IMAGE_REDACTED]')
    .replace(/[A-Za-z0-9+/]{120,}={0,2}/g,'[LONG_DATA_REDACTED]')
    .replace(/\s+/g,' ')
    .trim();
}

console.log('=== LEGACY PLAYER SPRITE SYMBOL AUDIT ===');
for(const symbol of symbols){
  const hits=indexesOf(symbol);
  console.log(`SYMBOL ${symbol} COUNT ${hits.length}`);
  for(const [i,pos] of hits.slice(0,8).entries()){
    const before=Math.max(0,pos-180),after=Math.min(html.length,pos+symbol.length+220);
    console.log(`  [${i+1}] ${clean(html.slice(before,after))}`);
  }
}
console.log('=== END LEGACY PLAYER SPRITE SYMBOL AUDIT ===');
