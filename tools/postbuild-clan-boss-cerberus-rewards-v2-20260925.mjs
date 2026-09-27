import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const rtPath = path.join(ROOT, 'src', 'realtime-stable.js');
const indexPath = path.join(ROOT, 'public', 'index.html');
if (!fs.existsSync(rtPath)) throw new Error('src/realtime-stable.js not found');

function replaceRegex(src, re, after, label) {
  if (!re.test(src)) throw new Error('Patch target not found: ' + label);
  re.lastIndex = 0;
  return src.replace(re, after);
}
function replaceText(src, before, after, label) {
  if (!src.includes(before)) throw new Error('Patch target not found: ' + label);
  return src.split(before).join(after);
}

let src = fs.readFileSync(rtPath, 'utf8');
const before = src;

if (!src.includes('clanBossBuildDistribution(st,now=Date.now())')) {
  src = replaceRegex(src, /  clanBossEligible\(st\) \{[\s\S]*?\n  \}\n\n  clanBossSharedRoll/, `  clanBossEligible(st) {
    const dmg=st&&st.damageByPid&&typeof st.damageByPid==='object'?st.damageByPid:{};
    const names=st&&st.nameByPid&&typeof st.nameByPid==='object'?st.nameByPid:{};
    const minDamage=String(st&&st.bossId||'')==='clan_boss_2'?100000:5000;
    return Object.keys(dmg)
      .map(pid=>({pid:String(pid),name:cleanName(names[pid]||'Игрок'),damage:Math.max(0,Number(dmg[pid])||0)}))
      .filter(x=>x.damage>=minDamage)
      .sort((a,b)=>b.damage-a.damage||String(a.pid).localeCompare(String(b.pid)));
  }

  clanBossSharedRoll`, 'clan boss eligible');

  src = replaceRegex(src, /  clanBossSharedRoll\(eligible,kind,label\) \{[\s\S]*?\n  \}\n\n  clanBossBuildMistressDistribution/, `  clanBossSharedRoll(eligible,kind,label,chance=1) {
    chance=Math.max(0,Math.min(1,Number(chance)));
    const dropped=eligible.length>0&&Math.random()<chance;
    if(!dropped)return{kind,label,chance,dropped:false,winnerPid:'',winnerName:'',winnerRoll:0,rolls:[]};
    const rolls=eligible.map(x=>({
      pid:x.pid,name:x.name,damage:x.damage,
      roll:1+Math.floor(Math.random()*100),
      tie:Math.random()
    })).sort((a,b)=>b.roll-a.roll||b.tie-a.tie||String(a.pid).localeCompare(String(b.pid)));
    const win=rolls[0];
    return{
      kind,label,chance,dropped:true,
      winnerPid:String(win.pid),winnerName:cleanName(win.name),winnerRoll:Number(win.roll)||0,
      rolls:rolls.map(x=>({pid:String(x.pid),name:cleanName(x.name),roll:Number(x.roll)||0}))
    };
  }

  clanBossBuildMistressDistribution`, 'clan boss shared roll chance');

  src = replaceRegex(src, /  clanBossBuildMistressDistribution\(st,now=Date\.now\(\)\) \{[\s\S]*?\n  \}\n\n  async sendClanBossReward/, `  clanBossBuildDistribution(st,now=Date.now()) {
    if(!st)return null;
    const bossId=String(st.bossId||'');
    if(bossId!=='clan_boss_1'&&bossId!=='clan_boss_2')return null;
    if(st.distribution&&st.distribution.id)return st.distribution;

    const cerberus=bossId==='clan_boss_2';
    const minDamage=cerberus?100000:5000;
    const eligible=this.clanBossEligible(st);
    const id='cbd:'+String(st.clanId||'')+':'+bossId+':'+String(st.defeatedAt||now);
    const shared=[];
    const rewards={};
    const rareWins={};
    const rarePoolWins={};

    const give=(roll,opt={})=>{
      if(!roll||!roll.dropped||!roll.winnerPid||!rewards[roll.winnerPid])return false;
      const rw=rewards[roll.winnerPid];
      const kind=String(opt.kind||roll.kind||'');
      if(kind==='blueGear'){rw.blueGear=true;rw.blueGearCount=Math.max(0,Number(rw.blueGearCount)||0)+1;}
      else if(kind==='premiumStone'){rw.premiumStone=true;rw.premiumStoneCount=Math.max(0,Number(rw.premiumStoneCount)||0)+1;}
      else if(kind==='grayRune'){rw.grayRune=true;rw.grayRuneCount=Math.max(0,Number(rw.grayRuneCount)||0)+1;}
      else if(kind==='blueResource'){rw.blueResources+=1;rw.blueResourcePool=Math.max(0,Number(rw.blueResourcePool)||0)+1;}
      else if(kind==='epicGear'){rw.epicGear=true;rw.epicGearCount=Math.max(0,Number(rw.epicGearCount)||0)+1;}
      else if(kind==='greenRune'){rw.greenRune=true;rw.greenRuneCount=Math.max(0,Number(rw.greenRuneCount)||0)+1;}
      else if(kind==='blueRune'){rw.blueRune=true;rw.blueRuneCount=Math.max(0,Number(rw.blueRuneCount)||0)+1;}
      else if(kind==='activeBookRank2'){rw.activeBookRank2=true;}
      else if(kind==='passiveBookRank2'){rw.passiveBookRank2=true;}
      else if(kind==='monsterBlood'){rw.monsterBlood=Math.max(0,Number(rw.monsterBlood)||0)+1;}
      else if(kind==='fireShards'){rw.fireShards=Math.max(0,Number(rw.fireShards)||0)+1;}
      else if(kind==='demonicCrystal'){rw.demonicCrystal=Math.max(0,Number(rw.demonicCrystal)||0)+1;}
      else if(kind==='ruriCrystal'){rw.ruriCrystal=Math.max(0,Number(rw.ruriCrystal)||0)+1;}
      else{rw[kind]=true;}
      if(opt.anyRare!==false)rareWins[roll.winnerPid]=(rareWins[roll.winnerPid]||0)+1;
      if(opt.rarePool===true)rarePoolWins[roll.winnerPid]=(rarePoolWins[roll.winnerPid]||0)+1;
      return true;
    };

    for(const p of eligible){
      if(cerberus){
        const damageCoins=Math.min(6000,Math.floor(Math.max(0,p.damage)/7500));
        rewards[p.pid]={
          rewardId:id+':'+p.pid,bossId,
          damage:p.damage,rank:0,
          greenResources:2,blueResources:0,normalStones:8+Math.floor(Math.random()*7),
          clanCoins:damageCoins,damageCoins,
          blueGear:false,blueGearCount:0,premiumStone:false,premiumStoneCount:0,grayRune:false,grayRuneCount:0,
          epicGear:false,epicGearCount:0,greenRune:false,greenRuneCount:0,blueRune:false,blueRuneCount:0,
          activeBookRank2:false,passiveBookRank2:false,
          monsterBlood:0,fireShards:0,demonicCrystal:0,ruriCrystal:0,
          participation:true,topBonus:'',killBonus:false,consolation:false,
          createdAt:now,acked:false
        };
      }else{
        const damageCoins=Math.min(500,Math.floor(Math.max(0,p.damage)/10000));
        rewards[p.pid]={
          rewardId:id+':'+p.pid,bossId:'clan_boss_1',
          damage:p.damage,rank:0,
          greenResources:1,blueResources:0,normalStones:4+Math.floor(Math.random()*4),
          clanCoins:3+damageCoins,
          blueGear:false,premiumStone:false,grayRune:false,
          runeRoll:Math.floor(Math.random()*1000000000),
          participation:true,damageCoins,
          topBonus:'',killBonus:false,consolation:false,
          createdAt:now,acked:false
        };
      }
      rareWins[p.pid]=0;rarePoolWins[p.pid]=0;
    }

    if(cerberus){
      shared.push(
        this.clanBossSharedRoll(eligible,'blueGear','Синий шмот / оружие #1'),
        this.clanBossSharedRoll(eligible,'blueGear','Синий шмот / оружие #2'),
        this.clanBossSharedRoll(eligible,'premiumStone','Премиум камень заточки #1'),
        this.clanBossSharedRoll(eligible,'premiumStone','Премиум камень заточки #2'),
        this.clanBossSharedRoll(eligible,'grayRune','Универсальная руна'),
        this.clanBossSharedRoll(eligible,'blueResource','Синий ресурс #1'),
        this.clanBossSharedRoll(eligible,'blueResource','Синий ресурс #2'),
        this.clanBossSharedRoll(eligible,'blueResource','Синий ресурс #3'),
        this.clanBossSharedRoll(eligible,'epicGear','Эпический шмот / оружие',0.12),
        this.clanBossSharedRoll(eligible,'greenRune','Зелёная руна',0.25),
        this.clanBossSharedRoll(eligible,'blueRune','Синяя руна',0.08),
        this.clanBossSharedRoll(eligible,'activeBookRank2','Книга активного навыка · ранг II',0.00008),
        this.clanBossSharedRoll(eligible,'passiveBookRank2','Книга пассивного навыка · ранг II',0.00007),
        this.clanBossSharedRoll(eligible,'monsterBlood','Кровь монстра',0.22),
        this.clanBossSharedRoll(eligible,'fireShards','Огненные осколки',0.14),
        this.clanBossSharedRoll(eligible,'demonicCrystal','Демонический кристалл',0.04),
        this.clanBossSharedRoll(eligible,'ruriCrystal','Кристалл Рури',0.01)
      );
    }else{
      shared.push(
        this.clanBossSharedRoll(eligible,'blueGear','Синий шмот / оружие'),
        this.clanBossSharedRoll(eligible,'premiumStone','Премиум камень заточки'),
        this.clanBossSharedRoll(eligible,'grayRune','Серая универсальная руна')
      );
    }

    for(let i=0;i<Math.min(3,eligible.length);i++){
      const p=eligible[i],rw=rewards[p.pid];if(!rw)continue;
      rw.rank=i+1;
      if(cerberus){
        if(i===0){rw.blueResources+=3;rw.normalStones+=5;rw.topBonus='1 место по урону · доп. редкий ролл';}
        else if(i===1){rw.blueResources+=2;rw.normalStones+=4;rw.topBonus='2 место по урону';}
        else{rw.blueResources+=1;rw.normalStones+=3;rw.topBonus='3 место по урону';}
      }else{
        if(i===0){rw.blueResources+=2;rw.normalStones+=4;rw.topBonus='1 место по урону';}
        else if(i===1){rw.blueResources+=1;rw.normalStones+=3;rw.topBonus='2 место по урону';}
        else{rw.greenResources+=2;rw.normalStones+=2;rw.topBonus='3 место по урону';}
      }
    }

    if(cerberus&&eligible[0]){
      const leader=eligible[0];
      const bonusPool=[
        {kind:'epicGear',label:'Доп. редкий ролл · Эпический шмот / оружие'},
        {kind:'greenRune',label:'Доп. редкий ролл · Зелёная руна'},
        {kind:'blueRune',label:'Доп. редкий ролл · Синяя руна'},
        {kind:'monsterBlood',label:'Доп. редкий ролл · Кровь монстра'},
        {kind:'fireShards',label:'Доп. редкий ролл · Огненные осколки'}
      ];
      const pick=bonusPool[Math.floor(Math.random()*bonusPool.length)];
      const roll=this.clanBossSharedRoll([leader],pick.kind,pick.label,1);
      roll.bonusTop=true;
      shared.push(roll);
    }

    const killerPid=String(st.lastHitPid||'');
    if(rewards[killerPid]){
      rewards[killerPid].clanCoins+=cerberus?15:10;
      rewards[killerPid].blueResources+=1;
      rewards[killerPid].killBonus=true;
    }

    for(const roll of shared){
      if(!cerberus){give(roll,{kind:roll.kind});continue;}
      const rareKind=['epicGear','greenRune','blueRune','activeBookRank2','passiveBookRank2','monsterBlood','fireShards','demonicCrystal','ruriCrystal'].includes(String(roll.kind||''));
      give(roll,{kind:roll.kind,anyRare:rareKind,rarePool:rareKind});
    }

    if(cerberus){
      const anyRarePool=Object.values(rarePoolWins).some(v=>Number(v)>0);
      if(!anyRarePool&&eligible[0]&&rewards[eligible[0].pid]){
        const rw=rewards[eligible[0].pid];
        rw.premiumStone=true;rw.premiumStoneCount=Math.max(0,Number(rw.premiumStoneCount)||0)+1;
        rw.grayRune=true;rw.grayRuneCount=Math.max(0,Number(rw.grayRuneCount)||0)+1;
        rw.clanCoins+=10;rw.consolation=true;
      }
    }else{
      for(const p of eligible){
        const rw=rewards[p.pid];if(!rw)continue;
        if(!(rareWins[p.pid]>0)){
          rw.greenResources+=1;
          rw.normalStones+=2;
          rw.clanCoins+=5;
          rw.consolation=true;
        }
      }
    }

    st.rewardsByPid=rewards;
    st.distribution={
      id,bossId,createdAt:now,minDamage,
      bossTitle:cerberus?'Цербер':'Владычица',
      eligible:eligible.map(x=>({pid:x.pid,name:x.name,damage:x.damage})),
      shared,
      killerPid,killerName:cleanName(st.nameByPid&&st.nameByPid[killerPid]||''),
      openedByPid:String(st.chest&&st.chest.openerPid||''),
      openedByName:cleanName(st.chest&&st.chest.openerName||'')
    };
    return st.distribution;
  }

  clanBossBuildMistressDistribution(st,now=Date.now()) {
    return this.clanBossBuildDistribution(st,now);
  }

  async sendClanBossReward`, 'clan boss distribution builder');

  src = replaceText(src, `    const distribution=this.clanBossBuildMistressDistribution(st,now);`, `    const distribution=this.clanBossBuildDistribution(st,now);`, 'generic distribution call');
  src = replaceText(src, `        text:'Сундук Владычицы открыт · награды распределены · монеты клана +'+clanCoinGain,ts:now`, `        text:'Сундук '+(String(st.distribution.bossId||'')==='clan_boss_2'?'Цербера':'Владычицы')+' открыт · награды распределены · монеты клана +'+clanCoinGain,ts:now`, 'reward event title');
}

if (!src.includes('clanBossBuildDistribution(st,now=Date.now())') ||
    !src.includes("const minDamage=String(st&&st.bossId||'')==='clan_boss_2'?100000:5000") ||
    !src.includes('damageCoins=Math.min(6000,Math.floor(Math.max(0,p.damage)/7500))') ||
    !src.includes("bossTitle:cerberus?'Цербер':'Владычица'")) {
  throw new Error('Cerberus clan boss reward validation failed');
}

if (src !== before) fs.writeFileSync(rtPath, src, 'utf8');

if (fs.existsSync(indexPath)) {
  const KEY = 'v612-clan-boss-cerberus-drop-20260925';
  let html = fs.readFileSync(indexPath, 'utf8');
  const beforeHtml = html;
  html = html
    .split('v602-clan-siege-exit-visible-20260925').join(KEY)
    .split('v603-clan-siege-native-clean-20260925').join(KEY)
    .split('v604-clan-siege-native-leave-20260925').join(KEY)
    .split('v605-clan-siege-won-fps-20260925').join(KEY)
    .split('v606-clan-siege-city-exit-20260925').join(KEY)
    .split('v607-clan-siege-castle-cache-20260925').join(KEY)
    .split('v608-pc-mouse-hotkeys-20260925').join(KEY)
    .split('v609-pc-mouse-hotkeys-safe-20260925').join(KEY)
    .split('v610-pc-telegram-desktop-20260925').join(KEY)
    .split('v611-hide-duplicate-city-button-20260925').join(KEY);
  if (html !== beforeHtml) fs.writeFileSync(indexPath, html, 'utf8');
}

console.log('[PPA POSTBUILD] clan boss Cerberus rewards applied: min damage 100000, guaranteed pool, rare/event drops.');
