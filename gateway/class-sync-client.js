(function(){
  'use strict';

  var lastSynced='',busy=false,timer=0;

  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function initData(){var t=tg();return t&&t.initData?String(t.initData):''}
  function normalize(v){
    v=String(v||'').trim();var l=v.toLowerCase();
    if(['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(l))return l;
    try{if(typeof classKeyFromName==='function'){var k=classKeyFromName(v);if(k)return String(k).toLowerCase()}}catch(_){}
    if(l.includes('страж')||l.includes('tank'))return'tank';
    if(l.includes('бер')||l.includes('barb'))return'barbarian';
    if(l.includes('пал'))return'paladin';
    if(l.includes('гном')||l.includes('cannon'))return'gnome';
    if(l.includes('луч')||l.includes('archer'))return'archer';
    if(l.includes('маг')||l.includes('mage'))return'mage';
    if(l.includes('асс')||l.includes('assassin'))return'assassin';
    if(l.includes('жр')||l.includes('priest'))return'priest';
    return'';
  }
  function currentClass(){
    var vals=[];
    try{if(typeof P!=='undefined'&&P)vals.push(P.classKey,P.cls,P.className,P._saved&&P._saved.cls)}catch(_){}
    try{if(typeof INV!=='undefined'&&INV)vals.push(INV.classKey,INV.cls,INV.className)}catch(_){}
    try{var s=JSON.parse(localStorage.getItem('pxSave')||'null');if(s)vals.push(s.classKey,s.cls,s.className)}catch(_){}
    for(var i=0;i<vals.length;i++){var k=normalize(vals[i]);if(k)return k}
    return'';
  }
  function arm(ms){clearTimeout(timer);timer=setTimeout(sync,Math.max(700,ms||4000))}
  async function sync(){
    if(busy){arm(2500);return}
    var d=initData(),k=currentClass();
    if(!d||!k){arm(2500);return}
    if(k===lastSynced){arm(10000);return}
    busy=true;
    try{
      var r=await fetch('/api/profile/sync-class',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData:d,classKey:k}),credentials:'same-origin',cache:'no-store'});
      var j=null;try{j=await r.json()}catch(_){}
      if(!r.ok||!j||j.ok===false)throw new Error((j&&j.message)||('HTTP '+r.status));
      lastSynced=k;
      try{sessionStorage.setItem('ppaSyncedClass',k)}catch(_){}
    }catch(e){}
    busy=false;arm(lastSynced===k?10000:3000);
  }

  try{lastSynced=String(sessionStorage.getItem('ppaSyncedClass')||'')}catch(_){}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){arm(500)},{once:true});else arm(500);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)arm(700)},{passive:true});
})();
