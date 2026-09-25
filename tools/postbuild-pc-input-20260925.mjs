import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'public', 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('public/index.html not found; run node build.mjs first');
}

function insertBeforeLastScriptClose(src, code) {
  const pos = src.lastIndexOf('</script>');
  if (pos < 0) throw new Error('Cannot find closing </script> for PC input insertion');
  return src.slice(0, pos) + code + src.slice(pos);
}

let html = fs.readFileSync(indexPath, 'utf8');
const before = html;

const KEY = 'v609-pc-mouse-hotkeys-safe-20260925';
html = html
  .split('v602-clan-siege-exit-visible-20260925').join(KEY)
  .split('v603-clan-siege-native-clean-20260925').join(KEY)
  .split('v604-clan-siege-native-leave-20260925').join(KEY)
  .split('v605-clan-siege-won-fps-20260925').join(KEY)
  .split('v606-clan-siege-city-exit-20260925').join(KEY)
  .split('v607-clan-siege-castle-cache-20260925').join(KEY)
  .split('v608-pc-mouse-hotkeys-20260925').join(KEY);

const PC_INPUT_CODE = `

// === V609 DESKTOP MOUSE + HOTKEY INPUT ====================================
// PC-only layer. It is disabled on touch devices so phone/tablet joystick stays native.
let PPA_PC_CLICK_MOVE={active:false,x:0,y:0,lastAt:0};
let PPA_PC_MOVE_LAST={x:0,y:0,active:false};
function ppaPcInputEnabled(){
  try{
    if((navigator.maxTouchPoints||0)>0)return false;
    if(window.matchMedia&&!matchMedia('(hover:hover) and (pointer:fine)').matches)return false;
    if(Math.min(innerWidth||0,innerHeight||0)<520)return false;
    if(Math.max(innerWidth||0,innerHeight||0)<900)return false;
    return true;
  }catch(_){return false}
}
function ppaPcIsTyping(){
  const a=document.activeElement;
  if(!a)return false;
  const tag=String(a.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select')return true;
  if(a.isContentEditable)return true;
  try{if(a.closest&&a.closest('[contenteditable="true"],#chat,#chatPanel,#chatBox,#chatInput,#msg,#msgInput,.chat,.modal,.window,dialog'))return true}catch(_){ }
  return false;
}
function ppaPcCanvas(){
  try{return (typeof cv!=='undefined'&&cv)||document.querySelector('canvas')}catch(_){return null}
}
function ppaPcWorldPoint(clientX,clientY){
  const canvas=ppaPcCanvas();
  if(!canvas||typeof cam==='undefined')return null;
  const r=canvas.getBoundingClientRect();
  const z=(typeof cameraZoom==='function')?cameraZoom():1;
  return {x:cam.x+(clientX-r.left)/Math.max(.01,z),y:cam.y+(clientY-r.top)/Math.max(.01,z)};
}
function ppaPcClearMove(){
  PPA_PC_CLICK_MOVE.active=false;
  if(PPA_PC_MOVE_LAST.active){
    try{jX=0;jY=0}catch(_){ }
    PPA_PC_MOVE_LAST.active=false;
    PPA_PC_MOVE_LAST.x=0;
    PPA_PC_MOVE_LAST.y=0;
  }
}
function ppaPcSetMoveTarget(clientX,clientY){
  const p=ppaPcWorldPoint(clientX,clientY);
  if(!p)return false;
  if(typeof cancelSmartAttack==='function')cancelSmartAttack();
  PPA_PC_CLICK_MOVE.active=true;
  PPA_PC_CLICK_MOVE.x=p.x;
  PPA_PC_CLICK_MOVE.y=p.y;
  PPA_PC_CLICK_MOVE.lastAt=Date.now();
  return true;
}
function ppaPcTickMove(){
  try{
    if(!ppaPcInputEnabled()||!PPA_PC_CLICK_MOVE.active){
      if(PPA_PC_MOVE_LAST.active)ppaPcClearMove();
      return;
    }
    if(typeof P==='undefined'||!P||P.dead||transitioning||P.scene==='safe'||ppaPcIsTyping()){
      ppaPcClearMove();
      return;
    }
    const dx=PPA_PC_CLICK_MOVE.x-P.x,dy=PPA_PC_CLICK_MOVE.y-P.y;
    const d=Math.hypot(dx,dy);
    if(d<18||Date.now()-(PPA_PC_CLICK_MOVE.lastAt||0)>20000){
      ppaPcClearMove();
      return;
    }
    const mx=dx/Math.max(.001,d),my=dy/Math.max(.001,d);
    P.face=dx<0?-1:1;
    P.meleeAng=Math.atan2(dy,dx);
    jX=mx;
    jY=my;
    PPA_PC_MOVE_LAST={x:mx,y:my,active:true};
  }catch(_){ }
}
function ppaPcAttack(ev){
  ppaPcClearMove();
  if(typeof triggerAttackInput==='function'){
    triggerAttackInput(ev||null);
    return true;
  }
  const b=document.getElementById('bAtk');
  if(b){b.click();return true}
  return false;
}
function ppaPcHudSkill(index,ev){
  if(index<0||index>3)return false;
  if(typeof triggerHudSkillInput==='function'){
    triggerHudSkillInput(index,ev||null);
    return true;
  }
  const el=document.getElementById('s'+(index+1));
  if(!el)return false;
  try{
    if(window.PointerEvent){
      el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'mouse',button:0}));
      el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'mouse',button:0}));
    }else{
      el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));
      el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0}));
    }
    return true;
  }catch(_){return false}
}
function ppaPcBindInput(){
  if(window.__PPA_PC_MOUSE_HOTKEYS_BOUND__)return;
  window.__PPA_PC_MOUSE_HOTKEYS_BOUND__=true;
  window.addEventListener('keydown',function(e){
    if(e.repeat||e.ctrlKey||e.altKey||e.metaKey)return;
    if(!ppaPcInputEnabled()||ppaPcIsTyping())return;
    const k=String(e.key||'').toLowerCase();
    let skill=-1;
    if(k==='1')skill=0;else if(k==='2')skill=1;else if(k==='3')skill=2;else if(k==='4')skill=3;
    if(skill>=0){e.preventDefault();e.stopPropagation();ppaPcHudSkill(skill,e);return}
    if(k===' '||e.code==='Space'){e.preventDefault();e.stopPropagation();ppaPcAttack(e);return}
    if(k==='escape'){
      ppaPcClearMove();
      if(typeof cancelSmartAttack==='function')cancelSmartAttack();
    }
  },{passive:false});
  const canvas=ppaPcCanvas();
  if(canvas){
    canvas.addEventListener('pointerdown',function(e){
      if(!ppaPcInputEnabled()||ppaPcIsTyping())return;
      if(e.button===0){
        e.preventDefault();e.stopPropagation();
        ppaPcSetMoveTarget(e.clientX,e.clientY);
      }else if(e.button===2){
        e.preventDefault();e.stopPropagation();
        ppaPcAttack(e);
      }
    },{passive:false});
    canvas.addEventListener('contextmenu',function(e){
      if(ppaPcInputEnabled()){e.preventDefault();e.stopPropagation()}
    },{passive:false});
  }
  const loop=()=>{ppaPcTickMove();requestAnimationFrame(loop)};
  requestAnimationFrame(loop);
}
ppaPcBindInput();
// ========================================================================
`;

if (!html.includes('V609 DESKTOP MOUSE + HOTKEY INPUT')) {
  html = insertBeforeLastScriptClose(html, PC_INPUT_CODE);
}

if (!html.includes(KEY) ||
    !html.includes('function ppaPcInputEnabled()') ||
    !html.includes("matchMedia('(hover:hover) and (pointer:fine)')") ||
    !html.includes('(navigator.maxTouchPoints||0)>0') ||
    !html.includes('function ppaPcTickMove()') ||
    !html.includes('ppaPcHudSkill(skill,e)') ||
    !html.includes('ppaPcSetMoveTarget(e.clientX,e.clientY)') ||
    !html.includes('requestAnimationFrame(loop)')) {
  throw new Error('PC mouse/hotkey validation failed');
}
if (html === before) throw new Error('No changes applied to public/index.html');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[PPA POSTBUILD] PC input applied safely: left click move, right click/Space attack, 1-4 skills; touch devices disabled.');
console.log('[PPA POSTBUILD] index.html: '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB');
