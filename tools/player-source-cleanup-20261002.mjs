// Stage 5A1: remove dead real-player sprite assets before build.mjs externalizes
// embedded data URIs. This deliberately leaves class animation metadata in place
// with img:null so the existing unified gameplay migration and AI Training cleanup
// can run unchanged later in the build pipeline.

const CLASS_ENTRIES=[
  ['GNOME_IDLE_SRC','imgGnomeIdle'],['GNOME_RUN_SRC','imgGnomeRun'],['GNOME_ATTACK_SRC','imgGnomeAttack'],
  ['ARCHER_IDLE_SRC','imgArcherIdle'],['ARCHER_RUN_SRC','imgArcherRun'],['ARCHER_ATTACK_SRC','imgArcherAttack'],
  ['ASSASSIN_IDLE_SRC','imgAssassinIdle'],['ASSASSIN_RUN_SRC','imgAssassinRun'],['ASSASSIN_ATTACK_SRC','imgAssassinAttack'],
  ['TANK_IDLE_SRC','imgTankIdle'],['TANK_RUN_SRC','imgTankRun'],['TANK_ATTACK_SRC','imgTankAttack'],
  ['BERSERKER_IDLE_SRC','imgBerserkerIdle'],['BERSERKER_RUN_SRC','imgBerserkerRun'],['BERSERKER_ATTACK_SRC','imgBerserkerAttack'],
  ['PRIEST_IDLE_SRC','imgPriestIdle'],['PRIEST_RUN_SRC','imgPriestRun'],['PRIEST_ATTACK_SRC','imgPriestAttack'],
  ['MAGE_IDLE_SRC','imgMageIdle'],['MAGE_RUN_SRC','imgMageRun'],['MAGE_ATTACK_SRC','imgMageAttack'],
  ['PALADIN_IDLE_SRC','imgPaladinIdle'],['PALADIN_RUN_SRC','imgPaladinRun'],['PALADIN_ATTACK_SRC','imgPaladinAttack']
];
const GENERIC_SOURCES=['SPR_IDLE','SPR_RUN','SPR_ATK'];
const GENERIC_IMAGES=['imgIdle','imgRun','imgAtk'];
const PLAYER_PRELOAD_IMAGES=[...GENERIC_IMAGES,...CLASS_ENTRIES.map(([,img])=>img)];
const CLASS_ANIMS=['GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM'];
const MARKER='/* PPA_PLAYER_SPRITE_SOURCE_CLEANUP_20261002 */';

const count=(text,needle)=>text.split(needle).length-1;
const esc=(s)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function stripDeadPlayerSpriteAssets(input){
  if(typeof input!=='string'||input.length<1000)throw new Error('Stage 5A1 source cleanup: packed source text missing');
  let source=input;
  if(source.includes(MARKER))throw new Error('Stage 5A1 source cleanup: marker already present in canonical source');

  // Capture the three old generic remote URLs before removing their block.
  const genericUrls=[];
  for(const sym of GENERIC_SOURCES){
    if(count(source,sym)!==2)throw new Error(`Stage 5A1 source cleanup: ${sym} expected declaration+preload count 2, got ${count(source,sym)}`);
    const re=new RegExp(`const\\s+${sym}\\s*=\\s*(['\"])([^'\"]+\\.png)\\1\\s*;`);
    const decls=source.match(new RegExp(re.source,'g'))||[];
    if(decls.length!==1)throw new Error(`Stage 5A1 source cleanup: ${sym} expected one declaration, got ${decls.length}`);
    const m=source.match(re);
    genericUrls.push(m[2]);
  }
  if(new Set(genericUrls).size!==3)throw new Error('Stage 5A1 source cleanup: generic sprite URLs are not unique');

  // Remove 24 embedded class atlas constants + Image objects, and make the
  // surviving class animation metadata explicitly image-free.
  let classAssetsRemoved=0;
  for(const [srcName,imgName] of CLASS_ENTRIES){
    const srcRe=new RegExp(`const\\s+${srcName}\\s*=\\s*(['\"])(data:image\\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+)\\1\\s*;`);
    const m=source.match(srcRe);
    if(!m)throw new Error(`Stage 5A1 source cleanup: embedded ${srcName} declaration missing`);
    if(count(source,srcName)!==2)throw new Error(`Stage 5A1 source cleanup: ${srcName} expected declaration+preload count 2, got ${count(source,srcName)}`);
    const imgDeclRe=new RegExp(`const\\s+${imgName}\\s*=\\s*new\\s+Image\\(\\)\\s*;`);
    if(!imgDeclRe.test(source))throw new Error(`Stage 5A1 source cleanup: ${imgName} declaration missing`);
    const imgUse=`img:${imgName}`;
    const imgUseCount=count(source,imgUse);
    if(imgUseCount!==2)throw new Error(`Stage 5A1 source cleanup: ${imgUse} expected animation+preload count 2, got ${imgUseCount}`);
    source=source.replace(srcRe,'');
    source=source.replace(imgDeclRe,'');
    // Only the animation metadata occurrence should remain after preload removal;
    // both are converted safely now, then the preload row itself is removed below.
    source=source.split(imgUse).join('img:null');
    classAssetsRemoved++;
  }
  if(classAssetsRemoved!==24)throw new Error(`Stage 5A1 source cleanup: expected 24 class assets, got ${classAssetsRemoved}`);

  // Remove exactly the 27 real-player preload rows, preserving every other
  // resource (maps, mobs, UI art, bosses, etc.).
  const resourcesStart='const RESOURCES=[';
  const rs=source.indexOf(resourcesStart);
  const re=rs<0?-1:source.indexOf('\n];',rs);
  if(rs<0||re<0)throw new Error('Stage 5A1 source cleanup: RESOURCES array missing');
  let block=source.slice(rs,re+3);
  let preloadsRemoved=0;
  for(const img of PLAYER_PRELOAD_IMAGES){
    // Class rows may now be img:null because class img uses were neutralized above;
    // identify rows by their original src symbol for class assets, generic by img.
    let rowRe;
    const entry=CLASS_ENTRIES.find(([,name])=>name===img);
    if(entry){
      const [srcName]=entry;
      rowRe=new RegExp(`^[\\t ]*\\{name:[^\\n]+,img:null,src:${esc(srcName)}\\},?[\\t ]*\\n?`,'m');
    }else{
      rowRe=new RegExp(`^[\\t ]*\\{name:[^\\n]+,img:${esc(img)},src:[^\\n]+\\},?[\\t ]*\\n?`,'m');
    }
    if(!rowRe.test(block))throw new Error(`Stage 5A1 source cleanup: preload row missing for ${img}`);
    block=block.replace(rowRe,'');
    preloadsRemoved++;
  }
  if(preloadsRemoved!==27)throw new Error(`Stage 5A1 source cleanup: expected 27 preload removals, got ${preloadsRemoved}`);
  if(!block.includes("name:'Safe Zone Map'"))throw new Error('Stage 5A1 source cleanup: Safe Zone resource damaged');
  if(!block.includes("name:'Arena Map'"))throw new Error('Stage 5A1 source cleanup: Arena resource damaged');
  source=source.slice(0,rs)+block+source.slice(re+3);

  // Remove the obsolete generic assassin sprite declarations + exact ANIM table.
  const comment='// Sprite sheets (assassin: idle/breathing, run, attack)';
  let gs=source.indexOf(comment);
  if(gs<0)gs=source.indexOf('const SPR_IDLE=');
  if(gs<0)throw new Error('Stage 5A1 source cleanup: generic sprite block start missing');
  const animStart=source.indexOf('const ANIM=',gs);
  if(animStart<0)throw new Error('Stage 5A1 source cleanup: generic ANIM declaration missing');
  const ge=source.indexOf('};',animStart);
  if(ge<0)throw new Error('Stage 5A1 source cleanup: generic ANIM end missing');
  source=source.slice(0,gs)+MARKER+'\n'+source.slice(ge+2);

  // The old hidden #assassinModel CSS was the last consumer of generic idle.
  // The active portrait runtime already hides it and creates ppaClassPortraitV196.
  const idleUrl=genericUrls[0];
  const legacyBg=`background-image:url(&quot;${idleUrl}&quot;);`;
  if(count(source,legacyBg)!==1)throw new Error(`Stage 5A1 source cleanup: obsolete assassinModel background count ${count(source,legacyBg)}`);
  if(!source.includes("var old=doc.getElementById('assassinModel');if(old)old.style.display='none'"))throw new Error('Stage 5A1 source cleanup: replacement portrait no longer proves assassinModel obsolete');
  if(!source.includes("img.id='ppaClassPortraitV196'"))throw new Error('Stage 5A1 source cleanup: replacement class portrait missing');
  source=source.replace(legacyBg,'background-image:none;');
  const cssRe=/#assassinModel\s*\{\s*display\s*:\s*none\s*;/;
  const cssHits=source.match(new RegExp(cssRe.source,'g'))||[];
  if(cssHits.length!==1)throw new Error(`Stage 5A1 source cleanup: assassinModel CSS anchor count ${cssHits.length}`);
  source=source.replace(cssRe,'#assassinModel{display:none!important;');

  // Final invariants: no real-player image/source symbols or generic sprite URLs,
  // but class animation metadata and AI Training sprite selector intentionally
  // remain for Stage 5A2 / existing postbuild migration, now with img:null only.
  for(const [srcName,imgName] of CLASS_ENTRIES){
    if(source.includes(srcName))throw new Error(`Stage 5A1 source cleanup: class source survived ${srcName}`);
    if(source.includes(imgName))throw new Error(`Stage 5A1 source cleanup: class Image survived ${imgName}`);
  }
  for(const sym of [...GENERIC_SOURCES,...GENERIC_IMAGES])if(source.includes(sym))throw new Error(`Stage 5A1 source cleanup: generic symbol survived ${sym}`);
  if(source.includes('const ANIM='))throw new Error('Stage 5A1 source cleanup: exact generic ANIM declaration survived');
  for(const url of genericUrls)if(source.includes(url))throw new Error(`Stage 5A1 source cleanup: generic remote URL survived ${url}`);
  for(const name of CLASS_ANIMS){
    if(!source.includes(`const ${name}=`))throw new Error(`Stage 5A1 source cleanup: transitional class metadata missing ${name}`);
  }
  for(const keep of ['function v174AiSpriteCfg(e){','function v174AiDirIndex(e){','function v174DrawAiTrainingFighter(e,sx,sy){','PPA_ONLINE_STRESS','function drawPlayer(){','function playerAnimDef(name){']){
    if(!source.includes(keep))throw new Error(`Stage 5A1 source cleanup: live/transitional anchor damaged ${keep}`);
  }
  if(count(source,'img:null')<24)throw new Error('Stage 5A1 source cleanup: class animation metadata was not neutralized');

  return {source,stats:{classAssetsRemoved,preloadsRemoved,genericSourcesRemoved:3,genericUrls}};
}

export const PLAYER_SOURCE_CLEANUP_MARKER=MARKER;
