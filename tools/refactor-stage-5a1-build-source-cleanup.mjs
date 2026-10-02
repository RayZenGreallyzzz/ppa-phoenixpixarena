import fs from 'node:fs';
const p='build.mjs';
let s=fs.readFileSync(p,'utf8');
const importLine="import {stripDeadPlayerSpriteAssets} from './tools/player-source-cleanup-20261002.mjs';\n";
if(!s.includes(importLine)){
  const anchor="import sharp from 'sharp';\n";
  if((s.split(anchor).length-1)!==1)throw new Error('Stage 5A1 build refactor: sharp import anchor changed');
  s=s.replace(anchor,anchor+importLine);
}
const from="const dataUri = /data:image\\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)/g;\nconst imageMap = new Map();\nlet imageIndex = 0;\nlet output = source.replace(dataUri, (full, ext, b64) => {";
const to="const playerSourceCleanup=stripDeadPlayerSpriteAssets(source);\nconst sourceForBuild=playerSourceCleanup.source;\nconsole.log(`[PPA BUILD] Stage 5A1 pre-externalize player cleanup: ${playerSourceCleanup.stats.classAssetsRemoved} embedded class atlases + ${playerSourceCleanup.stats.preloadsRemoved} preload rows + ${playerSourceCleanup.stats.genericSourcesRemoved} generic sprite sources removed`);\nconst dataUri = /data:image\\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)/g;\nconst imageMap = new Map();\nlet imageIndex = 0;\nlet output = sourceForBuild.replace(dataUri, (full, ext, b64) => {";
if(!s.includes('const sourceForBuild=playerSourceCleanup.source;')){
  if((s.split(from).length-1)!==1)throw new Error('Stage 5A1 build refactor: externalize anchor changed');
  s=s.replace(from,to);
}
for(const keep of [
  "const source = sourceBuffer.toString('utf8');",
  "if (sourceHash !== EXPECTED_SOURCE_SHA256)",
  'const playerSourceCleanup=stripDeadPlayerSpriteAssets(source);',
  'let output = sourceForBuild.replace(dataUri, (full, ext, b64) => {'
])if(!s.includes(keep))throw new Error('Stage 5A1 build refactor missing invariant: '+keep);
if(s.includes('let output = source.replace(dataUri, (full, ext, b64) => {'))throw new Error('Stage 5A1 build refactor: raw source still externalized');
fs.writeFileSync(p,s,'utf8');
console.log('Stage 5A1 build refactor applied');
