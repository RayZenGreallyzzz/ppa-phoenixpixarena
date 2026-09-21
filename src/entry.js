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
        iconUrl: origin + '/tonconnect-icon.svg'
      }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=300'
        }
      });
    }
    if (requestUrl.pathname === '/tonconnect-icon.svg') {
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#102433"/><stop offset="1" stop-color="#05090c"/></linearGradient></defs><rect width="256" height="256" rx="52" fill="url(#g)"/><circle cx="128" cy="128" r="92" fill="none" stroke="#62b9ee" stroke-width="10"/><path d="M78 166V88h58c29 0 48 14 48 39 0 26-19 40-49 40h-25v-24h23c13 0 20-5 20-15 0-9-7-14-20-14h-25v52z" fill="#a8ddff"/><path d="M92 184h72" stroke="#e3c47f" stroke-width="9" stroke-linecap="round"/></svg>',
        {
          headers: {
            'content-type': 'image/svg+xml; charset=utf-8',
            'cache-control': 'public, max-age=86400'
          }
        }
      );
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
