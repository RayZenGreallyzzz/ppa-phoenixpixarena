import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'public', 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('public/index.html not found; run node build.mjs first');
}

function replaceRequired(src, before, after, label) {
  if (!src.includes(before)) throw new Error(`Patch target not found: ${label}`);
  return src.split(before).join(after);
}

let html = fs.readFileSync(indexPath, 'utf8');
const before = html;

const KEY = 'v608-pc-mouse-hotkeys-20260925';
html = html
  .split('v602-clan-siege-exit-visible-20260925').join(KEY)
  .split('v603-clan-siege-native-clean-20260925').join(KEY)
  .split('v604-clan-siege-native-leave-20260925').join(KEY)
  .split('v605-clan-siege-won-fps-20260925').join(KEY)
  .split('v606-clan-siege-city-exit-20260925').join(KEY)
  .split('v607-clan-siege-castle-cache-20260925').join(KEY);

const PC_INPUT_CODE = `

// === V608 DESKTOP MOUSE + HOTKEY INPUT ====================================
// PC-only layer. It is disabled on touch devices so phone/tablet joystick stays native.
let PPA_PC_CLICK_MOVE={active:false,x:0,y:0,lastAt:0};
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
function ppaPcMoveInput(){
  if(!ppaPcInputEnabled()||!PPA_PC_CLICK_MOVE.active)return null;
  if(typeof P==='undefined'||P.dead||transitioning||P.scene==='safe')return null;
  if(Math.hypot(jX||0,jY||0)>0.08)return null;
  const dx=PPA_PC_CLICK_MOVE.x-P.x,dy=PPA_PC_CLICK_MOVE.y-P.y;
  const d=Math.hypot(dx,dy);
  if(d<18||Date.now()-(PPA_PC_CLICK_MOVE.lastAt||0)>20000){
    PPA_PC_CLICK_MOVE.active=false;
    return null;
  }
  P.face=dx<0?-1:1;
  P.meleeAng=Math.atan2(dy,dx);
  return {x:dx/Math.max(.001,d),y:dy/Math.max(.001,d)};
}
function ppaPcAttack(ev){
  PPA_PC_CLICK_MOVE.active=false;
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
      PPA_PC_CLICK_MOVE.active=false;
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
}
ppaPcBindInput();
// ========================================================================
`;

html = replaceRequired(
  html,
  "bA.addEventListener('contextmenu',e=>e.preventDefault());\n\nfunction romanRank(n){return ['','I','II','III'][n]||''}",
  "bA.addEventListener('contextmenu',e=>e.preventDefault());" + PC_INPUT_CODE + "\nfunction romanRank(n){return ['','I','II','III'][n]||''}",
  'desktop input code insertion after attack bindings'
);

html = replaceRequired(
  html,
  `const _smartMove=updateSmartAttackInput();
  // V139: Smart Attack only supplies movement when joystick is neutral.
  // Any live joystick input keeps full manual movement while target lock stays active.
  const _moveX=_smartMove?_smartMove.x:jX;
  const _moveY=_smartMove?_smartMove.y:jY;`,
  `const _smartMove=updateSmartAttackInput();
  const _pcMove=(!_smartMove&&typeof ppaPcMoveInput==='function')?ppaPcMoveInput():null;
  // V139: Smart Attack only supplies movement when joystick is neutral.
  // Any live joystick input keeps full manual movement while target lock stays active.
  const _moveX=_smartMove?_smartMove.x:(_pcMove?_pcMove.x:jX);
  const _moveY=_smartMove?_smartMove.y:(_pcMove?_pcMove.y:jY);`,
  'desktop click-to-move hook in update loop'
);

if (!html.includes(KEY) ||
    !html.includes('function ppaPcInputEnabled()') ||
    !html.includes("matchMedia('(hover:hover) and (pointer:fine)')") ||
    !html.includes('(navigator.maxTouchPoints||0)>0') ||
    !html.includes('function ppaPcMoveInput()') ||
    !html.includes("const _pcMove=(!_smartMove&&typeof ppaPcMoveInput==='function')?ppaPcMoveInput():null") ||
    !html.includes('ppaPcHudSkill(skill,e)') ||
    !html.includes('ppaPcSetMoveTarget(e.clientX,e.clientY)')) {
  throw new Error('PC mouse/hotkey validation failed');
}
if (html === before) throw new Error('No changes applied to public/index.html');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[PPA POSTBUILD] PC input applied: left click move, right click/Space attack, 1-4 skills; touch devices disabled.');
console.log('[PPA POSTBUILD] index.html: '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB');
