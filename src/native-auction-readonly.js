// Authenticated read-only view over the exact existing Telegram PPA
// auction_lots and auction_credits. Never mint items or debit balances.
const err=(status,code,message)=>({status,data:{ok:false,code,message}});
const json=(value,fallback)=>{try{return JSON.parse(value)}catch{return fallback}};
const money=n=>Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;
const id=x=>String(x??'');
function publicItem(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const x=raw.item&&typeof raw.item==='object'?raw.item:raw;
 return {name:String(x.name||'Предмет PPA').slice(0,100),
  kind:String(x.kind||x.type||'').slice(0,32),
  slot:String(x.slot||'').slice(0,32),
  rarity:String(x.rarity||'common').slice(0,24),
  icon:String(x.icon||'').slice(0,24),
  enh:Number.isSafeInteger(x.enh)?x.enh:0};
}
function view(row,own){
 const price=Number(row.price),qty=Number(row.qty);
 if(!Number.isFinite(price)||price<=0||price>999999999||
  !Number.isSafeInteger(qty)||qty<1||qty>999)return null;
 const currency=String(row.currency||'').toLowerCase();
 if(!['ppa','gram'].includes(currency))return null;
 const item=publicItem(json(row.ui_json||'{}',null));
 if(!item)return null;
 return {id:id(row.id).slice(0,100),item,price,qty,currency,
  sellerName:String(row.seller_name||'Игрок').slice(0,32),
  sellerId:id(row.seller_id),mine:own,expiresAt:Number(row.expires_at)||0,
  canBuy:false,canCancel:false};
}
export async function nativeAuctionReadOnly(env,ownerId,loadSave){
 const owner=id(ownerId);
 const saved=await loadSave(owner);
 if(!saved?.ok||saved.bootstrapFromProfile||!saved.state||
   !Number.isSafeInteger(saved.version)||saved.version<1)
  return err(409,'PPA_AUCTION_SAVE_UNAVAILABLE','Сохранение PPA ещё не подтверждено.');
 const state=saved.state,now=Date.now();
 let rows,credits;
 try{
  [rows,credits]=await Promise.all([
   env.DB.prepare('SELECT id,seller_id,seller_name,ui_json,qty,price,currency,expires_at FROM auction_lots WHERE status=?1 AND expires_at>?2 ORDER BY created_at DESC LIMIT 300')
    .bind('active',now).all(),
   env.DB.prepare('SELECT id,lot_id,sold_qty,currency,amount,created_at FROM auction_credits WHERE seller_id=?1 AND acked=0 ORDER BY created_at ASC LIMIT 100')
    .bind(owner).all()
  ]);
 }catch(_){
  return err(503,'PPA_AUCTION_TABLES_UNAVAILABLE','Оригинальные таблицы аукциона пока недоступны.');
 }
 const lots=[],mine=[];
 for(const row of rows.results||[]){
  const own=id(row.seller_id)===owner,result=view(row,own);
  if(result)(own?mine:lots).push(result);
 }
 const pendingCredits=(credits.results||[]).map(row=>({
  id:id(row.id).slice(0,100),lotId:id(row.lot_id).slice(0,100),
  soldQty:Number(row.sold_qty)||0,currency:String(row.currency||'').toLowerCase(),
  amount:money(Number(row.amount)),createdAt:Number(row.created_at)||0
 })).filter(x=>x.amount!==null);
 const bag=Array.isArray(state.bag)?state.bag.slice(0,100).map(item=>item&&typeof item==='object'?{
   uid:typeof item.uid==='string'?item.uid:null,
   name:String(item.name||'Вещь').slice(0,100),
   slot:String(item.slot||'').slice(0,30),
   rarity:String(item.rarity||'common').slice(0,24),
   enh:Number.isSafeInteger(item.enh)?item.enh:0
 }:null).filter(Boolean):[];
 return {status:200,data:{
  ok:true,gameId:'phoenix-pix-arena',contract:'ppa-auction-readonly-v1',
  ownerId:owner,actions:[],
  state:{connected:true,self:{id:owner},version:saved.version,
   wallet:{ppa:money(Number(state.ppa)),gram:money(Number(state.gram))},
   commissionPct:10,source:'Telegram PPA auction_lots/auction_credits',
   lots,mine,pendingCredits,bag,settlementEnabled:false}
 }};
}
