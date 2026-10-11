import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// SAFE source inspection. Strictly reads the checksum-locked original game
// source already committed as PPA01.bin ... PPA12.bin. No deployments, saves,
// access credentials, network, purchases or playable combat.
const chunks = Array.from({length:12},(_,i)=>readFileSync(
  new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url)));
const raw = zlib.gunzipSync(Buffer.concat(chunks));
const sourceSha = crypto.createHash('sha256').update(raw).digest('hex');
assert.equal(sourceSha,'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7',
  'Original Telegram game source changed; inspect BEFORE translating formulas.');
const source=raw.toString('utf8');
const needles=[
  ['CLASS_BASE','const CLASS_BASE'],
  ['STAT_POINT_GAIN','const STAT_POINT_GAIN'],
  ['RUNE_TYPES','const RUNE_TYPES'],
  ['RUNE_RARITY','const RUNE_RARITY'],
  ['RUNE_DEFINITION','function runeDefByKey'],
  ['RUNE_BONUS','function runeBonus'],
  ['CLASS_KEY','function classBaseKey'],
  ['GEAR_BONUS','function gearBonus'],
  ['RECOMPUTE','function recomputeStats'],
];
console.log('PPA_ORIGINAL_CLASS_RUNE_SOURCE_OK sha256='+sourceSha+' bytes='+raw.length);
for(const [label,needle] of needles){
  const offset=source.indexOf(needle);
  // Targeted source signatures only. Do not print the full packed game, its
  // user/session data or unrelated source.
  const excerpt=offset>=0?source.slice(offset,offset+1400):'';
  const signature=crypto.createHash('sha256').update(excerpt).digest('hex').slice(0,16);
  console.log('SOURCE_'+label+'_FOUND='+(offset>=0)+' SIG='+signature+
    ' HEAD='+JSON.stringify(excerpt.slice(0,1050)));
}
