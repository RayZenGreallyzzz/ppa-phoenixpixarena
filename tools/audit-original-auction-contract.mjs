import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const source=gunzipSync(Buffer.concat(Array.from({length:12},(_,i)=>
 readFileSync(new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url))))).toString('utf8');
const sha=createHash('sha256').update(source).digest('hex');
if(sha!=='a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7')
 throw new Error('Original PPA HTML not checksum-locked');
const needles=['auctionCredit','auctionCredits','auctionAck','ack-credits','auctionServer',
 'function auctionCancelLot(','function auctionBuyLot(','function auctionReturnPayload(',
 'function auctionPlaceLot(','function auctionSell','auctionPlace','auctionCancel',
 'function auctionNormalizeLots(','function auctionApply','function sendAuctionState(',
 'function auctionSync','function auctionRefresh','function auctionPay',
 'auctionPayout','auctionPending','credits','function auctionOn',
 'auctionClaim','credit.amount','acked','auctionRemote','auctionLot',
 'auctionApplySellerSettlement','PPA_AUCTION_SELLER','PPA_AUCTION_MARKET','PPA_AUCTION_BUY_HANDLER','sellerSettlement'];
for(const word of needles){
 let at=0,found=[];
 while((at=source.toLowerCase().indexOf(word.toLowerCase(),at))>=0&&found.length<15){
  found.push(at);at+=word.length;
 }
 console.log('PPA_AUCTION_FLOW_LOCATOR',JSON.stringify({word,hits:found,
  excerpts:found.slice(0,5).map(i=>source.slice(Math.max(0,i-200),Math.min(source.length,i+700)))}));
}
for(const name of ['auctionApplySellerSettlement','auctionCancelLot','auctionReturnPayload','auctionNormalizeLots',
 'auctionPlaceLot','sendAuctionState']){
 const start=source.indexOf('function '+name+'(');
 if(start<0)continue;
 const end=source.indexOf('\nfunction ',start+11);
 console.log('PPA_AUCTION_ORIGINAL_EXACT',JSON.stringify({name,
  code:source.slice(start,Math.min(end>start?end:start+4500,start+4500))}));
}
console.log('PPA_AUCTION_SOURCE_SHA_OK',sha);
