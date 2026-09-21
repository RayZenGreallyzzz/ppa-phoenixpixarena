import base from './worker.js';
import { handleOnlineRequest } from './online.js';
import { handleClanOnline } from './clan-online.js';
import { handleRealtimeRequest } from './realtime.js';
import { RealtimeHub } from './realtime-stable.js';
import { handleSocialRequest } from './social.js';
import { handleClassSyncRequest } from './class-sync.js';

export { RealtimeHub };

export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === '/tonconnect-manifest.json') {
      const origin = requestUrl.origin;
      return new Response(JSON.stringify({
        url: origin,
        name: 'PPA Phoenix Pix Arena',
        iconUrl: origin + '/tonconnect-icon.png'
      }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'access-control-allow-origin': '*'
        }
      });
    }
    if (requestUrl.pathname === '/tonconnect-icon.png') {
      const raw = atob('iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAAEYElEQVR42u2du1UkQQxFZ3TGwMNjTBIgkHWJdF0C2QQwN4sNAHboT5X0nupenzNdqsuTuqsHrk/PLxeA7whKAMgByAHIAcgByAHIAcgByAHIAcgBgByAHIAcgByAHIAc4MFtzWX/+v137498vN9Xq9J1hdcED6iALp3lmCTEUqK0kiNZiPaidJBDxIl+lnjLIatFD0Vc5bDQwl0RPznstPBVxEmOgVoc2KTaT0eOiRszfD8EL2k5Oc7sQVr1LS6ylRzHKl5ea9PLdpLD/eyjx9mNohy7Kiveua3XoiVHJy0arEtIju0VNH3maLdAFTk2Fq7BmZbRSuvlaB8YvksulmOdwHBce1CdKjauq/AsqSw5tqx5kdc2ZUsRlMMiQkryIzADP1Tayo8rXPAbALL1CczwipDM/AjMwA/FW1nMEK9GkhyPZceMvTXJCY/ADPwokwMzfP0I2ZVDeZXmymH9HRMLplY4qq6b2NBvLoEZ+CE0c2CGS92myMGo0WP4iPb6Ex5CcjxQGDOm+jE8PPhTk5AlB7HRKTyifD0gW8+RcnCT0uy2JdpoTnjoJgex0S88bu6C//lcVMq31/vH+93g4I3YaBkec2cOpg3rYA4RSUEwPHhCChVy0FPcO8tZOegpjTtL2OkMadVm5gDkgGQ5GDh6jx1TkoOBo8fYQVsB5IBMORg42o8d44/slQeOt9fB17brhYHhn/618pbvkAIzByAHIAcgx8gBmMdftfyv/scGVZIDkAOQA5ADMrgttdrz34A685Tz5KfPfsBKcgByAHIAcgByAHIAcgByAHIAcgAgB8yTY+xLJTCKsS9hkRyAHLCftY7s80+9dT6d5ABtOZhJ1abRAjn4FoILh3eKtgLIASJyMHY0GDjOysHY0XjgoK0AcoCUHIwd7gPHADkYO7oOHHPbCuFhHRvMHDBZDjpLy54yPTnoLL49ZZgchEe/2MiYOQgP39qGlKogtRe3HMHnqbPsm38JkRyCwoLILkQbzZk2pJPjsbb4kWDG2PDmCSkkykF49IiNguTAD6Pq8a9DuUlRmjkID5e6RYnI+DHWjElRPTE58MPajOltheHDcdSonDkID5cqRa3a+KHZUPKSAz8czchrK/hhZ8ZF52wFPwSrkSfHj7Ljx8Y6pN0DpiYHfhiZcblcrk/PL4KZueADEsGyFMwcW1a4WoRo/sLUDKT4YRGlBW1l7/Y3bjHiFai8ld245q4Rov+7UZkce/e+TYS4LLlejtVajNFKVeRYIULsFigkx97xwkgR03VpydFPEeu1KMpx7A5FqrLu1y8tx+E72PISm162mRxnap1ccYuLbCjH+epP2gPBS1pUjlH7cWZjaj8dObI3KR+vJzR+cpgq4vjgzlUOI0V8H/l7yyGuiPtJUAc51Cxpc3rcSo5CUVq+kdRWjgRR2r8FvYQcQ3RZ8IX4ReWALfCnJgE5ADkAOQA5ADkAOQA5ADkAOQA5AJADkAOQA5ADkAO0+AdXzPuGoJjDUwAAAABJRU5ErkJggg==');
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return new Response(bytes, {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=86400',
          'access-control-allow-origin': '*'
        }
      });
    }
    if (requestUrl.pathname === '/api/ton-balance') {
      const address = String(requestUrl.searchParams.get('address') || '').trim();
      if (!address || address.length > 128 || !/^(?:[EU]Q[A-Za-z0-9_-]+|0:[0-9a-fA-F]{64})$/.test(address)) {
        return new Response(JSON.stringify({ok:false,message:'Некорректный TON-адрес'}), {
          status:400,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
        });
      }
      try {
        const upstream = await fetch('https://tonapi.io/v2/accounts/' + encodeURIComponent(address), {
          headers:{accept:'application/json'}
        });
        if (!upstream.ok) throw new Error('TON API HTTP ' + upstream.status);
        const account = await upstream.json();
        const nano = Number(account && account.balance);
        if (!Number.isFinite(nano) || nano < 0) throw new Error('Invalid TON balance');
        return new Response(JSON.stringify({ok:true,address,balance:nano/1e9,updatedAt:Date.now()}), {
          headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
        });
      } catch (err) {
        return new Response(JSON.stringify({ok:false,message:'Не удалось получить баланс TON'}), {
          status:502,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
        });
      }
    }
    const realtime = await handleRealtimeRequest(request, env);
    if (realtime) return realtime;
    const classSync = await handleClassSyncRequest(request, env);
    if (classSync) return classSync;
    const social = await handleSocialRequest(request, env);
    if (social) return social;
    const clan = await handleClanOnline(request, env);
    if (clan) return clan;
    const online = await handleOnlineRequest(request, env);
    if (online) return online;
    return base.fetch(request, env, ctx);
  }
};
