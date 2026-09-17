(function(){
  'use strict';
  var done=false,tries=0;
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
    try{if(window.P){vals.push(P.classKey,P.cls,P.className,P._saved&&P._saved.cls)}}catch(_){}
    try{if(window.INV){vals.push(INV.classKey,INV.cls,INV.className)}}catch(_){}
    try{var s=JSON.parse(localStorage.getItem('pxSave')||'null');if(s)vals.push(s.classKey,s.cls,s.className)}catch(_){}
    for(var i=0;i<vals.length;i++){var k=normalize(vals[i]);if(k)return k}
    return'';
  }
  async function sync(){
    if(done)return;
    var d=initData(),k=currentClass();
    if(!d||!k){if(++tries<20)setTimeout(sync,350);return}
    done=true;
    try{
      var r=await fetch('/api/profile/sync-class',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData:d,classKey:k}),credentials:'same-origin',cache:'no-store'});
      var j=null;try{j=await r.json()}catch(_){}
      if(!r.ok||!j||j.ok===false)throw new Error((j&&j.message)||('HTTP '+r.status));
      try{sessionStorage.setItem('ppaSyncedClass',k)}catch(_){}
      setTimeout(function(){try{if(window.PPA_REALTIME_RECONNECT)window.PPA_REALTIME_RECONNECT()}catch(_){}},180);
    }catch(e){done=false;if(++tries<20)setTimeout(sync,700)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(sync,450)},{once:true});else setTimeout(sync,450);
})();
