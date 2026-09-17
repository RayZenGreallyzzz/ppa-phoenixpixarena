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
