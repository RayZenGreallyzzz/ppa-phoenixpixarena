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
      const raw = atob('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');
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
