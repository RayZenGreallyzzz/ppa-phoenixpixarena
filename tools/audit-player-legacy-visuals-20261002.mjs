import fs from 'node:fs';
import path from 'node:path';

const htmlPath=path.join(process.cwd(),'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('legacy player visual audit: public/index.html missing');
const html=fs.readFileSync(htmlPath,'utf8');

const symbols=[
  'playerUsesGnomeSprites','playerUsesArcherSprites','playerUsesAssassinSprites','playerUsesTankSprites',
  'playerUsesBerserkerSprites','playerUsesPriestSprites','playerUsesMageSprites','playerUsesPaladinSprites',
  'playerUsesEightDirSprites','playerDir8','dir8Canonical',
  'ppaPlayerVisualTopScreenY','drawPlayerNickname','ppaPlayerNickname','ppaPlayerClanName',
  'GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM',
  'GNOME_SOURCE_ROW','ARCHER_SOURCE_ROW','ASSASSIN_SOURCE_ROW','TANK_SOURCE_ROW','BERSERKER_SOURCE_ROW','PRIEST_SOURCE_ROW','MAGE_SOURCE_ROW','PALADIN_SOURCE_ROW',
  'GNOME_FLIP_BY_DIR','ARCHER_FLIP_BY_DIR','ASSASSIN_FLIP_BY_DIR',
  'GNOME_DRAW_SCALE','ARCHER_DRAW_SCALE','ASSASSIN_IDLE_DRAW_SCALE','ASSASSIN_RUN_DRAW_SCALE','ASSASSIN_ATTACK_DRAW_SCALE',
  'TANK_DRAW_SCALE','BERSERKER_DRAW_SCALE','PRIEST_DRAW_SCALE','MAGE_DRAW_SCALE','PALADIN_DRAW_SCALE',
  'playerClassBodySize','phoneCharacterDrawHeight','phoneCharacterBodySize','v174AiSpriteCfg',
  'SPR_IDLE','SPR_RUN','SPR_ATK'
];

function indexesOf(needle){const out=[];let p=0;while((p=html.indexOf(needle,p))>=0){out.push(p);p+=needle.length}return out}
function clean(s){return s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'[DATA_IMAGE]')
  .replace(/[A-Za-z0-9+/]{120,}={0,2}/g,'[LONG_DATA]')
  .replace(/\s+/g,' ').trim()}
function classify(snippet){
  if(/v174AiSpriteCfg|LOCAL STRESS|debugRemotes|BOT\s*\d/i.test(snippet))return 'AI_STRESS';
  if(/drawPlayerNickname|ppaPlayerVisualTopScreenY|ppaPlayerNick|ppaPlayerClan/i.test(snippet))return 'LOCAL_HUD';
  if(/function\s+playerUses|function\s+playerDir8|function\s+dir8Canonical/.test(snippet))return 'DEFINITION';
  if(/const\s+[A-Z_]+_(ANIM|SOURCE_ROW|FLIP_BY_DIR|DRAW_SCALE)/.test(snippet))return 'DEFINITION';
  return 'OTHER';
}

console.log('=== PLAYER LEGACY VISUAL AUDIT AFTER 2E ===');
for(const symbol of symbols){
  const hits=indexesOf(symbol);
  console.log(`SYMBOL ${symbol} COUNT ${hits.length}`);
  for(const [i,pos] of hits.slice(0,12).entries()){
    const raw=html.slice(Math.max(0,pos-220),Math.min(html.length,pos+symbol.length+280));
    const text=clean(raw);
    console.log(`  [${i+1}] ${classify(text)} ${text}`);
  }
}
console.log('INDEX_HTML_BYTES '+Buffer.byteLength(html,'utf8'));
console.log('=== END PLAYER LEGACY VISUAL AUDIT ===');
