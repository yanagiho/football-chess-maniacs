// ============================================================
// S4: 切断と再接続
// ①WS切断（オフライン化）→ 相手に切断通知 → 復帰 → RECONNECTで盤面同期
// ②ページリロード時の挙動を現状仕様として記録（修正はしない）
// 実行: node e2e/online_s4_reconnect.mjs
// ============================================================

import { startAuthKit } from './online/authkit.mjs';
import {
  launchBrowser, newPlayer, readBoard, waitForInput,
  issueMove, confirmTurn, boardKey, enterRandomMatch, check, failureCount,
} from './online/helpers.mjs';

const kit = startAuthKit();
const run = Date.now().toString(36);
const browser = await launchBrowser();
const A = await newPlayer(browser, kit.signToken(`e2e_s4a_${run}`));
const B = await newPlayer(browser, kit.signToken(`e2e_s4b_${run}`));

await Promise.all([enterRandomMatch(A.page), enterRandomMatch(B.page)]);
const [ia, ib] = await Promise.all([waitForInput(A.page, 40000), waitForInput(B.page, 40000)]);
check(!!ia && !!ib, 'マッチ成立');

// 1ターン正常に進めておく
await Promise.all([issueMove(A.page), issueMove(B.page)]);
await Promise.all([confirmTurn(A.page), confirmTurn(B.page)]);
await Promise.all([waitForInput(A.page, 30000), waitForInput(B.page, 30000)]);

// ── ①WSサイレント切断（オフライン化）→ 復帰 ──
// PING間隔(10秒)より長くオフラインにして、クライアント側が確実に切断を検知するようにする
await B.ctx.setOffline(true);
await B.page.waitForTimeout(12000);
await B.ctx.setOffline(false);

// Bが自動再接続してstatus=playingに戻る
let reconnected = false;
for (let i = 0; i < 60; i++) {
  const b = await readBoard(B.page);
  if (b && b.status === 'playing') { reconnected = true; break; }
  await B.page.waitForTimeout(500);
}
check(reconnected, 'B復帰: 自動再接続でstatus=playingに戻る');

// 復帰後に盤面が一致し、もう1ターン正常に進行する
// （サーバーは60秒のターンタイマーで未入力を自動補完するため、最悪でも70秒以内に進む）
await B.page.waitForTimeout(1500);
const [ba, bb] = await Promise.all([readBoard(A.page), readBoard(B.page)]);
check(!!ba && !!bb && boardKey(ba) === boardKey(bb), '復帰後: 盤面がA/Bで一致');

await Promise.all([issueMove(A.page), issueMove(B.page)]);
await Promise.all([confirmTurn(A.page), confirmTurn(B.page)]);
const [na, nb] = await Promise.all([waitForInput(A.page, 75000), waitForInput(B.page, 75000)]);
check(!!na && !!nb && na.turn === nb.turn, `復帰後: 次ターンが正常進行 (turn=${na?.turn})`);

// ── ②ページリロード → 復帰バナー（リロード復帰導線） ──
await B.page.reload();
await B.page.waitForTimeout(2500);
let bannerVisible = false;
for (let i = 0; i < 20; i++) {
  bannerVisible = (await B.page.locator('button', { hasText: '復帰する' }).count()) > 0;
  if (bannerVisible) break;
  await B.page.waitForTimeout(500);
}
check(bannerVisible, 'リロード後: マイページに「復帰する/棄権する」バナーが表示される');

// ── ③明示的な切断（クローズフレームあり）→ 相手への切断通知 ──
// リロードでBのWSはclose済み → Aに OPPONENT_DISCONNECTED バナーが出るはず
let notified = false;
for (let i = 0; i < 30; i++) {
  const text = await A.page.evaluate(() => document.body.innerText);
  if (/切断/.test(text)) { notified = true; break; }
  await A.page.waitForTimeout(500);
}
check(notified, 'B離脱(クローズフレームあり): Aに切断バナーが表示される');
console.log('INFO: 猶予(DISCONNECT_GRACE_MS)超過で不戦勝処理（endMatch reason=disconnect）になる実装。長時間のため本テストでは猶予満了までは検証しない');

await browser.close();
console.log(failureCount() === 0 ? '\nALL PASS' : `\n${failureCount()} FAILURES`);
process.exit(failureCount() === 0 ? 0 : 1);
