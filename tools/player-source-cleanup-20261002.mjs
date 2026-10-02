// Stage 5A2: remove dead real-player + AI Training sprite visuals from the
// canonical in-memory source before build.mjs externalizes assets. Gameplay
// migration anchors (playerAnimDef/playerUses*) intentionally remain until the
// unified Player3D postbuild converts/removes them later in the same build.

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
const AI_SIMPLE=[
  'GNOME_SOURCE_ROW','ARCHER_SOURCE_ROW','ASSASSIN_RUN_SOURCE_ROW','ASSASSIN_4DIR_ROW','TANK_4DIR_ROW',
  'BERSERKER_4DIR_ROW','PRIEST_4DIR_ROW','MAGE_4DIR_ROW','PALADIN_4DIR_ROW',
  'GNOME_DRAW_SCALE','ARCHER_DRAW_SCALE','ASSASSIN_RUN_DRAW_SCALE','ASSASSIN_IDLE_DRAW_SCALE','ASSASSIN_ATTACK_DRAW_SCALE',
  'TANK_DRAW_SCALE','BERSERKER_DRAW_SCALE','PRIEST_DRAW_SCALE','MAGE_DRAW_SCALE','PALADIN_DRAW_SCALE',
  'GNOME_FLIP_BY_DIR','ARCHER_FLIP_BY_DIR'
];
const MARKER='/* PPA_PLAYER_SPRITE_SOURCE_CLEANUP_20261002 */';
const AI_MARKER='/* PPA_AI_TRAINING_SPRITE_SOURCE_CLEANUP_20261002 */';
const AI_PRIMITIVE="cx.fillStyle='#9d63db';cx.beginPath();cx.arc(sx,sy-10,aiVisualSize*.35,0,Math.PI*2);cx.fill();";

const count=(text,needle)=>text.split(needle).length-1;
const esc=(s)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function balancedEnd(text,openAt,openChar='{',closeChar='}'){
  let depth=0,quote=null,escape=false,line=false,block=false;
  for(let i=openAt;i<text.length;i++){
    const ch=text[i],nx=text[i+1];
    if(line){if(ch==='\n')line=false;continue}
    if(block){if(ch==='*'&&nx==='/'){block=false;i++}continue}
    if(quote){if(escape){escape=false;continue}if(ch==='\\'){escape=true;continue}if(ch===quote)quote=null;continue}
    if(ch==='/'&&nx==='/'){line=true;i++;continue}
    if(ch==='/'&&nx==='*'){block=true;i++;continue}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue}
    if(ch===openChar)depth++;
    else if(ch===closeChar&&--depth===0)return i;
  }
  throw new Error('Stage 5A2 source cleanup: balanced block end missing');
}
function removeFunction(text,signature){
  const start=text.indexOf(signature);
  if(start<0||text.indexOf(signature,start+signature.length)>=0)throw new Error('Stage 5A2 source cleanup: function anchor invalid '+signature);
  const open=text.indexOf('{',start),end=balancedEnd(text,open);
  return text.slice(0,start)+text.slice(end+1);
}
function removeObjectConst(text,name){
  const prefix=`const ${name}=`;const start=text.indexOf(prefix);
  if(start<0||text.indexOf(prefix,start+prefix.length)>=0)throw new Error('Stage 5A2 source cleanup: object const anchor invalid '+name);
  const open=text.indexOf('{',start+prefix.length),close=balancedEnd(text,open);
  let end=close+1;while(end<text.length&&/\s/.test(text[end]))end++;
  if(text[end]!==';')throw new Error('Stage 5A2 source cleanup: object const semicolon missing '+name);
  return text.slice(0,start)+text.slice(end+1);
}
function removeSimpleConst(text,name){
  const re=new RegExp(`const\\s+${name}\\s*=\\s*[^;]+;`,'g'),hits=text.match(re)||[];
  if(hits.length!==1)throw new Error(`Stage 5A2 source cleanup: ${name} expected one simple declaration, got ${hits.length}`);
  return text.replace(re,'');
}

export function stripDeadPlayerSpriteAssets(input){
  if(typeof input!=='string'||input.length<1000)throw new Error('Stage 5A2 source cleanup: packed source text missing');
  let source=input;
  if(source.includes(MARKER)||source.includes(AI_MARKER))throw new Error('Stage 5A2 source cleanup: marker already present in canonical source');

  const genericUrls=[];
  for(const sym of GENERIC_SOURCES){
    if(count(source,sym)!==2)throw new Error(`Stage 5A2 source cleanup: ${sym} expected declaration+preload count 2, got ${count(source,sym)}`);
    const re=new RegExp(`const\\s+${sym}\\s*=\\s*(['\"])([^'\"]+\\.png)\\1\\s*;`),decls=source.match(new RegExp(re.source,'g'))||[];
    if(decls.length!==1)throw new Error(`Stage 5A2 source cleanup: ${sym} declaration count ${decls.length}`);
    genericUrls.push(source.match(re)[2]);
  }
  if(new Set(genericUrls).size!==3)throw new Error('Stage 5A2 source cleanup: generic sprite URLs are not unique');

  let classAssetsRemoved=0;
  for(const [srcName,imgName] of CLASS_ENTRIES){
    const srcRe=new RegExp(`const\\s+${srcName}\\s*=\\s*(['\"])(data:image\\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+)\\1\\s*;`);
    if(!srcRe.test(source)||count(source,srcName)!==2)throw new Error('Stage 5A2 source cleanup: class source invalid '+srcName);
    const imgDeclRe=new RegExp(`const\\s+${imgName}\\s*=\\s*new\\s+Image\\(\\)\\s*;`),imgUse=`img:${imgName}`;
    if(!imgDeclRe.test(source)||count(source,imgUse)!==2)throw new Error('Stage 5A2 source cleanup: class Image invalid '+imgName);
    source=source.replace(srcRe,'').replace(imgDeclRe,'').split(imgUse).join('img:null');
    classAssetsRemoved++;
  }

  const rs=source.indexOf('const RESOURCES=['),re=rs<0?-1:source.indexOf('\n];',rs);
  if(rs<0||re<0)throw new Error('Stage 5A2 source cleanup: RESOURCES missing');
  let resources=source.slice(rs,re+3),preloadsRemoved=0;
  for(const img of PLAYER_PRELOAD_IMAGES){
    const entry=CLASS_ENTRIES.find(([,name])=>name===img);
    const rowRe=entry
      ?new RegExp(`^[\\t ]*\\{name:[^\\n]+,img:null,src:${esc(entry[0])}\\},?[\\t ]*\\n?`,'m')
      :new RegExp(`^[\\t ]*\\{name:[^\\n]+,img:${esc(img)},src:[^\\n]+\\},?[\\t ]*\\n?`,'m');
    if(!rowRe.test(resources))throw new Error('Stage 5A2 source cleanup: preload missing '+img);
    resources=resources.replace(rowRe,'');preloadsRemoved++;
  }
  if(preloadsRemoved!==27||!resources.includes("name:'Safe Zone Map'")||!resources.includes("name:'Arena Map'"))throw new Error('Stage 5A2 source cleanup: resource guard failed');
  source=source.slice(0,rs)+resources+source.slice(re+3);

  const comment='// Sprite sheets (assassin: idle/breathing, run, attack)';
  let gs=source.indexOf(comment);if(gs<0)gs=source.indexOf('const SPR_IDLE=');
  const animStart=source.indexOf('const ANIM=',gs),ge=animStart<0?-1:source.indexOf('};',animStart);
  if(gs<0||animStart<0||ge<0)throw new Error('Stage 5A2 source cleanup: generic sprite block invalid');
  source=source.slice(0,gs)+MARKER+'\n'+source.slice(ge+2);

  const idleUrl=genericUrls[0],legacyBg=`background-image:url(&quot;${idleUrl}&quot;);`;
  if(count(source,legacyBg)!==1||!source.includes("var old=doc.getElementById('assassinModel');if(old)old.style.display='none'")||!source.includes("img.id='ppaClassPortraitV196'"))throw new Error('Stage 5A2 source cleanup: obsolete portrait proof failed');
  source=source.replace(legacyBg,'background-image:none;');
  const cssRe=/#assassinModel\s*\{\s*display\s*:\s*none\s*;/,cssHits=source.match(new RegExp(cssRe.source,'g'))||[];
  if(cssHits.length!==1)throw new Error('Stage 5A2 source cleanup: assassinModel CSS anchor invalid');
  source=source.replace(cssRe,'#assassinModel{display:none!important;');

  // Stage 5A2: AI Training already rendered the primitive fallback because all
  // class images were null. Make that primitive body canonical in source and
  // remove its dead sprite selectors/metadata before any postbuild executes.
  for(const keep of ['function playerAnimDef(name){','function drawPlayer(){','const V174_AI_CLASS=','function v174SpawnAiTrainingFighter','PPA_AI_TRAINING_ACTIVE','function v174DrawAiTrainingFighter(e,sx,sy){','isAiFighter:true','PPA_ONLINE_STRESS'])if(!source.includes(keep))throw new Error('Stage 5A2 source cleanup: protected anchor missing '+keep);
  for(const name of CLASS_ANIMS){
    const prefix=`const ${name}=`,start=source.indexOf(prefix);
    if(start<0||source.indexOf(prefix,start+prefix.length)>=0)throw new Error('Stage 5A2 source cleanup: class metadata declaration invalid '+name);
    const open=source.indexOf('{',start),close=balancedEnd(source,open),block=source.slice(start,close+1);
    if(!block.includes('img:null'))throw new Error('Stage 5A2 source cleanup: class metadata was not image-neutralized '+name);
  }
  for(const name of AI_SIMPLE){
    const re=new RegExp(`const\\s+${name}\\s*=\\s*[^;]+;`,'g'),hits=source.match(re)||[];
    if(hits.length!==1)throw new Error(`Stage 5A2 source cleanup: ${name} expected one declaration, got ${hits.length}`);
  }
  if(count(source,'function v174AiDirIndex(e){')!==1||count(source,'function v174AiSpriteCfg(e){')!==1)throw new Error('Stage 5A2 source cleanup: AI selector definitions changed');

  const drawSig='function v174DrawAiTrainingFighter(e,sx,sy){',drawStart=source.indexOf(drawSig),drawOpen=source.indexOf('{',drawStart),drawEnd=balancedEnd(source,drawOpen);
  let draw=source.slice(drawStart,drawEnd+1);
  const cfgLine="const cfg=v174AiSpriteCfg(e),a=cfg.anim,di=v174AiDirIndex(e);",bobLine='const bob=Math.sin(e.bob)*2;';
  if(count(draw,cfgLine)!==1||count(draw,bobLine)!==1)throw new Error('Stage 5A2 source cleanup: AI renderer selector lines changed');
  draw=draw.replace(cfgLine,'').replace(bobLine,'');
  const branchSig='if(a&&a.img&&a.img.complete&&a.img.naturalWidth>0){',branchStart=draw.indexOf(branchSig),branchOpen=draw.indexOf('{',branchStart);
  if(branchStart<0)throw new Error('Stage 5A2 source cleanup: AI sprite draw branch missing');
  const branchClose=balancedEnd(draw,branchOpen);let p=branchClose+1;while(p<draw.length&&/\s/.test(draw[p]))p++;
  if(!draw.startsWith('else{',p))throw new Error('Stage 5A2 source cleanup: AI primitive else missing');
  const elseOpen=draw.indexOf('{',p),elseClose=balancedEnd(draw,elseOpen),oldElse=draw.slice(elseOpen+1,elseClose).replace(/\s+/g,'');
  if(oldElse!==AI_PRIMITIVE.replace(/\s+/g,''))throw new Error('Stage 5A2 source cleanup: AI primitive fallback changed');
  draw=draw.slice(0,branchStart)+AI_PRIMITIVE+draw.slice(elseClose+1);
  source=source.slice(0,drawStart)+draw+source.slice(drawEnd+1);
  source=removeFunction(source,'function v174AiSpriteCfg(e){');
  source=removeFunction(source,'function v174AiDirIndex(e){');
  for(const name of CLASS_ANIMS)source=removeObjectConst(source,name);
  for(const name of AI_SIMPLE)source=removeSimpleConst(source,name);
  source=source.replace(MARKER,MARKER+'\n'+AI_MARKER);

  for(const [srcName,imgName] of CLASS_ENTRIES)if(source.includes(srcName)||source.includes(imgName))throw new Error('Stage 5A2 source cleanup: class asset survived '+srcName+'/'+imgName);
  for(const sym of [...GENERIC_SOURCES,...GENERIC_IMAGES])if(source.includes(sym))throw new Error('Stage 5A2 source cleanup: generic symbol survived '+sym);
  if(source.includes('const ANIM='))throw new Error('Stage 5A2 source cleanup: generic ANIM survived');
  for(const url of genericUrls)if(source.includes(url))throw new Error('Stage 5A2 source cleanup: generic URL survived '+url);
  for(const sig of ['function v174AiSpriteCfg(e){','function v174AiDirIndex(e){'])if(source.includes(sig))throw new Error('Stage 5A2 source cleanup: AI sprite selector definition survived '+sig);
  for(const name of CLASS_ANIMS)if(source.includes(`const ${name}=`))throw new Error('Stage 5A2 source cleanup: class sprite metadata declaration survived '+name);
  for(const name of AI_SIMPLE){const re=new RegExp(`const\\s+${name}\\s*=`);if(re.test(source))throw new Error('Stage 5A2 source cleanup: sprite metadata declaration survived '+name);}
  for(const bad of ['a.img','cfg.','cx.drawImage','phoneCharacterDrawHeight'])if(draw.includes(bad))throw new Error('Stage 5A2 source cleanup: AI sprite renderer token survived '+bad);
  for(const keep of ['function playerAnimDef(name){','function drawPlayer(){','const V174_AI_CLASS=','function v174SpawnAiTrainingFighter','PPA_AI_TRAINING_ACTIVE','function v174DrawAiTrainingFighter(e,sx,sy){','isAiFighter:true','PPA_ONLINE_STRESS',AI_PRIMITIVE])if(!source.includes(keep))throw new Error('Stage 5A2 source cleanup: protected feature damaged '+keep);

  return {source,stats:{classAssetsRemoved,preloadsRemoved,genericSourcesRemoved:3,aiSpriteMetadataRemoved:CLASS_ANIMS.length+AI_SIMPLE.length+2,genericUrls}};
}

export const PLAYER_SOURCE_CLEANUP_MARKER=MARKER;
export const AI_TRAINING_SOURCE_CLEANUP_MARKER=AI_MARKER;
