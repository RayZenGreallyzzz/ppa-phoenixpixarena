/* Phoenix Pix Arena — real startup progress.
   The cover is painted synchronously before this runtime and stays opaque
   until the main city canvas is broadly painted. */
(function(){
  'use strict';
  try{
    var root=document.documentElement;
    if(!root)return;
    root.classList.add('ppaBootActive');

    var hud=document.getElementById('ppaBootHud');
    if(!hud){
      hud=document.createElement('div');
      hud.id='ppaBootHud';
      hud.innerHTML='<div id="ppaBootCard">'+
        '<div id="ppaBootTrack"><div id="ppaBootFill"></div></div>'+
        '<div id="ppaBootPercent">4%</div>'+
        '<div id="ppaBootStatus">Подготовка мира…</div>'+
        '<div id="ppaBootFirst">Первый запуск может занять немного больше времени…</div>'+
        '<div id="ppaBootTagline">Возродись из пепла. Стань легендой.</div>'+
      '</div>';
      root.appendChild(hud);
    }

    var fill=document.getElementById('ppaBootFill');
    var pct=document.getElementById('ppaBootPercent');
    var status=document.getElementById('ppaBootStatus');
    var current=4,target=4,done=false;
    var domReady=document.readyState!=='loading';
    var winLoaded=document.readyState==='complete';
    var beginGameSeen=false;
    var paintedFrames=0;
    var lastResourceAt=(performance&&performance.now)?performance.now():Date.now();
    var resourceCount=0;
    var startedAt=lastResourceAt;

    function now(){return (performance&&performance.now)?performance.now():Date.now();}
    function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
    function stageText(p){
      if(p<18)return 'Подготовка мира…';
      if(p<42)return 'Загрузка города…';
      if(p<64)return 'Пробуждение героев…';
      if(p<82)return 'Загрузка жителей города…';
      if(p<96)return 'Загрузка персонажа…';
      return 'Подготовка первого кадра…';
    }
    function setTarget(v,label){
      if(done)return;
      target=Math.max(target,clamp(Number(v)||0,4,99));
      if(label&&status)status.textContent=label;
    }
    function paintProgress(){
      if(done)return;
      var delta=target-current;
      if(Math.abs(delta)>.05)current+=Math.max(.18,delta*.16);
      if(current>target)current=target;
      if(current>99)current=99;
      if(fill)fill.style.width=current.toFixed(1)+'%';
      if(pct)pct.textContent=Math.floor(current)+'%';
      if(status&&!status.__ppaLocked)status.textContent=stageText(current);
    }

    window.__PPA_BOOT_SIGNAL__=function(name){
      if(name==='beginGame'){
        beginGameSeen=true;
        lastResourceAt=now();
        setTarget(52,'Загрузка города…');
      }else if(name==='scene'){
        setTarget(74,'Загрузка жителей города…');
      }else if(name==='ready'){
        setTarget(94,'Подготовка первого кадра…');
      }
    };

    function imageRatio(){
      try{
        var imgs=Array.prototype.slice.call(document.images||[]);
        if(!imgs.length)return 1;
        var doneCount=0,total=0;
        for(var i=0;i<imgs.length;i++){
          var im=imgs[i];
          if(hud&&hud.contains(im))continue;
          total++;
          if(im.complete&&im.naturalWidth>0)doneCount++;
        }
        return total?doneCount/total:1;
      }catch(_){return .5}
    }

    try{
      resourceCount=performance.getEntriesByType('resource').length;
      var po=new PerformanceObserver(function(list){
        var es=list.getEntries();
        if(es&&es.length){
          resourceCount+=es.length;
          lastResourceAt=now();
          setTarget(18+Math.min(48,Math.log2(resourceCount+2)*7.2));
        }
      });
      po.observe({entryTypes:['resource']});
      window.__PPA_BOOT_PO__=po;
    }catch(_){}

    function canvasLooksLikeCity(){
      var c=document.getElementById('c');
      if(!c||!c.width||!c.height)return false;
      var rect;
      try{rect=c.getBoundingClientRect()}catch(_){return false}
      if(!rect||rect.width<160||rect.height<160)return false;
      try{
        var s=document.createElement('canvas');
        s.width=30;s.height=30;
        var x=s.getContext('2d',{willReadFrequently:true});
        if(!x)return false;
        x.drawImage(c,0,0,30,30);
        var d=x.getImageData(0,0,30,30).data;
        var visible=0,painted=0,sum=0,sum2=0;
        var quadrants=[0,0,0,0];
        for(var py=0;py<30;py++){
          for(var px=0;px<30;px++){
            var i=(py*30+px)*4;
            if(d[i+3]<12)continue;
            visible++;
            var y=(d[i]*3+d[i+1]*4+d[i+2])/8;
            sum+=y;sum2+=y*y;
            if(y>18){
              painted++;
              quadrants[(py>=15?2:0)+(px>=15?1:0)]++;
            }
          }
        }
        if(visible<500)return false;
        var ratio=painted/visible;
        var mean=sum/visible;
        var variance=(sum2/visible)-(mean*mean);
        var broad=quadrants.filter(function(v){return v>45}).length>=3;
        return ratio>.38&&variance>38&&broad;
      }catch(_){return false}
    }

    function visibleCharacterSelect(){
      try{
        var f=document.getElementById('classSelectFrame');
        if(!f)return false;
        var cs=getComputedStyle(f),r=f.getBoundingClientRect();
        return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity)!==0&&r.width>120&&r.height>120;
      }catch(_){return false}
    }

    function finish(){
      if(done)return;
      done=true;
      current=target=100;
      if(fill)fill.style.width='100%';
      if(pct)pct.textContent='100%';
      if(status){status.__ppaLocked=true;status.textContent='Входим в Phoenix Pix Arena…';}
      try{if(window.__PPA_BOOT_PO__)window.__PPA_BOOT_PO__.disconnect()}catch(_){}
      setTimeout(function(){
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            root.classList.add('ppaBootLeaving');
            setTimeout(function(){
              try{root.classList.remove('ppaBootActive','ppaBootLeaving')}catch(_){}
              try{if(hud&&hud.parentNode)hud.parentNode.removeChild(hud)}catch(_){}
            },260);
          });
        });
      },220);
    }

    function update(){
      if(done)return;
      var t=now();
      var ratio=imageRatio();
      if(domReady)setTarget(18+ratio*12);
      if(winLoaded)setTarget(38+ratio*18);
      if(beginGameSeen)setTarget(Math.max(target,58+ratio*18));

      var quiet=t-lastResourceAt;
      if(beginGameSeen&&quiet>300)setTarget(82,'Загрузка персонажа…');

      if(canvasLooksLikeCity()){
        paintedFrames++;
        setTarget(94,'Подготовка первого кадра…');
      }else paintedFrames=0;

      if(beginGameSeen&&paintedFrames>=4&&quiet>420){
        finish();
        return;
      }
      if(!beginGameSeen&&winLoaded&&visibleCharacterSelect()&&quiet>500){
        finish();
        return;
      }
      if(beginGameSeen&&t-startedAt>20000&&winLoaded&&quiet>1600){
        finish();
        return;
      }
      paintProgress();
    }

    if(domReady)setTarget(14);
    else document.addEventListener('DOMContentLoaded',function(){
      domReady=true;setTarget(20,'Загрузка города…');
    },{once:true});

    if(winLoaded)setTarget(42);
    else window.addEventListener('load',function(){
      winLoaded=true;lastResourceAt=now();setTarget(46,'Пробуждение героев…');
    },{once:true});

    paintProgress();
    setInterval(update,90);
  }catch(_){}
})();