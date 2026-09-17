import base from './worker.js';
import { handleOnlineRequest } from './online.js';

export default {
  async fetch(request, env, ctx) {
    const online = await handleOnlineRequest(request, env);
    if (online) return online;
    return base.fetch(request, env, ctx);
  }
};
