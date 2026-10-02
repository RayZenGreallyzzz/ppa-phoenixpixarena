import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const realtimeServer=read('src/realtime-stable.js');
const realtimeClient=read('gateway/realtime-client.js');
const clanOnline=read('src/clan-online.js');
const dungeonMobEvents=read('gateway/dungeon-mob-events.js');
const worldCombat=read('gateway/world-combat-client.js');
const onlineClient=read('gateway/online-client.js');
const checks=[
['server respawn 12h',realtimeServer.includes('CLAN_BOSS_RESPAWN_MS = 12 * 60 * 60 * 1000')],
['no QA TEST OPEN',!realtimeServer.includes('CLAN_BOSS_QA_TEST_OPEN')],
['no QA RESPAWN',!realtimeServer.includes('CLAN_BOSS_QA_RESPAWN_MS')],
['no qaMode config',!realtimeServer.includes('qaMode:CLAN_BOSS_QA_TEST_OPEN')],
['no qaMode state',!realtimeServer.includes('st.qaMode=CLAN_BOSS_QA_TEST_OPEN')],
['no client 10sec label',!realtimeClient.includes('ТЕСТ · КЛАНОВЫЙ БОСС · ОТКАТ 10 СЕКУНД')],
['no clanOnline QA',!clanOnline.includes('CLAN_BOSS_QA_TEST_OPEN')],
['ui readyAt helper',clanOnline.includes('function clanBossUiReadyAt(v){return Math.max(0,Number(v)||0)}')],
['progUi helper',clanOnline.includes("function progUi(p,id='')")],
['personal progress',clanOnline.includes('personal=id?Number(by[String(id)])||0')],
['clanProgress meta',clanOnline.includes('base.clanProgress=progUi(meta.progress,id)')],
['server enter',realtimeServer.includes("m.type === 'clan-boss-enter'")],
['server hit',realtimeServer.includes("m.type === 'clan-boss-hit'")],
['server reward ack',realtimeServer.includes("m.type === 'clan-boss-reward-ack'")],
['server defeated',realtimeServer.includes("type:'clan-boss-defeated'")],
['server reward',realtimeServer.includes("type:'clan-boss-reward'")],
['mistress distribution',realtimeServer.includes('clanBossBuildMistressDistribution')],
['shared roll',realtimeServer.includes('clanBossSharedRoll')],
['eligible damage 5000',realtimeServer.includes('.filter(x=>x.damage>=5000)')],
['blue gear shared roll',realtimeServer.includes("clanBossSharedRoll(eligible,'blueGear','Синий шмот / оружие')")],
['premium stone shared roll',realtimeServer.includes("clanBossSharedRoll(eligible,'premiumStone','Премиум камень заточки')")],
['gray rune shared roll',realtimeServer.includes("clanBossSharedRoll(eligible,'grayRune','Серая универсальная руна')")],
['chance const',realtimeServer.includes('const chance=1')],
['normal stones',realtimeServer.includes('normalStones:4+Math.floor(Math.random()*4)')],
['server chest open',realtimeServer.includes("m.type === 'clan-boss-chest-open'")],
['server chest complete',realtimeServer.includes("m.type === 'clan-boss-chest-complete'")],
['server chest closed',realtimeServer.includes("state:'closed'")],
['server openAt 5sec',realtimeServer.includes('openAt=now+5000')],
['client reward recv',realtimeClient.includes("m.type==='clan-boss-reward'")],
['client spawn reward',realtimeClient.includes('PPA_CLAN_BOSS_SPAWN_REWARD')],
['room key format',realtimeServer.includes("return 'clan-boss:' + String(clanId")],
['client enter API',realtimeClient.includes('window.PPA_CLAN_BOSS_ENTER=clanBossEnter')],
['client damage API',realtimeClient.includes('window.PPA_CLAN_BOSS_DAMAGE=clanBossDamage')],
['client chest open API',realtimeClient.includes('window.PPA_CLAN_BOSS_CHEST_OPEN=clanBossChestOpen')],
['client chest complete API',realtimeClient.includes('window.PPA_CLAN_BOSS_CHEST_COMPLETE=clanBossChestComplete')],
['client self pid',realtimeClient.includes('window.PPA_CLAN_BOSS_SELF_PID=function')],
['local damage tracker',realtimeClient.includes('window.ppaClanBossTrackDamageLocal=function')],
['client hit packet',realtimeClient.includes("type:'clan-boss-hit'")],
['dungeon mob damage bridge',dungeonMobEvents.includes('e&&e.isClanBoss&&window.PPA_CLAN_BOSS_DAMAGE')],
['world clanboss scene',worldCombat.includes("s==='clanboss1'")],
['world siege/clanboss scene',worldCombat.includes("s==='clansiege'||s==='clanboss1'")],
['online startRaid route',onlineClient.includes("String(req.action||'')==='startRaid'")],
['clanOnline realtime required',clanOnline.includes("code:'REALTIME_REQUIRED'")],
];
let bad=0;
for(const [label,ok] of checks){console.log(`${ok?'OK  ':'MISS'} ${label}`);if(!ok)bad++}
console.log(`TOTAL_MISSING=${bad}`);
process.exitCode=bad?2:0;
