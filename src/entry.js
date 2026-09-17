import base from './worker.js';
import { handleOnlineRequest } from './online.js';
import { handleClanOnline } from './clan-online.js';
import { handleRealtimeRequest, RealtimeHub } from './realtime.js';

export { RealtimeHub };

export default {
  async fetch(request, env, ctx) {
    const realtime = await handleRealtimeRequest(request, env);
    if (realtime) return realtime;
    const clan = await handleClanOnline(request, env);
    if (clan) return clan;
    const online = await handleOnlineRequest(request, env);
    if (online) return online;
    return base.fetch(request, env, ctx);
  }
};
