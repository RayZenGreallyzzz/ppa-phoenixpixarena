(function(){
  'use strict';
  function mobile(){try{return innerWidth<=900||matchMedia('(pointer:coarse)').matches}catch(_){return false}}

  function ensureZoneOverlay(){
    var id='ppaDungeonActiveZoneMini',el=document.getElementById(id);
    if(el)return el;
    try{
      el=document.createElementNS('http://www.w3.org/2000/svg','svg');
      el.id=id;
      el.setAttribute('aria-hidden','true');
      el.style.cssText='position:fixed;display:none;pointer-events:none;overflow:hidden;z-index:10020;';
      var q=document.createElementNS('http://www.w3.org/2000/svg','ellipse');
      q.id='ppaDungeonActiveZoneMiniEllipse';
      q.setAttribute('fill','rgba(255,176,58,.08)');
      q.setAttribute('stroke','rgba(255,194,83,.95)');
      q.setAttribute('stroke-width','1.4');
      q.setAttribute('vector-effect','non-scaling-stroke');
      el.appendChild(q);
      document.body.appendChild(el);
      return el;
    }catch(_){return null}
  }

  function drawZoneOverlay(){
    try{
      var el=document.getElementById('ppaDungeonActiveZoneMini');
      var dungeon=(typeof P!=='undefined'&&P&&P.scene==='dungeon');
      var cfg=window.PPA_DUNGEON_ACTIVE_ZONE;
      var m=document.getElementById('mmap');
      if(!mobile()||!dungeon||!cfg||!m){if(el)el.style.display='none';return}
      el=el||ensureZoneOverlay();if(!el)return;
      var r=m.getBoundingClientRect();
      if(!(r.width>4&&r.height>4)){el.style.display='none';return}
      var ww=Math.max(1,Number(cfg.worldW)||2048),wh=Math.max(1,Number(cfg.worldH)||997);
      var px=Math.max(0,Math.min(ww,Number(P.x)||0));
      var py=Math.max(0,Math.min(wh,Number(P.y)||0));
      var sx=r.width/ww,sy=r.height/wh;
      el.style.left=r.left+'px';el.style.top=r.top+'px';
      el.style.width=r.width+'px';el.style.height=r.height+'px';el.style.display='block';
      el.setAttribute('viewBox','0 0 '+r.width+' '+r.height);
      var q=document.getElementById('ppaDungeonActiveZoneMiniEllipse');if(!q)return;
      q.setAttribute('cx',String(px*sx));q.setAttribute('cy',String(py*sy));
      q.setAttribute('rx',String(Math.max(1,Number(cfg.rx)||240)*sx));
      q.setAttribute('ry',String(Math.max(1,Number(cfg.ry)||400)*sy));
    }catch(_){}
  }

  function apply(){
    if(!mobile())return;
    try{
      var m=document.getElementById('mmap');
      if(m)m.style.setProperty('top','calc(var(--ppa-tg-top-safe, 0px) + 32px)','important');
    }catch(_){}
    drawZoneOverlay();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  window.addEventListener('resize',apply,{passive:true});
  window.addEventListener('orientationchange',function(){setTimeout(apply,100)},{passive:true});
  // Diagnostic-only visual refresh. 2 Hz is enough to follow the player on the
  // full-dungeon minimap without adding another animation loop to the hot path.
  setInterval(drawZoneOverlay,500);
})();
