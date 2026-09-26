(function(){
  'use strict';
  if(window.__PPA_MOBILE_SPRITE_PERF_V2)return;
  window.__PPA_MOBILE_SPRITE_PERF_V2=true;

  function mobile(){
    try{
      var side=Math.min(window.innerWidth||9999,window.innerHeight||9999);
      return side<=760||((window.matchMedia&&matchMedia('(pointer:coarse)').matches)&&side<=900);
    }catch(_){return false}
  }
  if(!mobile())return;

  // Cache both by animation object and by the underlying source image.
  // Some animation helpers return a fresh wrapper object every frame; caching
  // only by that wrapper caused repeated giant-atlas resizes and FPS collapse.
  var animCache=typeof WeakMap!=='undefined'?new WeakMap():null;
  var imageCache=typeof WeakMap!=='undefined'?new WeakMap():null;

  function factor(){return .5}
  function markCanvas(c){
    try{c.complete=true}catch(_){}
    try{c.naturalWidth=c.width}catch(_){}
    try{c.naturalHeight=c.height}catch(_){}
    return c;
  }
  function scaledImage(im,f){
    try{
      if(!im||!im.complete||!im.naturalWidth||!im.naturalHeight)return null;
      var key=String(Math.round(f*1000));
      if(imageCache){
        var bag=imageCache.get(im);
        if(bag&&bag[key])return bag[key];
      }
      var w=Math.max(1,Math.round(im.naturalWidth*f));
      var h=Math.max(1,Math.round(im.naturalHeight*f));
      var cv=document.createElement('canvas');
      cv.width=w;cv.height=h;
      var x=cv.getContext('2d',{alpha:true,desynchronized:true})||cv.getContext('2d');
      if(!x)return null;
      x.imageSmoothingEnabled=false;
      x.drawImage(im,0,0,w,h);
      markCanvas(cv);
      if(imageCache){
        var next=imageCache.get(im)||{};
        next[key]=cv;imageCache.set(im,next);
      }
      return cv;
    }catch(_){return null}
  }
  function lowResAnim(a){
    try{
      if(!a||!a.img||a.__ppaLowRes||!(Number(a.fw)>=192)||!(Number(a.fh)>=192))return a;
      if(animCache&&animCache.has(a))return animCache.get(a);
      var f=factor(),cv=scaledImage(a.img,f);
      if(!cv)return a;
      var b={};
      for(var k in a)b[k]=a[k];
      b.img=cv;
      b.fw=Math.max(1,Math.round(Number(a.fw)*f));
      b.fh=Math.max(1,Math.round(Number(a.fh)*f));
      b.__ppaLowRes=true;
      if(animCache)animCache.set(a,b);
      return b;
    }catch(_){return a}
  }

  function wrapPlayer(){
    try{
      if(typeof playerAnimDef!=='function')return false;
      if(playerAnimDef.__ppaLowRes)return true;
      var base=playerAnimDef;
      var fn=function(name){
        var a=base.apply(this,arguments);
        try{if(typeof playerUsesGnomeSprites==='function'&&playerUsesGnomeSprites())return a}catch(_){}
        return lowResAnim(a);
      };
      fn.__ppaLowRes=1;playerAnimDef=fn;
      try{window.playerAnimDef=fn}catch(_){}
      return true;
    }catch(_){return false}
  }
  function wrapAi(){
    try{
      if(typeof v174AiSpriteCfg!=='function')return false;
      if(v174AiSpriteCfg.__ppaLowRes)return true;
      var base=v174AiSpriteCfg;
      var fn=function(e){
        var cfg=base.apply(this,arguments);
        if(!cfg||!cfg.anim)return cfg;
        try{if(e&&String(e.aiClass||'')==='gnome')return cfg}catch(_){}
        var out={};for(var k in cfg)out[k]=cfg[k];
        out.anim=lowResAnim(cfg.anim);
        return out;
      };
      fn.__ppaLowRes=1;v174AiSpriteCfg=fn;
      try{window.v174AiSpriteCfg=fn}catch(_){}
      return true;
    }catch(_){return false}
  }

  function install(){
    var a=wrapPlayer(),b=wrapAi();
    if(a&&b)return;
    setTimeout(install,300);
  }
  install();

  window.PPA_SPRITE_PERF_DIAG=function(){
    return{mobile:mobile(),enabled:true,mode:'cached-scaled-atlas',factor:factor()};
  };
})();