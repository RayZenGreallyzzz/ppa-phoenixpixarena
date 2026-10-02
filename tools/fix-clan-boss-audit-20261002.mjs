import fs from 'node:fs';
const p='build.mjs';
let s=fs.readFileSync(p,'utf8');
const oldEligible="      !realtimeServer.includes('.filter(x=>x.damage>=5000)') ||";
const newEligible="      !(realtimeServer.includes(\"const minDamage=String(st&&st.bossId||'')==='clan_boss_2'?100000:5000\") && realtimeServer.includes('.filter(x=>x.damage>=minDamage)')) ||";
const oldChance="      !realtimeServer.includes('const chance=1') ||";
const newChance="      !realtimeServer.includes('clanBossSharedRoll(eligible,kind,label,chance=1)') ||";
function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 target, found ${n}`);
  s=s.replace(from,to);
}
once(oldEligible,newEligible,'clan boss eligible threshold audit');
once(oldChance,newChance,'clan boss shared roll default chance audit');
fs.writeFileSync(p,s,'utf8');
console.log('Synced clan-boss build audit with current boss-specific thresholds and shared-roll default chance.');
