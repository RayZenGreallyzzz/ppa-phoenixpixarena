import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'public', 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('public/index.html not found; run node build.mjs first');
}

function insertBeforeBodyClose(src, code) {
  const pos = src.lastIndexOf('</body>');
  if (pos < 0) throw new Error('Cannot find </body> for desktop PC input loader');
  return src.slice(0, pos) + code + '\n' + src.slice(pos);
}

let html = fs.readFileSync(indexPath, 'utf8');
const before = html;

const KEY = 'v656-desktop-pc-input-split-20260927';

// Always derive the active build key from the canonical value emitted by build.mjs.
// This keeps the postbuild independent from whatever feature most recently bumped
// CLIENT_BUILD (Mimic art, clans, UI, etc.) and updates all matching asset URLs too.
const activeBuildMatch = html.match(/window\.PPA_CLIENT_BUILD\s*=\s*(["'])([^"']+)\1\s*;/);
if (activeBuildMatch && activeBuildMatch[2] && activeBuildMatch[2] !== KEY) {
  html = html.split(activeBuildMatch[2]).join(KEY);
}

// Compatibility for older generated clients that predate the canonical build marker.
html = html
  .split('v602-clan-siege-exit-visible-20260925').join(KEY)
  .split('v603-clan-siege-native-clean-20260925').join(KEY)
  .split('v604-clan-siege-native-leave-20260925').join(KEY)
  .split('v605-clan-siege-won-fps-20260925').join(KEY)
  .split('v606-clan-siege-city-exit-20260925').join(KEY)
  .split('v607-clan-siege-castle-cache-20260925').join(KEY)
  .split('v608-pc-mouse-hotkeys-20260925').join(KEY)
  .split('v609-pc-mouse-hotkeys-safe-20260925').join(KEY)
  .split('v610-pc-telegram-desktop-20260925').join(KEY)
  .split('v655-mobile-fps-input-gate-20260927').join(KEY);

const PC_INPUT_CODE = `
(function(){
'use strict';
// === V656 DESKTOP TELEGRAM MOUSE + HOTKEY INPUT ===========================
// This file is loaded only on desktop. The guard below is defense-in-depth.
function ppaPcHardMobileLike(){
  const ua=String(navigator.userAgent||'').toLowerCase();
  let p='';try{p=String(window.Telegram&&Telegram.WebApp&&Telegram.WebApp.platform||'').toLowerCase()}catch(_){}
  let coarseOnly=false;try{coarseOnly=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches&&!matchMedia('(any-pointer:fine)').matches)}catch(_){}
  const ipadDesktopUa=/macintosh/.test(ua)&&(navigator.maxTouchPoints||0)>1;
  return /android|iphone|ipad|ipod|mobile|tablet|kindle|silk/.test(ua)||/android|ios|iphone|ipad/.test(p)||ipadDesktopUa||((navigator.maxTouchPoints||0)>0&&coarseOnly);
}
if(ppaPcHardMobileLike())return;
let PPA_PC_CLICK_MOVE={active:false,x:0,y:0,lastAt:0};
let PPA_PC_MOVE_LAST={x:0,y:0,active:false};
let PPA_PC_POINTER_SEEN=false;
let PPA_PC_KEY_SEEN=false;
function ppaPcTgPlatform(){
  try{return String(window.Telegram&&Telegram.WebApp&&Telegram.WebApp.platform||'').toLowerCase()}catch(_){return ''}
}
function ppaPcMobileLike(){
  const ua=String(navigator.userAgent||'').toLowerCase();
  const p=ppaPcTgPlatform();
  return /android|iphone|ipad|ipod|mobile|tablet|kindle|silk/.test(ua)||/android|ios|iphone|ipad/.test(p);
}
function ppaPcDesktopTelegram(){
  const p=ppaPcTgPlatform();
  if(/tdesktop|windows|win32|macos|mac|linux|desktop/.test(p))return true;
  if((p==='web'||p==='weba'||p==='unknown')&&!ppaPcMobileLike())return true;
  return false;
}
function ppaPcFinePointer(){
  try{return !!(window.matchMedia&&(matchMedia('(hover:hover)').matches||matchMedia('(pointer:fine)').matches||matchMedia('(any-pointer:fine)').matches))}catch(_){return false}
}
function ppaPcInputEnabled(){
  try{
    const large=Math.max(innerWidth||0,innerHeight||0)>=900&&Math.min(innerWidth||0,innerHeight||0)>=480;
    if(!large)return false;
    if(ppaPcMobileLike())return false;
    if(ppaPcDesktopTelegram())return true;
    if(PPA_PC_POINTER_SEEN||PPA_PC_KEY_SEEN)return true;
    if(ppaPcFinePointer())return true;
    return false;
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
function ppaPcMarkPointer(e){
  try{if(!e||e.pointerType==='mouse'||e.type==='mousemove')PPA_PC_POINTER_SEEN=true}catch(_){PPA_PC_POINTER_SEEN=true}
}
function ppaPcIsGamePointerTarget(e){
  const canvas=ppaPcCanvas();
  if(!canvas)return false;
  return e&&e.target===canvas;
}
function ppaPcBindCanvas(){
  const canvas=ppaPcCanvas();
  if(!canvas||canvas.__PPA_PC_INPUT_BOUND__)return false;
  canvas.__PPA_PC_INPUT_BOUND__=true;
  canvas.addEventListener('pointerdown',function(e){
    ppaPcMarkPointer(e);
    if(!ppaPcInputEnabled()||ppaPcIsTyping())return;
    if(e.button===0){
      e.preventDefault();e.stopPropagation();
      ppaPcSetMoveTarget(e.clientX,e.clientY);
    }else if(e.button===2){
      e.preventDefault();e.stopPropagation();
      ppaPcAttack(e);
    }
  },{passive:false});
  canvas.addEventListener('mousedown',function(e){
    PPA_PC_POINTER_SEEN=true;
  },{passive:true});
  canvas.addEventListener('contextmenu',function(e){
    PPA_PC_POINTER_SEEN=true;
    if(ppaPcInputEnabled()){e.preventDefault();e.stopPropagation()}
  },{passive:false});
  return true;
}
function ppaPcBindInput(){
  if(window.__PPA_PC_MOUSE_HOTKEYS_BOUND__)return;
  window.__PPA_PC_MOUSE_HOTKEYS_BOUND__=true;
  window.addEventListener('pointermove',ppaPcMarkPointer,{passive:true});
  window.addEventListener('mousemove',function(){PPA_PC_POINTER_SEEN=true},{passive:true});
  window.addEventListener('pointerdown',function(e){
    ppaPcMarkPointer(e);
    if(!ppaPcIsGamePointerTarget(e))return;
  },{passive:true,capture:true});
  window.addEventListener('keydown',function(e){
    if(e.repeat||e.ctrlKey||e.altKey||e.metaKey)return;
    if(ppaPcIsTyping())return;
    PPA_PC_KEY_SEEN=true;
    if(!ppaPcInputEnabled())return;
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
  let tries=0;
  const retryCanvas=()=>{
    ppaPcBindCanvas();
    tries++;
    if(tries<120)setTimeout(retryCanvas,500);
  };
  retryCanvas();
  const loop=()=>{ppaPcTickMove();requestAnimationFrame(loop)};
  requestAnimationFrame(loop);
}
window.PPA_PC_INPUT_DEBUG=function(){
  return {enabled:ppaPcInputEnabled(),tgPlatform:ppaPcTgPlatform(),mobileLike:ppaPcMobileLike(),desktopTelegram:ppaPcDesktopTelegram(),finePointer:ppaPcFinePointer(),pointerSeen:PPA_PC_POINTER_SEEN,keySeen:PPA_PC_KEY_SEEN,maxTouchPoints:navigator.maxTouchPoints||0,ua:String(navigator.userAgent||''),canvas:!!ppaPcCanvas()};
};
ppaPcBindInput();
// ========================================================================
})();
`;

const desktopInputPath=path.join(ROOT,'public','game','pc-input-desktop.js');
fs.mkdirSync(path.dirname(desktopInputPath),{recursive:true});
fs.writeFileSync(desktopInputPath,PC_INPUT_CODE,'utf8');

const DESKTOP_LOADER_MARK='PPA_DESKTOP_PC_INPUT_LOADER_V656';
const DESKTOP_LOADER=`
<script>
(function(){
  'use strict';
  // ${DESKTOP_LOADER_MARK}: do not fetch desktop input on phones/tablets.
  const ua=String(navigator.userAgent||'').toLowerCase();
  let p='';try{p=String(window.Telegram&&Telegram.WebApp&&Telegram.WebApp.platform||'').toLowerCase()}catch(_){}
  let coarseOnly=false;try{coarseOnly=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches&&!matchMedia('(any-pointer:fine)').matches)}catch(_){}
  const ipadDesktopUa=/macintosh/.test(ua)&&(navigator.maxTouchPoints||0)>1;
  const mobileLike=/android|iphone|ipad|ipod|mobile|tablet|kindle|silk/.test(ua)||/android|ios|iphone|ipad/.test(p)||ipadDesktopUa||((navigator.maxTouchPoints||0)>0&&coarseOnly);
  if(mobileLike)return;
  const s=document.createElement('script');
  s.src='/game/pc-input-desktop.js?v='+encodeURIComponent(String(window.PPA_CLIENT_BUILD||'${KEY}'));
  s.defer=true;
  document.head.appendChild(s);
})();
</script>`;

if(!html.includes(DESKTOP_LOADER_MARK)){
  html=insertBeforeBodyClose(html,DESKTOP_LOADER);
}

const runtimeValidation = [
  ['V656 DESKTOP TELEGRAM MOUSE + HOTKEY INPUT','desktop runtime marker'],
  ['function ppaPcDesktopTelegram()','desktop detector'],
  ['function ppaPcBindCanvas()','canvas binding'],
  ['PPA_PC_POINTER_SEEN','pointer state'],
  ['window.PPA_PC_INPUT_DEBUG','debug bridge'],
  ['ppaPcHudSkill(skill,e)','skill hotkeys'],
  ['ppaPcSetMoveTarget(e.clientX,e.clientY)','mouse movement'],
  ['requestAnimationFrame(loop)','desktop movement loop']
];
const missingRuntime=runtimeValidation.filter(([needle])=>!PC_INPUT_CODE.includes(needle)).map(([,label])=>label);
if(missingRuntime.length)throw new Error('Desktop PC input asset validation failed: missing '+missingRuntime.join(', '));
if(!html.includes(KEY)||!html.includes(DESKTOP_LOADER_MARK)||!html.includes('/game/pc-input-desktop.js?v=')){
  throw new Error('Desktop-only PC input loader validation failed');
}
if(html.includes('V656 DESKTOP TELEGRAM MOUSE + HOTKEY INPUT')||
   html.includes('function ppaPcTickMove()')||
   html.includes('window.PPA_PC_INPUT_DEBUG')){
  throw new Error('Desktop PC input runtime leaked back into shared mobile HTML');
}
if (html === before) throw new Error('No changes applied to public/index.html');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[PPA POSTBUILD] PC input split: desktop asset is conditionally fetched; mobile/tablet never load its listeners or rAF loop.');
console.log('[PPA POSTBUILD] index.html: '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB');
