const enc=new TextEncoder();
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function safeEqual(a,b){a=String(a||'').toLowerCase();b=String(b||'').toLowerCase();if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function hmac(k,d){const key=await crypto.subtle.importKey('raw',k,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',key,typeof d==='string'?enc.encode(d):d)}
async function auth(initData,token){
  if(!token)throw Object.assign(new Error('BOT_TOKEN secret is not configured'),{status:503});
  const p=new URLSearchParams(initData||''),rh=p.get('hash');
  if(!rh)throw Object.assign(new Error('Telegram session missing'),{status:401});
  p.delete('hash');
  const s=[...p.entries()].map(([k,v])=>`${k}=${v}`).sort((a,b)=>a.localeCompare(b)).join('\n');
  const sk=await hmac(enc.encode('WebAppData'),token),calc=hex(await hmac(new Uint8Array(sk),s));
  if(!safeEqual(calc,rh))throw Object.assign(new Error('Telegram signature check failed'),{status:401});
  const ad=Number(p.get('auth_date')),now=Math.floor(Date.now()/1000);
  if(!Number.isFinite(ad)||now-ad>86400||ad>now+300)throw Object.assign(new Error('Telegram session expired'),{status:401});
  let u=null;try{u=JSON.parse(p.get('user')||'null')}catch(_){}
  if(!u||u.id==null)throw Object.assign(new Error('Telegram user missing'),{status:401});
  return u;
}
const ALLOWED=new Set(['tank','barbarian','paladin','gnome','archer','mage','assassin','priest']);
export async function handleClassSyncRequest(request,env){
  const u=new URL(request.url);
  if(u.pathname!=='/api/profile/sync-class')return null;
  if(request.method!=='POST')return json({ok:false,message:'POST required'},405);
  try{
    let b={};try{b=await request.json()}catch(_){}
    const user=await auth(b.initData||request.headers.get('x-telegram-init-data')||'',env.BOT_TOKEN);
    const classKey=String(b.classKey||'').trim().toLowerCase();
    if(!ALLOWED.has(classKey))return json({ok:false,message:'Неизвестный класс персонажа.'},400);
    const id=String(user.id);
    const row=await env.DB.prepare('SELECT class_key FROM players WHERE telegram_id=?1').bind(id).first();
    const old=String(row&&row.class_key||'');
    await env.DB.prepare('UPDATE players SET class_key=?1,updated_at=?2 WHERE telegram_id=?3').bind(classKey,Date.now(),id).run();
    return json({ok:true,classKey,changed:old!==classKey});
  }catch(e){return json({ok:false,message:String((e&&e.message)||'Class sync error')},Number(e&&e.status)||500)}
}
