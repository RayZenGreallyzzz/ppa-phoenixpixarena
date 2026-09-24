import { INVITE_IMAGE_BASE64 } from './invite-image.js';
const enc=new TextEncoder();

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function sha256(value){return hex(await crypto.subtle.digest('SHA-256',enc.encode(String(value||''))))}
async function webhookSecret(env){
  const token=String(env.BOT_TOKEN||'').trim();
  if(!token)throw Object.assign(new Error('BOT_TOKEN is not configured'),{status:503});
  return (await sha256('ppa-game-bot:'+token)).slice(0,48);
}
async function tg(env,method,payload){
  const token=String(env.BOT_TOKEN||'').trim();
  if(!token)throw Object.assign(new Error('BOT_TOKEN is not configured'),{status:503});
  const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload||{})
  });
  let data=null;try{data=await r.json()}catch(_){}
  if(!r.ok||!data||data.ok!==true)throw new Error('Telegram '+method+' failed: '+String(data&&data.description||r.status));
  return data.result;
}

const BOT_USERNAME='PhoenixPixMMORPGbot';
const INVITE_CAPTION='🔥 Эпическая MMORPG в Telegram.\n\n⚔️ Сражайся с боссами, прокачивай персонажа, вступай в гильдии.\n\n🎮 Играй бесплатно !!!\n\n👉 @'+BOT_USERNAME;

function inviteMarkup(origin){
  return {inline_keyboard:[
    [{text:'🎮 ИГРАТЬ БЕСПЛАТНО',web_app:{url:origin+'/'}}],
    [{text:'🔥 ОТКРЫТЬ PHONIX MMORPG',url:'https://t.me/'+BOT_USERNAME}]
  ]};
}
async function sendInvite(env,chatId,origin){
  const photo=origin+'/api/game-bot/invite-image?v=565';
  return tg(env,'sendPhoto',{
    chat_id:chatId,
    photo,
    caption:INVITE_CAPTION,
    reply_markup:inviteMarkup(origin)
  });
}
async function handleMessage(env,message,origin){
  const chatId=message&&message.chat&&message.chat.id;
  if(chatId==null)return;
  const text=String(message.text||'').trim();
  const cmd=String(text.split(/\s+/)[0]||'').toLowerCase().replace(/@[^\s]+$/,'');
  if(cmd==='/invite'||cmd==='/start'){
    await sendInvite(env,chatId,origin);
    return;
  }
  if(cmd==='/help'){
    await tg(env,'sendMessage',{
      chat_id:chatId,
      text:'Команды PHONIX MMORPG:\n/invite — красивое приглашение с картинкой\n/start — открыть карточку игры',
      reply_markup:inviteMarkup(origin)
    });
  }
}

export async function handleGameBotRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/game-bot/invite-image'){
    try{
      const raw=atob(INVITE_IMAGE_BASE64);
      const bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      return new Response(bytes,{headers:{
        'content-type':'image/jpeg',
        'cache-control':'public, max-age=86400',
        'access-control-allow-origin':'*'
      }});
    }catch(e){
      return new Response('Invite image unavailable',{status:500});
    }
  }
  if(url.pathname==='/api/game-bot/setup'){
    if(request.method!=='GET'&&request.method!=='POST')return json({ok:false,message:'GET or POST required'},405);
    try{
      const secret=await webhookSecret(env);
      const webhookUrl=url.origin+'/api/game-bot/webhook';
      await tg(env,'setWebhook',{
        url:webhookUrl,
        secret_token:secret,
        allowed_updates:['message'],
        drop_pending_updates:false
      });
      await tg(env,'setMyCommands',{commands:[
        {command:'start',description:'Открыть PHONIX MMORPG'},
        {command:'invite',description:'Приглашение с картинкой'},
        {command:'help',description:'Команды бота'}
      ]});
      const me=await tg(env,'getMe',{});
      return json({ok:true,webhook:webhookUrl,bot:me&&me.username?'@'+me.username:'',inviteCommand:'/invite'});
    }catch(e){
      console.error('PPA game bot setup',e);
      return json({ok:false,message:String(e&&e.message||e)},Number(e&&e.status)||502);
    }
  }

  if(url.pathname!=='/api/game-bot/webhook')return null;
  if(request.method!=='POST')return json({ok:false,message:'POST required'},405);
  try{
    const expected=await webhookSecret(env);
    const received=String(request.headers.get('x-telegram-bot-api-secret-token')||'');
    if(received!==expected)return json({ok:false,message:'Forbidden'},403);
    const update=await request.json();
    if(update&&update.message)await handleMessage(env,update.message,url.origin);
    return json({ok:true});
  }catch(e){
    console.error('PPA game bot webhook',e);
    return json({ok:false,message:'Bot webhook error'},500);
  }
}
