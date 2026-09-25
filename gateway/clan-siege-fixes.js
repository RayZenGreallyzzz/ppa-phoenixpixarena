(function(){
  'use strict';
  if(window.__PPA_CLAN_SIEGE_FIX_V1)return;
  window.__PPA_CLAN_SIEGE_FIX_V1=true;

  var captured=false,wrappedHandler=null,exitBtn=null,compactHud=null,hudSource=null,qaBtn=null,nativeHudShifted=null;
  var drawInstalled=false,castleImage=null,candidates=new Map(),lastScene='';
  var CLAN_SIEGE_QA_TEST_OPEN=true;
  window.PPA_CLAN_SIEGE_QA_TEST_OPEN=CLAN_SIEGE_QA_TEST_OPEN;
  var scanAt=0;

  function scene(){
    try{return String(P&&P.scene||'')}catch(_){return''}
  }
  function inSiege(){return scene()==='clansiege'}
  function note(t,c){try{if(typeof showPickup==='function')showPickup(String(t||''),c||'#ffd36a')}catch(_){}}
  function visible(el){
    try{
      if(!el||!el.isConnected)return false;
      var r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden';
    }catch(_){return false}
  }

  function ensureStyle(){
    if(document.getElementById('ppaClanSiegeFixStyle'))return;
    var s=document.createElement('style');s.id='ppaClanSiegeFixStyle';
    s.textContent=
      '#ppaClanSiegeCompactHud{position:fixed;left:calc(60% - 30px);top:6px;transform:translateX(-50%);z-index:46;display:none;'+
      'width:min(330px,54vw);max-width:330px;min-height:29px;box-sizing:border-box;padding:4px 8px;border:1px solid rgba(195,128,45,.7);'+
      'border-radius:7px;background:rgba(21,18,12,.82);box-shadow:0 2px 9px rgba(0,0,0,.58);color:#e8d9ad;'+
      'font:700 8px/1.25 monospace;text-align:center;white-space:normal;pointer-events:none}'+
      '#ppaClanSiegeExit{position:fixed;right:12px;top:108px;z-index:58;display:none;min-width:96px;height:34px;padding:0 11px;'+
      'border:1px solid #c58435;border-radius:8px;background:linear-gradient(#542815,#2b160d);color:#ffd787;'+
      'box-shadow:0 3px 12px rgba(0,0,0,.65);font:800 10px monospace;touch-action:manipulation}'+
      '#ppaClanSiegeQaEnter{display:none;margin:8px auto 0;min-width:170px;height:32px;padding:0 12px;border:1px solid #d69a42;border-radius:8px;background:linear-gradient(#5d3517,#2d180c);color:#ffe09a;font:800 9px monospace;box-shadow:0 3px 10px rgba(0,0,0,.5);touch-action:manipulation}'+
      '@media(max-width:520px){#ppaClanSiegeCompactHud{left:calc(61% - 30px);width:56vw;max-width:260px;font-size:7px;padding:3px 5px}#ppaClanSiegeExit{top:98px;right:8px;height:31px;min-width:84px;font-size:9px}}';
    (document.head||document.documentElement).appendChild(s);
  }

  function ensureUi(){
    ensureStyle();
    if(!compactHud||!compactHud.isConnected){
      compactHud=document.createElement('div');compactHud.id='ppaClanSiegeCompactHud';
      document.body.appendChild(compactHud);
    }
    if(!qaBtn||!qaBtn.isConnected){
      qaBtn=document.createElement('button');qaBtn.id='ppaClanSiegeQaEnter';qaBtn.type='button';qaBtn.textContent='ТЕСТ · ВОЙТИ СНОВА';
      qaBtn.onclick=function(ev){
        try{if(ev){ev.preventDefault();ev.stopPropagation()}}catch(_){}
        qaEnterSiege();
      };
    }
    if(!exitBtn||!exitBtn.isConnected){
      exitBtn=document.createElement('button');exitBtn.id='ppaClanSiegeExit';exitBtn.type='button';exitBtn.textContent='↩ ВЫЙТИ';
      exitBtn.onclick=function(){
        captured=false;
        try{sessionStorage.removeItem('ppaClanSiegeCapturedV1')}catch(_){}
        cleanupHud();
        exitBtn.style.display='none';
        try{
          if(typeof changeScene==='function'){changeScene('safe');return}
        }catch(_){}
        try{if(typeof window.PPA_CHANGE_SCENE==='function')window.PPA_CHANGE_SCENE('safe')}catch(_){}
      };
      document.body.appendChild(exitBtn);
    }
    installQaButton();
  }

  function clanReadyForQa(){
    try{
      var st=window.PPA_SERVER_CLAN_STATE;
      return !!(st&&st.clan&&st.clan.id);
    }catch(_){return false}
  }
  function qaEnterSiege(){
    if(!CLAN_SIEGE_QA_TEST_OPEN)return false;
    if(!clanReadyForQa()){note('ТЕСТ ОСАДЫ · сначала войди в клан','#ff9a7a');return false}
    try{sessionStorage.removeItem('ppaClanSiegeCapturedV1')}catch(_){}
    captured=false;castleImage=null;candidates.clear();cleanupHud();
    try{
      if(typeof changeScene==='function'){
        changeScene('clansiege');
        note('ТЕСТ ОСАДЫ · ОТКАТ ОТКЛЮЧЁН','#91ffab');
        return true;
      }
    }catch(_){}
    try{
      if(typeof window.PPA_CHANGE_SCENE==='function'){
        window.PPA_CHANGE_SCENE('clansiege');
        note('ТЕСТ ОСАДЫ · ОТКАТ ОТКЛЮЧЁН','#91ffab');
        return true;
      }
    }catch(_){}
    note('ТЕСТ ОСАДЫ · вход недоступен','#ff9a7a');
    return false;
  }
  window.PPA_CLAN_SIEGE_QA_ENTER=qaEnterSiege;

  function installQaButton(){
    if(!CLAN_SIEGE_QA_TEST_OPEN||!qaBtn)return;
    try{
      var direct=document.getElementById('ppaOpenCitadel');
      if(direct&&direct.parentElement){
        if(qaBtn.parentElement!==direct.parentElement)direct.insertAdjacentElement('afterend',qaBtn);
        qaBtn.style.display='block';
        return;
      }
      var nodes=document.querySelectorAll('button,a,[role="button"],div');
      for(var i=0;i<nodes.length;i++){
        var el=nodes[i],t=String(el.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
        if(!t||t.length>80)continue;
        if(t.indexOf('ЦИТАДЕЛ')<0&&t.indexOf('КЛАНОВАЯ ВОЙНА')<0)continue;
        if(!visible(el))continue;
        var host=el.parentElement||el;
        if(qaBtn.parentElement!==host)host.appendChild(qaBtn);
        qaBtn.style.display='block';
        return;
      }
      qaBtn.style.display='none';
    }catch(_){}
  }

  function restoreHudSource(){
    try{
      if(hudSource&&hudSource.isConnected&&hudSource.dataset.ppaSiegeHudHidden==='1'){
        hudSource.style.visibility=hudSource.dataset.ppaSiegeOldVisibility||'';
        delete hudSource.dataset.ppaSiegeHudHidden;
        delete hudSource.dataset.ppaSiegeOldVisibility;
      }
    }catch(_){}
    hudSource=null;
  }
  function cleanupHud(){
    restoreHudSource();
    if(compactHud)compactHud.style.display='none';
  }

  function restoreNativeSiegeHud(){
    try{
      if(nativeHudShifted&&nativeHudShifted.isConnected&&nativeHudShifted.dataset.ppaSiegeShifted==='1'){
        nativeHudShifted.style.translate=nativeHudShifted.dataset.ppaSiegeOldTranslate||'';
        delete nativeHudShifted.dataset.ppaSiegeShifted;
        delete nativeHudShifted.dataset.ppaSiegeOldTranslate;
      }
    }catch(_){}
    nativeHudShifted=null;
  }

  function shiftNativeSiegeHud(){
    if(!inSiege()){restoreNativeSiegeHud();return null}
    try{
      var nodes=document.querySelectorAll('div,section,aside,header');
      var best=null,bestScore=-1;
      for(var i=0;i<nodes.length;i++){
        var el=nodes[i],t='';
        try{t=String(el.textContent||'').replace(/\s+/g,' ').trim().toUpperCase()}catch(_){continue}
        if(!t||t.length>220)continue;
        var siegeText=t.indexOf('КРИСТАЛЛ')>=0||(t.indexOf('ЗАХВАТ')>=0&&(t.indexOf('ATK')>=0||t.indexOf('DEF')>=0));
        if(!siegeText)continue;
        var r;try{r=el.getBoundingClientRect()}catch(_){continue}
        if(r.top>145||r.bottom<0||r.width<220||r.width>620||r.height<16||r.height>120)continue;
        var score=r.width-(r.height*1.5)-Math.abs(r.top-6)*1.5;
        if(score>bestScore){best=el;bestScore=score}
      }
      if(!best)return null;
      if(nativeHudShifted&&nativeHudShifted!==best)restoreNativeSiegeHud();
      nativeHudShifted=best;
      if(best.dataset.ppaSiegeShifted!=='1'){
        best.dataset.ppaSiegeOldTranslate=best.style.translate||'';
        best.dataset.ppaSiegeShifted='1';
      }
      best.style.translate='-30px 0px';
      return best;
    }catch(_){return null}
  }

  function captureHudCandidate(){
    if(!inSiege())return null;
    if(hudSource&&hudSource.isConnected)return hudSource;
    var nodes=document.querySelectorAll('div,section,aside,header');
    var best=null,bestScore=-1;
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i],t='';
      try{t=String(el.textContent||'').replace(/\s+/g,' ').trim()}catch(_){continue}
      if(t.indexOf('ЗАХВАТ')<0||t.indexOf('ATK')<0||t.indexOf('DEF')<0)continue;
      var r;try{r=el.getBoundingClientRect()}catch(_){continue}
      if(r.top>145||r.bottom<0||r.width<240||r.height<18||r.height>115)continue;
      var score=r.width-(r.height*1.8);
      if(score>bestScore){best=el;bestScore=score}
    }
    if(best){
      hudSource=best;
      try{
        best.dataset.ppaSiegeOldVisibility=best.style.visibility||'';
        best.dataset.ppaSiegeHudHidden='1';
        best.style.visibility='hidden';
      }catch(_){}
    }
    return best;
  }

  function compactText(raw){
    raw=String(raw||'').replace(/\s+/g,' ').trim();
    if(raw.length>180)raw=raw.slice(0,180);
    return raw;
  }
  function updateCompactHud(){
    ensureUi();
    if(!inSiege()){cleanupHud();return}
    var src=captureHudCandidate();
    if(!src){if(compactHud)compactHud.style.display='none';return}
    var t=compactText(src.textContent);
    if(!t){compactHud.style.display='none';return}
    compactHud.textContent=t;
    compactHud.style.display='block';
  }

  function imageRect(args,img){
    var n=args.length,dx=0,dy=0,dw=0,dh=0;
    if(n===3){dx=Number(args[1]);dy=Number(args[2]);dw=Number(img&&img.naturalWidth||img&&img.width||0);dh=Number(img&&img.naturalHeight||img&&img.height||0)}
    else if(n===5){dx=Number(args[1]);dy=Number(args[2]);dw=Number(args[3]);dh=Number(args[4])}
    else if(n>=9){dx=Number(args[5]);dy=Number(args[6]);dw=Number(args[7]);dh=Number(args[8])}
    if(![dx,dy,dw,dh].every(Number.isFinite))return null;
    return{dx:dx,dy:dy,dw:Math.abs(dw),dh:Math.abs(dh)};
  }
  function castleCandidate(ctx,img,r){
    try{
      if(!r||!ctx||!ctx.canvas)return false;
      var cw=Math.max(1,Number(ctx.canvas.width)||1),ch=Math.max(1,Number(ctx.canvas.height)||1);
      if(r.dw<170||r.dh<150||r.dw>Math.min(720,cw*.78)||r.dh>Math.min(720,ch*.78))return false;
      if(r.dw*r.dh<30000)return false;
      var cx=r.dx+r.dw/2,cy=r.dy+r.dh/2;
      if(cx<cw*.20||cx>cw*.80||cy<ch*.14||cy>ch*.78)return false;
      var src=String(img&&(img.currentSrc||img.src)||'').toLowerCase();
      if(/map|floor|ground|background|arena[_-]?bg/.test(src))return false;
      return true;
    }catch(_){return false}
  }
  function chooseLearnedCastle(now){
    var best=null,bestScore=-1;
    candidates.forEach(function(v,img){
      if(!v||now-v.at>1800||v.count<2)return;
      var score=v.area*(1+Math.min(20,v.count)*.02);
      if(score>bestScore){best=img;bestScore=score}
    });
    return best;
  }

  function installDrawGuard(){
    if(drawInstalled)return true;
    try{
      var proto=window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype;
      if(!proto||proto.__ppaClanSiegeCastleGuard)return false;
      var base=proto.drawImage;
      proto.drawImage=function(){
        try{
          if(inSiege()&&this&&this.canvas&&(this.canvas.id==='c'||(typeof cv!=='undefined'&&this.canvas===cv))){
            var img=arguments[0],r=imageRect(arguments,img),now=Date.now();
            if(castleCandidate(this,img,r)){
              if(!captured){
                var v=candidates.get(img)||{count:0,area:0,at:0};
                v.count++;v.area=Math.max(v.area,r.dw*r.dh);v.at=now;candidates.set(img,v);
              }else{
                if(!castleImage)castleImage=chooseLearnedCastle(now)||img;
                if(img===castleImage)return;
              }
            }
          }
        }catch(_){}
        return base.apply(this,arguments);
      };
      proto.__ppaClanSiegeCastleGuard=true;drawInstalled=true;return true;
    }catch(_){return false}
  }

  function removeCastleEntities(){
    if(!captured||!inSiege())return;
    try{
      if(typeof EN!=='undefined'&&Array.isArray(EN)){
        for(var i=EN.length-1;i>=0;i--){
          var e=EN[i];
          if(e&&(e.isClanSiegeCastle===true||e.isCitadelCastle===true||e.clanSiegeCastle===true))EN.splice(i,1);
        }
      }
    }catch(_){}
    try{
      document.querySelectorAll('img').forEach(function(im){
        var src=String(im.currentSrc||im.src||'').toLowerCase();
        if(!/(castle|citadel|fortress|siege[-_]?castle)/.test(src))return;
        var r=im.getBoundingClientRect();
        if(r.width>150&&r.height>120)im.style.visibility='hidden';
      });
    }catch(_){}
  }

  function markCaptured(){
    if(!inSiege())return;
    captured=true;
    try{sessionStorage.setItem('ppaClanSiegeCapturedV1','1')}catch(_){}
    castleImage=chooseLearnedCastle(Date.now())||castleImage;
    ensureUi();exitBtn.style.display='block';
    removeCastleEntities();
    note('ЦИТАДЕЛЬ ЗАХВАЧЕНА · МОЖНО ВЫЙТИ В ГОРОД','#ffd36a');
  }

  function wrapSiegeHandler(){
    try{
      var base=window.PPA_CLAN_SIEGE_HANDLER;
      if(typeof base!=='function')return false;
      if(base.__ppaClanSiegeFix){wrappedHandler=base;return true}
      var fn=async function(req){
        var r=await base.apply(this,arguments);
        try{
          if(req&&String(req.action||'')==='castleCaptured'&&r&&r.ok!==false)markCaptured();
        }catch(_){}
        return r;
      };
      fn.__ppaClanSiegeFix=true;fn.__ppaBase=base;
      window.PPA_CLAN_SIEGE_HANDLER=fn;wrappedHandler=fn;return true;
    }catch(_){return false}
  }

  function tick(){
    var sc=scene();
    if(sc!==lastScene){
      if(lastScene==='clansiege'&&sc!=='clansiege'){
        captured=false;castleImage=null;candidates.clear();cleanupHud();
        try{sessionStorage.removeItem('ppaClanSiegeCapturedV1')}catch(_){}
      }
      lastScene=sc;
    }
    wrapSiegeHandler();installDrawGuard();
    if(inSiege()){
      var now=Date.now();
      if(now-scanAt>180){scanAt=now;shiftNativeSiegeHud();updateCompactHud();if(captured)removeCastleEntities();installQaButton()}
      if(captured&&exitBtn)exitBtn.style.display='block';
    }else{
      restoreNativeSiegeHud();
      if(exitBtn)exitBtn.style.display='none';
      var now2=Date.now();if(now2-scanAt>220){scanAt=now2;installQaButton()}
    }
    requestAnimationFrame(tick);
  }

  ensureUi();installDrawGuard();tick();
})();