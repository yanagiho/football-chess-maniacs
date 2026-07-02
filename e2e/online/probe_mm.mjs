// マッチメイキング疎通プローブ: JWT2枚でWS接続→JOIN_QUEUE→MATCH_FOUND
import { startAuthKit } from './authkit.mjs';
const kit = startAuthKit();
const WS = 'ws://localhost:8799';

function conn(name, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/match/ws?token=${encodeURIComponent(token)}`);
    const msgs = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      msgs.push(m);
      console.log(`[${name}]`, JSON.stringify(m).slice(0, 160));
    });
    ws.addEventListener('open', () => resolve({ ws, msgs }));
    ws.addEventListener('error', e => { console.log(`[${name}] ws error`); reject(new Error('ws error')); });
    ws.addEventListener('close', ev => console.log(`[${name}] closed code=${ev.code} reason=${ev.reason}`));
  });
}

const tokenA = kit.signToken('e2e_user_a');
const tokenB = kit.signToken('e2e_user_b');
const a = await conn('A', tokenA);
const b = await conn('B', tokenB);
a.ws.send(JSON.stringify({ type: 'JOIN_QUEUE', rating: 0, teamId: 'default' }));
b.ws.send(JSON.stringify({ type: 'JOIN_QUEUE', rating: 0, teamId: 'default' }));

// MATCH_FOUND を最大20秒待つ
const start = Date.now();
while (Date.now() - start < 20000) {
  const fa = a.msgs.find(m => m.type === 'MATCH_FOUND');
  const fb = b.msgs.find(m => m.type === 'MATCH_FOUND');
  if (fa && fb) {
    console.log('MATCHED:', fa.matchId, 'A team=', fa.team, 'B team=', fb.team);
    process.exit(0);
  }
  await new Promise(r => setTimeout(r, 300));
}
console.log('TIMEOUT: no MATCH_FOUND');
process.exit(1);
