import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {stripDeadPlayerSpriteAssets,PLAYER_SOURCE_CLEANUP_MARKER,AI_TRAINING_SOURCE_CLEANUP_MARKER} from './player-source-cleanup-20261002.mjs';

const EXPECTED_SHA='caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const packed=Buffer.concat(parts.map(p=>fs.readFileSync(p)));
const raw=zlib.gunzipSync(packed);
const sha=crypto.createHash('sha256').update(raw).digest('hex');
if(sha!==EXPECTED_SHA)throw new Error('Stage 5A2 test: canonical packed source SHA changed: '+sha);
const source=raw.toString('utf8');
const dataUriRe=/data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+/g;
const before=(source.match(dataUriRe)||[]).length;
const result=stripDeadPlayerSpriteAssets(source);
const after=(result.source.match(dataUriRe)||[]).length;
if(result.stats.classAssetsRemoved!==24)throw new Error('Stage 5A2 test: class asset removals '+result.stats.classAssetsRemoved);
if(result.stats.preloadsRemoved!==27)throw new Error('Stage 5A2 test: preload removals '+result.stats.preloadsRemoved);
if(result.stats.genericSourcesRemoved!==3)throw new Error('Stage 5A2 test: generic removals '+result.stats.genericSourcesRemoved);
if(result.stats.aiSpriteMetadataRemoved!==31)throw new Error('Stage 5A2 test: AI metadata removals '+result.stats.aiSpriteMetadataRemoved);
if(before-after!==24)throw new Error(`Stage 5A2 test: embedded data URI delta expected 24, got ${before-after} (${before} -> ${after})`);
if(!result.source.includes(PLAYER_SOURCE_CLEANUP_MARKER)||!result.source.includes(AI_TRAINING_SOURCE_CLEANUP_MARKER))throw new Error('Stage 5A2 test: cleanup markers missing');
for(const keep of ["name:'Safe Zone Map'","name:'Arena Map'",'function drawPlayer(){','function playerAnimDef(name){','const V174_AI_CLASS=','function v174SpawnAiTrainingFighter','PPA_AI_TRAINING_ACTIVE','function v174DrawAiTrainingFighter(e,sx,sy){','isAiFighter:true','PPA_ONLINE_STRESS',"cx.fillStyle='#9d63db';cx.beginPath();cx.arc(sx,sy-10,aiVisualSize*.35,0,Math.PI*2);cx.fill();"]){
  if(!result.source.includes(keep))throw new Error('Stage 5A2 test: protected source anchor missing: '+keep);
}
const dead=['v174AiSpriteCfg','v174AiDirIndex','GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM','GNOME_SOURCE_ROW','ARCHER_SOURCE_ROW','ASSASSIN_RUN_SOURCE_ROW','ASSASSIN_4DIR_ROW','TANK_4DIR_ROW','BERSERKER_4DIR_ROW','PRIEST_4DIR_ROW','MAGE_4DIR_ROW','PALADIN_4DIR_ROW','GNOME_FLIP_BY_DIR','ARCHER_FLIP_BY_DIR','GNOME_DRAW_SCALE','ARCHER_DRAW_SCALE','ASSASSIN_RUN_DRAW_SCALE','ASSASSIN_IDLE_DRAW_SCALE','ASSASSIN_ATTACK_DRAW_SCALE','TANK_DRAW_SCALE','BERSERKER_DRAW_SCALE','PRIEST_DRAW_SCALE','MAGE_DRAW_SCALE','PALADIN_DRAW_SCALE'];
for(const name of dead)if(result.source.includes(name))throw new Error('Stage 5A2 test: dead AI sprite metadata survived: '+name);
console.log(JSON.stringify({sha,beforeDataUris:before,afterDataUris:after,removedDataUris:before-after,...result.stats},null,2));
console.log('STAGE_5A2_SOURCE_TRANSFORM_OK');
