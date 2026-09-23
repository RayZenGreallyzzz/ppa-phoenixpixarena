(function(){
'use strict';
if(window.__PPA_EVENT_CENTER_V3)return;
window.__PPA_EVENT_CENTER_V3=true;

var CARD='data:image/webp;base64,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';
var CFG={
 id:'great_ruri_monthly',name:'Великий Рури',active:true,testPhase:true,
 period:'10 дней каждый месяц',petDamagePct:20,
 recipe:{demonic:72,fire:10,blood:7,crystal:11},
 drops:{
  demonic:'Обычные мобы 1–60 · 0,05%',
  fire:'Элита 1–60 · 0,8%',
  blood:'Боссы 20 / 40 / 60 · 1,5% / 2,5% / 4%',
  crystal:'Мировой босс · 8%'
 }
};
window.PPA_RURI_EVENT_CONFIG=CFG;
window.PPA_RURI_EVENT_ACTIVE=true;
window.PPA_RURI_EVENT_IS_ACTIVE=function(){return window.PPA_RURI_EVENT_ACTIVE===true};

var LAST={doc:null,modal:null,title:null,titan:null,citadel:null};
var suppressUntil=0;

function txt(n){try{return String(n&&n.textContent||'').trim()}catch(_){return ''}}
function allDocs(){
 var out=[document],seen=[document],ifs=document.querySelectorAll('iframe');
 for(var i=0;i<ifs.length;i++){
  try{var d=ifs[i].contentDocument;if(d&&seen.indexOf(d)<0){seen.push(d);out.push(d)}}catch(_){}
 }
 return out;
}
function exactIn(doc,label){
 if(!doc)return null;
 var nodes=doc.querySelectorAll('div,span,b,strong,h1,h2,h3,h4,p,button');
 for(var i=0;i<nodes.length;i++)if(txt(nodes[i])===label)return nodes[i];
 return null;
}
function common(a,b,max){
 if(!a||!b)return null;
 var arr=[],n=a,d=0;
 while(n&&d++<(max||20)){arr.push(n);n=n.parentElement}
 n=b;d=0;
 while(n&&d++<(max||20)){if(arr.indexOf(n)>=0)return n;n=n.parentElement}
 return null;
}
function cardFor(doc,label){
 var n=exactIn(doc,label);if(!n)return null;
 var cur=n;
 for(var i=0;i<9&&cur;i++,cur=cur.parentElement){
  var q=cur.querySelector?cur.querySelector('img,canvas'):null;
  if(q&&txt(cur).indexOf(label)>=0)return cur;
 }
 return n.parentElement||n;
}
function locate(doc){
 var title=exactIn(doc,'СОБЫТИЯ')||exactIn(doc,'События');
 var titan=exactIn(doc,'Кристальный Титан');
 var cit=exactIn(doc,'Цитадель Феникса');
 if(!title||(!titan&&!cit))return null;
 var evt=titan||cit;
 var modal=common(title,evt,24);
 if(!modal||modal===doc.body||modal===doc.documentElement)return null;
 LAST.doc=doc;LAST.modal=modal;LAST.title=title;
 LAST.titan=cardFor(doc,'Кристальный Титан');
 LAST.citadel=cardFor(doc,'Цитадель Феникса');
 return LAST;
}
function imageFrom(node){
 if(!node)return '';
 var im=node.querySelector&&node.querySelector('img');
 return im&&im.src?im.src:'';
}
function styleDoc(doc){
 if(doc.getElementById('ppaEventCenterStyle'))return;
 var s=doc.createElement('style');s.id='ppaEventCenterStyle';
 s.textContent=
 '#ppaEventCenter{position:absolute;z-index:2147483000;left:14px;right:14px;bottom:12px;display:grid;grid-template-columns:176px minmax(0,1fr);overflow:hidden;border:1px solid #8b5426;border-radius:9px;background:#0c0907;box-shadow:0 12px 38px rgba(0,0,0,.72);box-sizing:border-box}'+
 '#ppaECNav{overflow:auto;padding:9px 7px;border-right:1px solid #5a3a22;background:linear-gradient(180deg,#170f0b,#0d0907);box-sizing:border-box}'+
 '.ppaECCat{width:100%;min-height:42px;margin:0 0 6px;padding:7px 8px;border:1px solid #513721;border-radius:7px;background:#16100c;color:#c3a77a;text-align:left;font:bold 11px Georgia,serif;box-sizing:border-box}'+
 '.ppaECCat.on{border-color:#bd6928;background:linear-gradient(90deg,#4a190e,#22120c);color:#ffd27b;box-shadow:0 0 14px rgba(255,103,25,.14) inset}'+
 '.ppaECSub{display:none;margin:-2px 0 8px;padding-left:5px}.ppaECSub.on{display:block}.ppaECEvent{width:100%;min-height:34px;margin:4px 0;padding:6px 7px;border:1px solid #44301f;border-radius:6px;background:#0f0c0a;color:#a68e6c;text-align:left;font:9px/1.25 monospace;box-sizing:border-box}.ppaECEvent.on{border-color:#985325;background:#25140d;color:#f0c06d}.ppaECDot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#75ff69;margin-right:5px;vertical-align:1px;box-shadow:0 0 6px #5cff55}'+
 '#ppaECMain{min-width:0;display:grid;grid-template-rows:42px minmax(0,1fr);overflow:hidden}#ppaECTop{display:flex;align-items:center;padding:0 11px;border-bottom:1px solid #49311e;background:#120c09;font:bold 15px Georgia,serif;color:#eec173}#ppaECContent{overflow:auto;padding:10px;box-sizing:border-box}'+
 '.ppaECHero{display:grid;grid-template-columns:minmax(210px,42%) minmax(0,1fr);gap:12px;align-items:start}.ppaECHeroImg{display:block;width:100%;max-height:62vh;object-fit:contain;border:1px solid #67441f;border-radius:7px;background:#080706}.ppaECInfo{padding:11px;border:1px solid #52371f;border-radius:7px;background:#120d09}.ppaECInfo h2{margin:0 0 7px;font:700 22px Georgia,serif;color:#f2c36d}.ppaECInfo h3{margin:11px 0 6px;font:700 13px Georgia,serif;color:#e6b35a}.ppaECInfo p{margin:5px 0;font:10px/1.5 monospace;color:#c7b188}.ppaECStatus{margin-bottom:8px;color:#84ff80;font:bold 10px monospace}.ppaECRecipe{color:#ffd178;font:bold 12px/1.55 monospace}.ppaECAction{width:100%;min-height:42px;margin-top:10px;border:1px solid #a45b25;border-radius:7px;background:linear-gradient(#4b2613,#27150d);color:#f6cb79;font:bold 11px Georgia,serif}.ppaECEmpty{min-height:250px;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;border:1px dashed #4d3523;border-radius:7px;color:#8c785d;font:10px/1.6 monospace;box-sizing:border-box}'+
 '@media(max-width:600px),(max-height:720px){#ppaEventCenter{left:6px;right:6px;bottom:6px;grid-template-columns:94px minmax(0,1fr);border-radius:6px}#ppaECNav{padding:5px 4px}.ppaECCat{min-height:34px;padding:5px 5px;margin-bottom:4px;font-size:8px}.ppaECEvent{min-height:28px;padding:4px 5px;font-size:7px}.ppaECDot{width:5px;height:5px}#ppaECMain{grid-template-rows:34px minmax(0,1fr)}#ppaECTop{padding:0 7px;font-size:11px}#ppaECContent{padding:6px}.ppaECHero{grid-template-columns:1fr;gap:6px}.ppaECHeroImg{max-width:240px;max-height:34vh;margin:auto}.ppaECInfo{padding:7px}.ppaECInfo h2{font-size:15px}.ppaECInfo h3{font-size:10px;margin-top:8px}.ppaECInfo p{font-size:8px;line-height:1.35}.ppaECStatus{font-size:8px}.ppaECRecipe{font-size:9px}.ppaECAction{min-height:34px;font-size:8px}}';
 (doc.head||doc.documentElement).appendChild(s);
}
function calcTop(ctx){
 var modal=ctx.modal,title=ctx.title;
 try{
  var mr=modal.getBoundingClientRect(),tr=title.getBoundingClientRect();
  var top=Math.max(62,Math.round(tr.bottom-mr.top+18));
  return top;
 }catch(_){return 86}
}
function ensureCenter(ctx){
 var doc=ctx.doc,modal=ctx.modal;
 styleDoc(doc);
 var h=doc.getElementById('ppaEventCenter');
 if(h&&h.parentElement!==modal){try{h.remove()}catch(_){};h=null}
 if(!h){
  h=doc.createElement('div');h.id='ppaEventCenter';
  h.innerHTML='<aside id="ppaECNav">'+
   '<button class="ppaECCat on" data-cat="game">🎮 ИГРОВЫЕ</button><div class="ppaECSub on" data-sub="game"><button class="ppaECEvent on" data-event="ruri"><span class="ppaECDot"></span>Великий Рури</button><button class="ppaECEvent" data-event="titan">💎 Кристальный Титан</button></div>'+
   '<button class="ppaECCat" data-cat="clan">🛡 КЛАНОВЫЕ</button><div class="ppaECSub" data-sub="clan"></div>'+
   '<button class="ppaECCat" data-cat="war">⚔ ВОЙНА</button><div class="ppaECSub" data-sub="war"><button class="ppaECEvent" data-event="citadel">🏰 Цитадель Феникса</button></div>'+
   '<button class="ppaECCat" data-cat="updates">📜 ОБНОВЛЕНИЯ</button><div class="ppaECSub" data-sub="updates"><button class="ppaECEvent" data-event="updates">Последнее</button></div>'+
  '</aside><section id="ppaECMain"><div id="ppaECTop">ЦЕНТР СОБЫТИЙ</div><div id="ppaECContent"></div></section>';
  modal.appendChild(h);
  h.querySelectorAll('.ppaECCat').forEach(function(b){b.onclick=function(e){e.stopPropagation();selectCategory(ctx,b.dataset.cat)}});
  h.querySelectorAll('.ppaECEvent').forEach(function(b){b.onclick=function(e){e.stopPropagation();selectEvent(ctx,b.dataset.event)}});
 }
 try{
  var cs=ctx.doc.defaultView.getComputedStyle(modal);
  if(cs.position==='static')modal.style.position='relative';
 }catch(_){modal.style.position='relative'}
 h.style.top=calcTop(ctx)+'px';
 return h;
}
function markEvent(ctx,id){
 var h=ensureCenter(ctx);
 h.querySelectorAll('.ppaECEvent').forEach(function(b){b.classList.toggle('on',b.dataset.event===id)});
}
function renderEmpty(ctx,title,msg){
 var c=ensureCenter(ctx).querySelector('#ppaECContent');
 c.innerHTML='<div class="ppaECEmpty"><div><b style="color:#d7b16c;font:15px Georgia,serif">'+title+'</b><br><br>'+msg+'</div></div>';
}
function renderRuri(ctx){
 markEvent(ctx,'ruri');
 var c=ensureCenter(ctx).querySelector('#ppaECContent');
 c.innerHTML='<div class="ppaECHero"><img class="ppaECHeroImg" src="'+CARD+'" alt="Великий Рури"><div class="ppaECInfo"><h2>🔥 Великий Рури</h2><div class="ppaECStatus">● АКТИВНО · ТЕСТОВЫЙ ЗАПУСК</div><p>Ограниченное событие на 10 дней каждый месяц. Ресурсы после завершения не исчезают и сохраняются до следующего запуска.</p><p><b>Великий Рури сам атакует врагов хозяина огненной магией. Урон питомца — 20% от силы атаки хозяина.</b></p><h3>ДРОП РЕСУРСОВ</h3><p>Демонический кристалл — обычные мобы 1–60 · 0,05%</p><p>Огненные осколки — элита 1–60 · 0,8%</p><p>Кровь монстра — боссы 20 / 40 / 60 · 1,5% / 2,5% / 4%</p><p>Хрустальный кристалл — мировой босс · 8%</p><h3>КРАФТ ВЕЛИКОГО РУРИ</h3><div class="ppaECRecipe">72 Демонических + 10 Огненных + 7 Крови монстра + 11 Хрустальных</div><p>Ресурсы постоянные и могут продаваться на аукционе круглый год.</p></div></div>';
}
function renderTitan(ctx){
 markEvent(ctx,'titan');
 var c=ensureCenter(ctx).querySelector('#ppaECContent'),im=imageFrom(ctx.titan);
 c.innerHTML='<div class="ppaECHero">'+(im?'<img class="ppaECHeroImg" src="'+im+'" alt="Кристальный Титан">':'<div class="ppaECEmpty">💎</div>')+'<div class="ppaECInfo"><h2>💎 Кристальный Титан</h2><div class="ppaECStatus">МИРОВОЙ БОСС</div><p>Кристальный Титан остаётся на своей существующей серверной механике. Ежедневный откат — 18:00.</p><p>Мы меняем только интерфейс события, не трогая бой, награды и серверный таймер.</p><button class="ppaECAction" id="ppaECTitanOpen">УЧАСТВОВАТЬ</button></div></div>';
 var b=c.querySelector('#ppaECTitanOpen');if(b)b.onclick=function(e){e.stopPropagation();openLegacy(ctx,'titan')};
}
function renderCitadel(ctx){
 markEvent(ctx,'citadel');
 var c=ensureCenter(ctx).querySelector('#ppaECContent'),im=imageFrom(ctx.citadel);
 c.innerHTML='<div class="ppaECHero">'+(im?'<img class="ppaECHeroImg" src="'+im+'" alt="Цитадель Феникса">':'<div class="ppaECEmpty">🏰</div>')+'<div class="ppaECInfo"><h2>🏰 Цитадель Феникса</h2><div class="ppaECStatus">КЛАНОВАЯ ВОЙНА</div><p>4 сильнейших клана по 8 игроков. Сначала уничтожаются 4 кристалла, затем открывается захват замка.</p><p>Владение замком — 3 дня. Бонусы победившему клану: XP +5%, золото +5%, ресурсы +5%, скорость +3%.</p><button class="ppaECAction" id="ppaECCitadelOpen">ОТКРЫТЬ ВОЙНУ</button></div></div>';
 var b=c.querySelector('#ppaECCitadelOpen');if(b)b.onclick=function(e){e.stopPropagation();openLegacy(ctx,'citadel')};
}
function renderUpdates(ctx){
 markEvent(ctx,'updates');
 var c=ensureCenter(ctx).querySelector('#ppaECContent');
 c.innerHTML='<div class="ppaECInfo"><h2>📜 Обновления</h2><p>Здесь будут новости игры: новые события, боссы, предметы, изменения баланса и исправления.</p><p>Этот раздел уже отделён от игровых и клановых событий, поэтому новые записи можно будет добавлять независимо.</p></div>';
}
function selectEvent(ctx,id){
 if(id==='ruri')renderRuri(ctx);
 else if(id==='titan')renderTitan(ctx);
 else if(id==='citadel')renderCitadel(ctx);
 else renderUpdates(ctx);
}
function selectCategory(ctx,cat){
 var h=ensureCenter(ctx);
 h.querySelectorAll('.ppaECCat').forEach(function(b){b.classList.toggle('on',b.dataset.cat===cat)});
 h.querySelectorAll('.ppaECSub').forEach(function(s){s.classList.toggle('on',s.dataset.sub===cat)});
 if(cat==='game')renderRuri(ctx);
 else if(cat==='war')renderCitadel(ctx);
 else if(cat==='updates')renderUpdates(ctx);
 else renderEmpty(ctx,'КЛАНОВЫЕ СОБЫТИЯ','Здесь будут появляться отдельные события для кланов.');
}
function openLegacy(ctx,kind){
 var node=kind==='titan'?ctx.titan:ctx.citadel;
 var h=ctx.doc.getElementById('ppaEventCenter');
 suppressUntil=Date.now()+900;
 if(h)h.style.display='none';
 try{if(node)node.click()}catch(_){}
 setTimeout(function(){
  if(h)h.style.display='grid';
  if(kind==='titan')renderTitan(ctx);else renderCitadel(ctx);
 },350);
}
function activateDoc(doc){
 if(Date.now()<suppressUntil)return false;
 var ctx=locate(doc);if(!ctx)return false;
 var h=ensureCenter(ctx);h.style.display='grid';
 selectCategory(ctx,'game');
 return true;
}
window.PPA_OPEN_RURI_EVENT=function(){
 var ds=allDocs();
 for(var i=0;i<ds.length;i++)if(activateDoc(ds[i]))return true;
 return false;
};
window.PPA_REFRESH_RURI_EVENT_UI=window.PPA_OPEN_RURI_EVENT;

function installDoc(doc){
 if(!doc||doc.__ppaEventCenterListener)return;
 doc.__ppaEventCenterListener=true;
 doc.addEventListener('click',function(e){
  if(Date.now()<suppressUntil)return;
  var h=doc.getElementById('ppaEventCenter');
  if(h&&e&&e.target&&h.contains(e.target))return;
  setTimeout(function(){activateDoc(doc)},90);
  setTimeout(function(){activateDoc(doc)},260);
 },true);
}
function installAll(){
 var ds=allDocs();for(var i=0;i<ds.length;i++)installDoc(ds[i]);
}
installAll();
setTimeout(installAll,400);
setTimeout(installAll,1200);
setTimeout(installAll,3000);
})();