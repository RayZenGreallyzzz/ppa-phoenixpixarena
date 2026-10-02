import fs from 'node:fs';
const p='build.mjs';
let s=fs.readFileSync(p,'utf8');
const importLine="import {stripDeadPlayerSpriteAssets} from './tools/player-source-cleanup-20261002.mjs';\n";
if(!s.includes(importLine)){
  const anchor="import sharp from 'sharp';\n";
  if((s.split(anchor).length-1)!==1)throw new Error('Stage 5A1 build refactor: sharp import anchor changed');
  s=s.replace(anchor,anchor+importLine);
}
if(!s.includes('const sourceForBuild=playerSourceCleanup.source;')){
  const dataAnchor="const dataUri = /data:image\\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)/g;\n";
  if((s.split(dataAnchor).length-1)!==1)throw new Error('Stage 5A1 build refactor: dataUri anchor changed');
  const pre="const playerSourceCleanup=stripDeadPlayerSpriteAssets(source);\nconst sourceForBuild=playerSourceCleanup.source;\nconsole.log(`[PPA BUILD] Stage 5A1 pre-externalize player cleanup: ${playerSourceCleanup.stats.classAssetsRemoved} embedded class atlases + ${playerSourceCleanup.stats.preloadsRemoved} preload rows + ${playerSourceCleanup.stats.genericSourcesRemoved} generic sprite sources removed`);\n";
  s=s.replace(dataAnchor,pre+dataAnchor);
  const outputAnchor="let output = source.replace(dataUri, (full, mime, b64) => {";
  if((s.split(outputAnchor).length-1)!==1)throw new Error('Stage 5A1 build refactor: output externalize anchor changed');
  s=s.replace(outputAnchor,"let output = sourceForBuild.replace(dataUri, (full, mime, b64) => {");
}
for(const keep of [
  "const source = sourceBuffer.toString('utf8');",
  "if (sourceHash !== EXPECTED_SOURCE_SHA256)",
  'const playerSourceCleanup=stripDeadPlayerSpriteAssets(source);',
  'const sourceForBuild=playerSourceCleanup.source;',
  'let output = sourceForBuild.replace(dataUri, (full, mime, b64) => {'
])if(!s.includes(keep))throw new Error('Stage 5A1 build refactor missing invariant: '+keep);
if(s.includes('let output = source.replace(dataUri, (full, mime, b64) => {'))throw new Error('Stage 5A1 build refactor: raw source still externalized');
fs.writeFileSync(p,s,'utf8');
console.log('Stage 5A1 build refactor applied');
