// ============================================================
// S6: カジュアル/ランクのモード分離 + リロード復帰フロー
// (b) rankedとcasualのプレイヤーが互いにマッチしない・casualはcasual_プレフィックス
// (c) リロード → 復帰バナー → 復帰 → 盤面一致 → 試合継続
// 実行: node e2e/online_s6_mode_resume.mjs
// ============================================================

import { startAuthKit } from './online/authkit.mjs';
import {
  launchBrowser, newPlayer, readBoard, waitForInput,
  issueMove, confirmTurn, boardKey, enterRandomMatch, check, failureCount,
} from './online/helpers.mjs';

const kit = startAuthKit();
const run = Date.now().toString(36);
const WS = process.env.WS_URL ?? 'ws://localhost:8799';

// ── (b) モード分離: 生WSプローブで検証 ──
function conn(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/match/ws?token=${encodeURIComponent(token)}`);
    const msgs = [];
    ws.addEventListener('message', ev => msgs.push(JSON.parse(ev.data)));
    ws.addEventListener('open', () => resolve({ ws, msgs }));
    ws.addEventListener('error', () => reject(new Error('ws error')));
  });
}
const found = (c) => c.msgs.find(m => m.type === 'MATCH_FOUND');

{
  const ranked1 = await conn(kit.signToken(`e2e_s6r1_${run}`));
  const casual1 = await conn(kit.signToken(`e2e_s6c1_${run}`));
  ranked1.ws.send(JSON.stringify({ type: 'JOIN_QUEUE', rating: 0, teamId: 'default', mode: 'ranked' }));
  casual1.ws.send(JSON.stringify({ type: 'JOIN_QUEUE', rating: 0, teamId: 'default', mode: 'casual' }));

  // 8秒待ってもranked×casualはマッチしない
  await new Promise(r => setTimeout(r, 8000));
  check(!found(ranked1) && !found(casual1), 'モード分離: ranked と casual は互いにマッチしない（8秒待機）');

  // casualがもう1人参加 → casual同士がマッチ、matchIdはcasual_プレフィックス
  const casual2 = await conn(kit.signToken(`e2e_s6c2_${run}`));
  casual2.ws.send(JSON.stringify({ type: 'JOIN_QUEUE', rating: 0, teamId: 'default', mode: 'casual' }));
  let c1f = null, c2f = null;
  for (let i = 0; i < 40; i++) {
    c1f = found(casual1); c2f = found(casual2);
    if (c1f && c2f) break;
    await new Promise(r => setTimeout(r, 300));
  }
  check(!!c1f && !!c2f && c1f.matchId === c2f.matchId, 'モード分離: casual同士はマッチする');
  check((c1f?.matchId ?? '').startsWith('casual_'),
    `カジュアルのmatchIdはcasual_プレフィックス（レーティング対象外） (${c1f?.matchId?.slice(0, 14)}...)`);
  check(!found(ranked1), 'モード分離: rankedプレイヤーはcasualマッチに巻き込まれない');
  // rankedはBot補完(30秒)前にキューを抜ける
  ranked1.ws.send(JSON.stringify({ type: 'LEAVE_QUEUE' }));
  ranked1.ws.close(); casual1.ws.close(); casual2.ws.close();
}

// ── (c) リロード復帰フロー ──
const browser = await launchBrowser();
const A = await newPlayer(browser, kit.signToken(`e2e_s6a_${run}`));
const B = await newPlayer(browser, kit.signToken(`e2e_s6b_${run}`));
await Promise.all([enterRandomMatch(A.page), enterRandomMatch(B.page)]);
const [ia, ib] = await Promise.all([waitForInput(A.page, 40000), waitForInput(B.page, 40000)]);
check(!!ia && !!ib, '復帰フロー: マッチ成立');

// マイページのランダム対戦はcasual → matchIdがcasual_であることをsessionStorageから確認
const savedMatch = await A.page.evaluate(() => JSON.parse(sessionStorage.getItem('fcms_active_match') ?? 'null'));
check(savedMatch?.matchId?.startsWith('casual_') && savedMatch?.gameMode === 'casual',
  `復帰フロー: 進行中マッチがsessionStorageに保存され、ランダム対戦はcasual (${savedMatch?.matchId?.slice(0, 14)}...)`);

// 1ターン進める
await Promise.all([issueMove(A.page), issueMove(B.page)]);
await Promise.all([confirmTurn(A.page), confirmTurn(B.page)]);
await Promise.all([waitForInput(A.page, 30000), waitForInput(B.page, 30000)]);

// Bをリロード → 復帰バナー → 復帰する
await B.page.reload();
await B.page.waitForTimeout(2000);
let bannerBtn = null;
for (let i = 0; i < 20; i++) {
  const count = await B.page.locator('button', { hasText: '復帰する' }).count();
  if (count > 0) { bannerBtn = true; break; }
  await B.page.waitForTimeout(500);
}
check(!!bannerBtn, '復帰フロー: リロード後にマイページへ復帰バナーが表示される');
await B.page.locator('button', { hasText: '復帰する' }).first().click();

// Bが対戦画面に復帰し、盤面がAと一致する
const rb = await waitForInput(B.page, 30000);
check(!!rb, '復帰フロー: 「復帰する」で対戦画面INPUTに復帰');
await B.page.waitForTimeout(1500);
const [ba, bb] = await Promise.all([readBoard(A.page), readBoard(B.page)]);
check(!!ba && !!bb && boardKey(ba) === boardKey(bb), '復帰フロー: 復帰後の盤面がA/Bで一致');
check(bb?.myTeam === ib?.myTeam, `復帰フロー: チーム割当が維持される (${bb?.myTeam})`);

// 復帰後にもう1ターン正常進行（sequence再同期の自動再送を含む）
await Promise.all([issueMove(A.page), issueMove(B.page)]);
await Promise.all([confirmTurn(A.page), confirmTurn(B.page)]);
const [na, nb] = await Promise.all([waitForInput(A.page, 75000), waitForInput(B.page, 75000)]);
check(!!na && !!nb && na.turn === nb.turn, `復帰フロー: 復帰後のターンが正常進行 (turn=${na?.turn})`);

// ── (a) casualマッチ終了でELOが変動しない ──
// Aが棄権APIで試合を終了させ、queue処理後もrankingに両ユーザーが載らないことを確認
// （ranked側の「変動する」はS5で検証済み）
const API = process.env.API_URL ?? 'http://localhost:8799';
const casualMatchId = savedMatch?.matchId;
await fetch(`${API}/match/${casualMatchId}/leave`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${kit.signToken(`e2e_s6a_${run}`)}` },
});
// D1のマッチステータスがplaying以外になるまで待つ（queue配送）
let ended = false;
for (let i = 0; i < 15; i++) {
  const res = await fetch(`${API}/match/${casualMatchId}`, {
    headers: { Authorization: `Bearer ${kit.signToken(`e2e_s6a_${run}`)}` },
  });
  if (res.ok) {
    const body = await res.json();
    if (body.status && body.status !== 'playing') { ended = true; break; }
  }
  await new Promise(r => setTimeout(r, 3000));
}
check(ended, 'casualマッチが終了処理される（棄権API→queue）');
const rankRes = await fetch(`${API}/api/ranking`, {
  headers: { Authorization: `Bearer ${kit.signToken(`e2e_s6a_${run}`)}` },
});
const rankStr = JSON.stringify(rankRes.ok ? await rankRes.json() : {});
check(!rankStr.includes(`e2e_s6a_${run}`) && !rankStr.includes(`e2e_s6b_${run}`),
  'casualマッチ終了でELOが変動しない（rankingに両ユーザーが載らない）');

check(A.errors.length === 0 && B.errors.length === 0,
  `コンソールエラーなし (A=${A.errors.length}, B=${B.errors.length})`);
[...A.errors, ...B.errors].slice(0, 5).forEach(e => console.log('  ' + e.slice(0, 180)));

await browser.close();
console.log(failureCount() === 0 ? '\nALL PASS' : `\n${failureCount()} FAILURES`);
process.exit(failureCount() === 0 ? 0 : 1);
