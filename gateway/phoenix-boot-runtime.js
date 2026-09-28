/* Phoenix Pix Arena — startup loading gate.
   Keeps the game covered until the start scene is actually paint-ready. */
(function(){
  'use strict';

  var boot=document.getElementById('ppaPhoenixBoot');
  if(!boot)return;

  var fill=document.getElementById('ppaBootProgressFill');
  var percent=document.getElementById('ppaBootPercent');
  var status=document.getElementById('ppaBootStatus');
  var firstNote=document.getElementById('ppaBootFirst');
  var current=4;
  var finished=false;
  var domReady=document.readyState!=='loading';
  var windowLoaded=document.readyState==='complete';
  var loadedAt=windowLoaded?performance.now():0;
  var lastResourceAt=performance.now();
  var lastImageAt=performance.now();
  var goodCanvasFrames=0;
  var fontReady=false;
  var interval=0;
  var resourceCount=0;

  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function setProgress(value,label){
    if(finished)return;
    value=clamp(Number(value)||0,current,99);
    current=value;
    if(fill)fill.style.width=value.toFixed(1)+'%';
    if(percent)percent.textContent=Math.floor(value)+'%';
    if(label&&status)status.textContent=label;
    boot.setAttribute('aria-valuenow',String(Math.floor(value)));
  }
  function mark(stage){
    if(stage==='account')setProgress(15,'Подготовка мира…');
    else if(stage==='city')setProgress(45,'Загрузка города…');
    else if(stage==='sprites')setProgress(65,'Пробуждение героев…');
    else if(stage==='npcs')setProgress(80,'Загрузка жителей города…');
    else if(stage==='character')setProgress(95,'Загрузка персонажа…');
    else if(stage==='frame')finish();
  }
  window.__PPA_BOOT_PROGRESS__={set:setProgress,mark:mark,finish:function(){finish();}};

  function imageStats(){
    var list=Array.prototype.slice.call(document.images||[]).filter(function(img){
      return !boot.contains(img);
    });
    if(!list.length)return {total:0,done:0};
    var done=0;
    for(var i=0;i<list.length;i++){
      if(list[i].complete&&list[i].naturalWidth>0)done++;
    }
    return {total:list.length,done:done};
  }

  function watchImage(img){
    if(!img||img.__ppaBootWatched||boot.contains(img))return;
    img.__ppaBootWatched=1;
    var onEnd=function(){
      lastImageAt=performance.now();
      updateMeasuredProgress();
    };
    img.addEventListener('load',onEnd,{once:true});
    img.addEventListener('error',onEnd,{once:true});
  }
  Array.prototype.forEach.call(document.images||[],watchImage);

  function updateMeasuredProgress(){
    if(finished)return;
    var stats=imageStats();
    var imageRatio=stats.total?stats.done/stats.total:1;
    var base=domReady?18:8;
    if(windowLoaded)base=55;
    var byImages=windowLoaded?(55+imageRatio*25):(18+imageRatio*30);
    var byResources=windowLoaded?Math.min(83,56+Math.log2(resourceCount+2)*4):Math.min(50,20+Math.log2(resourceCount+2)*3);
    var target=Math.max(base,byImages,byResources);
    if(fontReady)target=Math.max(target,72);
    if(target<45)setProgress(target,'Загрузка города…');
    else if(target<66)setProgress(target,'Пробуждение героев…');
    else if(target<82)setProgress(target,'Загрузка жителей города…');
    else setProgress(Math.min(target,94),'Загрузка персонажа…');
  }

  try{
    resourceCount=performance.getEntriesByType('resource').length;
    var po=new PerformanceObserver(function(list){
      var entries=list.getEntries();
      if(entries&&entries.length){
        resourceCount+=entries.length;
        lastResourceAt=performance.now();
        updateMeasuredProgress();
      }
    });
    po.observe({entryTypes:['resource']});
    boot.__ppaResourceObserver=po;
  }catch(_){}

  try{
    var mo=new MutationObserver(function(records){
      for(var i=0;i<records.length;i++){
        var rec=records[i];
        for(var j=0;j<rec.addedNodes.length;j++){
          var node=rec.addedNodes[j];
          if(!node||node===boot||boot.contains(node))continue;
          if(node.tagName==='IMG')watchImage(node);
          if(node.querySelectorAll){
            var imgs=node.querySelectorAll('img');
            for(var k=0;k<imgs.length;k++)watchImage(imgs[k]);
          }
        }
      }
      updateMeasuredProgress();
    });
    mo.observe(document.documentElement,{childList:true,subtree:true});
    boot.__ppaMutationObserver=mo;
  }catch(_){}

  if(document.fonts&&document.fonts.ready){
    document.fonts.ready.then(function(){
      fontReady=true;
      lastResourceAt=performance.now();
      updateMeasuredProgress();
    }).catch(function(){});
  }else{
    fontReady=true;
  }

  function canvases(){
    var nodes=document.querySelectorAll('canvas');
    var out=[];
    for(var i=0;i<nodes.length;i++){
      var c=nodes[i];
      if(boot.contains(c)||c.width<160||c.height<120)continue;
      var r=c.getBoundingClientRect();
      if(r.width<160||r.height<120||r.bottom<=0||r.right<=0)continue;
      out.push({c:c,area:r.width*r.height});
    }
    out.sort(function(a,b){return b.area-a.area;});
    return out;
  }

  function canvasLooksPainted(){
    var list=canvases();
    if(!list.length)return false;
    var temp=document.createElement('canvas');
    temp.width=28;temp.height=28;
    var ctx=temp.getContext('2d',{willReadFrequently:true});
    if(!ctx)return false;
    for(var n=0;n<Math.min(3,list.length);n++){
      try{
        ctx.clearRect(0,0,28,28);
        ctx.drawImage(list[n].c,0,0,28,28);
        var d=ctx.getImageData(0,0,28,28).data;
        var visible=0,nonDark=0,sum=0,sum2=0;
        for(var i=0;i<d.length;i+=4){
          if(d[i+3]<8)continue;
          visible++;
          var y=(d[i]*3+d[i+1]*4+d[i+2])/8;
          sum+=y;sum2+=y*y;
          if(y>19)nonDark++;
        }
        if(!visible)continue;
        var ratio=nonDark/visible;
        var mean=sum/visible;
        var variance=sum2/visible-mean*mean;
        if(ratio>0.22&&variance>45)return true;
      }catch(_){}
    }
    return false;
  }

  function largeBackgroundReady(){
    var all=document.querySelectorAll('body *');
    var max=Math.min(all.length,260);
    var viewportArea=Math.max(1,innerWidth*innerHeight);
    for(var i=0;i<max;i++){
      var el=all[i];
      if(el===boot||boot.contains(el))continue;
      var r=el.getBoundingClientRect();
      if(r.width*r.height<viewportArea*0.28)continue;
      var cs=getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)continue;
      var bg=cs.backgroundImage;
      if(bg&&bg!=='none'&&bg.indexOf('gradient')<0)return true;
    }
    return false;
  }

  function allImagesComplete(){
    var s=imageStats();
    return s.total===0||s.done>=s.total;
  }

  function finish(){
    if(finished)return;
    finished=true;
    current=100;
    if(fill)fill.style.width='100%';
    if(percent)percent.textContent='100%';
    if(status)status.textContent='Входим в Phoenix Pix Arena…';
    boot.setAttribute('aria-valuenow','100');
    try{if(boot.__ppaResourceObserver)boot.__ppaResourceObserver.disconnect();}catch(_){}
    try{if(boot.__ppaMutationObserver)boot.__ppaMutationObserver.disconnect();}catch(_){}
    if(interval)clearInterval(interval);
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        setTimeout(function(){
          boot.classList.add('ppaBootDone');
          try{localStorage.setItem('ppa_boot_seen_v2','1');}catch(_){}
          setTimeout(function(){
            if(boot&&boot.parentNode)boot.parentNode.removeChild(boot);
          },260);
        },180);
      });
    });
  }

  function tick(){
    if(finished)return;
    updateMeasuredProgress();
    var now=performance.now();
    if(!windowLoaded)return;

    var quietFor=now-Math.max(lastResourceAt,lastImageAt);
    var canvasReady=canvasLooksPainted();
    if(canvasReady)goodCanvasFrames++;else goodCanvasFrames=0;

    if(goodCanvasFrames>=2&&quietFor>550){
      setProgress(98,'Загрузка персонажа…');
      finish();
      return;
    }

    if(canvases().length===0&&largeBackgroundReady()&&allImagesComplete()&&quietFor>750){
      setProgress(98,'Загрузка персонажа…');
      finish();
      return;
    }

    var sinceLoad=now-loadedAt;
    if(sinceLoad>4200&&allImagesComplete()&&quietFor>1200&&canvases().length>0){
      setProgress(98,'Подготовка первого кадра…');
      finish();
      return;
    }

    if(sinceLoad>25000){
      setProgress(99,'Подготовка первого кадра…');
      finish();
    }
  }

  function onDomReady(){
    domReady=true;
    setProgress(15,'Подготовка мира…');
    Array.prototype.forEach.call(document.images||[],watchImage);
    updateMeasuredProgress();
  }
  if(domReady)onDomReady();
  else document.addEventListener('DOMContentLoaded',onDomReady,{once:true});

  function onLoad(){
    windowLoaded=true;
    loadedAt=performance.now();
    lastResourceAt=performance.now();
    setProgress(55,'Загрузка города…');
    updateMeasuredProgress();
  }
  if(windowLoaded)onLoad();
  else window.addEventListener('load',onLoad,{once:true});

  setProgress(4,'Подготовка мира…');
  interval=setInterval(tick,180);
})();