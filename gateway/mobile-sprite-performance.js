(function(){
  'use strict';
  if(window.__PPA_MOBILE_SPRITE_PERF_V1)return;
  window.__PPA_MOBILE_SPRITE_PERF_V1=true;

  function mobile(){
    try{
      return Math.min(window.innerWidth||9999,window.innerHeight||9999)<=760 ||
        ((window.matchMedia&&matchMedia('(pointer:coarse)').matches)&&Math.min(window.innerWidth||9999,window.innerHeight||9999)<=900);
    }catch(_){return false}
  }

  if(!mobile())return;

  var cache=typeof WeakMap!=='undefined'?new WeakMap():null;

  function markCanvas(c){
    try{c.complete=true}catch(_){}
    try{c.naturalWidth=c.width}catch(_){}
    try{c.naturalHeight=c.height}catch(_){}
    return c;
  }

  function lowResAnim(a){
    try{
      if(!a||!a.img||!(Number(a.fw)>=192)||!(Number(a.fh)>=192))return a;
      if(cache&&cache.has(a))return cache.get(a);
      var im=a.img;
      if(!im.complete||!im.naturalWidth||!im.naturalHeight)return a;

      // Characters are drawn at roughly 55–95 screen px on phones, so
      // sampling 192–256 px cells every frame wastes GPU bandwidth.
      // Reduce only the source atlas used for rendering; animation timing,
      // scale, collision and combat values stay untouched.
      var factor=.5;
      var w=Math.max(1,Math.round(im.naturalWidth*factor));
      var h=Math.max(1,Math.round(im.naturalHeight*factor));
      var cv=document.createElement('canvas');
      cv.width=w;cv.height=h;
      var x=cv.getContext('2d',{alpha:true,desynchronized:true})||cv.getContext('2d');
      if(!x)return a;
      x.imageSmoothingEnabled=false;
      x.clearRect(0,0,w,h);
      x.drawImage(im,0,0,w,h);
      markCanvas(cv);

      var b={};
      for(var k in a)b[k]=a[k];
      b.img=cv;
      b.fw=Math.max(1,Math.round(Number(a.fw)*factor));
      b.fh=Math.max(1,Math.round(Number(a.fh)*factor));
      b.__ppaLowRes=true;
      if(cache)cache.set(a,b);
      return b;
    }catch(_){return a}
  }

  function wrapPlayer(){
    try{
      if(typeof playerAnimDef!=='function'||playerAnimDef.__ppaLowRes)return false;
      var base=playerAnimDef;
      var fn=function(name){
        var a=base.apply(this,arguments);
        // Gnome already uses lightweight 128x128 cells and is intentionally
        // left untouched because it is the smooth reference class.
        try{
          if(typeof playerUsesGnomeSprites==='function'&&playerUsesGnomeSprites())return a;
        }catch(_){}
        return lowResAnim(a);
      };
      fn.__ppaLowRes=1;
      playerAnimDef=fn;
      try{window.playerAnimDef=fn}catch(_){}
      return true;
    }catch(_){return false}
  }

  function wrapAi(){
    try{
      if(typeof v174AiSpriteCfg!=='function'||v174AiSpriteCfg.__ppaLowRes)return false;
      var base=v174AiSpriteCfg;
      var fn=function(e){
        var cfg=base.apply(this,arguments);
        if(!cfg||!cfg.anim)return cfg;
        try{if(e&&String(e.aiClass||'')==='gnome')return cfg}catch(_){}
        var out={};
        for(var k in cfg)out[k]=cfg[k];
        out.anim=lowResAnim(cfg.anim);
        return out;
      };
      fn.__ppaLowRes=1;
      v174AiSpriteCfg=fn;
      try{window.v174AiSpriteCfg=fn}catch(_){}
      return true;
    }catch(_){return false}
  }

  // Reduce nonessential footstep particles on phones as a secondary GC fix.
  try{
    if(typeof MAX_PARTICLES!=='undefined'&&Number(MAX_PARTICLES)>96){
      // const cannot be reassigned in some builds; this is intentionally best-effort.
    }
  }catch(_){}

  function install(){
    var a=wrapPlayer(),b=wrapAi();
    if(a||b)return;
    setTimeout(install,250);
  }
  install();

  window.PPA_SPRITE_PERF_DIAG=function(){
    return{mobile:mobile(),enabled:true,mode:'half-atlas-non-gnome'};
  };
})();