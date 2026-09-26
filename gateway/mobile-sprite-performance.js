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

  function qualityFactor(){return .5}
  function motionFactor(){
    try{
      var side=Math.min(window.innerWidth||9999,window.innerHeight||9999);
      return side<=620?.36:.42;
    }catch(_){return .42}
  }
  function factor(){return qualityFactor()}
  function animFactor(name,isAi){
    var n=String(name||'').toLowerCase();
    if(isAi||n==='run'||n==='walk'||n==='move')return motionFactor();
    return qualityFactor();
  }
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
  function lowResAnim(a,f){
    try{
      if(!a||!a.img||a.__ppaLowRes||!(Number(a.fw)>=192)||!(Number(a.fh)>=192))return a;
      f=Number(f)||qualityFactor();
      var key=String(Math.round(f*1000));
      if(animCache){
        var cached=animCache.get(a);
        if(cached&&cached[key])return cached[key];
      }
      var cv=scaledImage(a.img,f);
      if(!cv)return a;
      var b={};
      for(var k in a)b[k]=a[k];
      b.img=cv;
      b.fw=Math.max(1,Math.round(Number(a.fw)*f));
      b.fh=Math.max(1,Math.round(Number(a.fh)*f));
      b.__ppaLowRes=true;
      b.__ppaLowResFactor=f;
      if(animCache){
        var bag=animCache.get(a)||{};
        bag[key]=b;animCache.set(a,bag);
      }
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
        var animName=String(name||'').toLowerCase();
        var isGnome=false;
        try{isGnome=typeof playerUsesGnomeSprites==='function'&&playerUsesGnomeSprites()}catch(_){}
        // Keep the sharp 50% idle atlas. Only movement uses the proven v472
        // mobile factor, so camera/joystick motion no longer drags the GPU.
        // Gnome keeps native idle art but may use the lighter run atlas.
        if(isGnome&&animName!=='run'&&animName!=='walk'&&animName!=='move')return a;
        return lowResAnim(a,animFactor(animName,false));
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
        var animName=String(e&&e.aiAnim||'').toLowerCase();
        var isGnome=!!(e&&String(e.aiClass||'').toLowerCase()==='gnome');
        if(isGnome&&animName!=='run'&&animName!=='walk'&&animName!=='move')return cfg;
        var out={};for(var k in cfg)out[k]=cfg[k];
        out.anim=lowResAnim(cfg.anim,animFactor(animName,true));
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
    return{mobile:mobile(),enabled:true,mode:'adaptive-cached-atlas',idleFactor:qualityFactor(),motionFactor:motionFactor()};
  };
})();