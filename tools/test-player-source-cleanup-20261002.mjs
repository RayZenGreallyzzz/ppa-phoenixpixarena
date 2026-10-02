import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {stripDeadPlayerSpriteAssets,PLAYER_SOURCE_CLEANUP_MARKER} from './player-source-cleanup-20261002.mjs';

const EXPECTED_SHA='caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const packed=Buffer.concat(parts.map(p=>fs.readFileSync(p)));
const raw=zlib.gunzipSync(packed);
const sha=crypto.createHash('sha256').update(raw).digest('hex');
if(sha!==EXPECTED_SHA)throw new Error('Stage 5A1 test: canonical packed source SHA changed: '+sha);
const source=raw.toString('utf8');
const dataUriRe=/data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+/g;
const before=(source.match(dataUriRe)||[]).length;
const result=stripDeadPlayerSpriteAssets(source);
const after=(result.source.match(dataUriRe)||[]).length;
if(result.stats.classAssetsRemoved!==24)throw new Error('Stage 5A1 test: class asset removals '+result.stats.classAssetsRemoved);
if(result.stats.preloadsRemoved!==27)throw new Error('Stage 5A1 test: preload removals '+result.stats.preloadsRemoved);
if(result.stats.genericSourcesRemoved!==3)throw new Error('Stage 5A1 test: generic removals '+result.stats.genericSourcesRemoved);
if(before-after!==24)throw new Error(`Stage 5A1 test: embedded data URI delta expected 24, got ${before-after} (${before} -> ${after})`);
if(!result.source.includes(PLAYER_SOURCE_CLEANUP_MARKER))throw new Error('Stage 5A1 test: cleanup marker missing');
for(const keep of ["name:'Safe Zone Map'","name:'Arena Map'",'function drawPlayer(){','function playerAnimDef(name){','function v174AiSpriteCfg(e){','function v174DrawAiTrainingFighter(e,sx,sy){','PPA_ONLINE_STRESS']){
  if(!result.source.includes(keep))throw new Error('Stage 5A1 test: protected source anchor missing: '+keep);
}
console.log(JSON.stringify({sha,beforeDataUris:before,afterDataUris:after,removedDataUris:before-after,...result.stats},null,2));
console.log('STAGE_5A1_SOURCE_TRANSFORM_OK');
