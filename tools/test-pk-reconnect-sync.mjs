import fs from 'node:fs';
const client=fs.readFileSync(process.argv[2]||'gateway/realtime-client.js','utf8');
const server=fs.readFileSync('src/realtime-stable.js','utf8');
const world=fs.readFileSync('gateway/world-combat-client.js','utf8');
function must(v,msg){if(!v)throw new Error(msg)}
const open=client.indexOf('ws.onopen=function()');
must(open>=0,'realtime ws.onopen missing');
const end=client.indexOf('ws.onmessage=function',open);
must(end>open,'realtime ws.onopen end missing');
const block=client.slice(open,end);
must(block.includes('sendRoom(true);sendMove(true);'),'room/move sync must happen before PK resync');
must(block.includes("send({type:'player-pk-toggle',enabled:!!(window.PPA_PK_ACTIVE&&window.PPA_PK_ACTIVE())})"),'PK state must resync after reconnect');
must(world.includes("window.PPA_PK_ACTIVE=function(){return !!pkOn&&pkZone()};"),'client PK authority state missing');
must(world.includes("window.PPA_RT_SEND({type:'player-pk-toggle',enabled:pkOn})"),'manual PK toggle transport missing');
must(server.includes("if (m.type === 'player-pk-toggle')"),'server PK toggle handler missing');
must(server.includes("if (m.type === 'player-pk-hit' || m.type === 'player-pk-skill-hit')"),'server PK damage handler missing');
console.log('PK reconnect sync invariants OK');
