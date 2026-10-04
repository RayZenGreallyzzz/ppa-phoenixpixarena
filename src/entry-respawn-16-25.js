import app from './entry.js';
import { RealtimeHub } from './realtime-respawn-16-25.js';

// Cloudflare entry wrapper: keep every existing HTTP route from entry.js,
// but export the patched Durable Object class for ordinary mob respawn timing.
export { RealtimeHub };
export default app;
