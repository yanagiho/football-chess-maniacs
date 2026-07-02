// ============================================================
// S1: カジュアルマッチ成立と同期
// A/B同時マッチング → 対戦成立（home/away片方ずつ）→ 3ターンの
// 盤面/スコア/ターン一致 → 片方のみ確定時の相手待ち表示
// 実行: node e2e/online_s1_sync.mjs
// 前提: vite@5173（VITE_API_BASE/WS_BASE→wrangler）+ wrangler dev + src/.dev.vars（authkit JWKS参照）
// ============================================================

import { startAuthKit } from './online/authkit.mjs';
import {
  launchBrowser, newPlayer, readBoard, waitForInput,
  issueMove, confirmTurn, boardKey, enterRandomMatch, check, failureCount,
} from './online/helpers.mjs';

const kit = startAuthKit();
const run = Date.now().toString(36);
const browser = await launchBrowser();
const A = await newPlayer(browser, kit.signToken(`e2e_s1a_${run}`));
const B = await newPlayer(browser, kit.signToken(`e2e_s1b_${run}`));

// 同時にランダム対戦へ
await Promise.all([enterRandomMatch(A.page), enterRandomMatch(B.page)]);

// 双方がバトルINPUTへ到達
const [ia, ib] = await Promise.all([waitForInput(A.page, 40000), waitForInput(B.page, 40000)]);
check(!!ia && !!ib, 'マッチ成立: 双方が対戦画面のINPUTに到達');
const teams = [ia?.myTeam, ib?.myTeam].sort();
check(teams[0] === 'away' && teams[1] === 'home',
  `チーム割当: home/awayが1人ずつ (A=${ia?.myTeam}, B=${ib?.myTeam})`);

const startTurn = ia?.turn ?? 1;

// 3ターン: 双方が命令を出して確定 → 盤面一致を検証
for (let t = 0; t < 3; t++) {
  const expectTurn = startTurn + t;
  const [ma, mb] = await Promise.all([issueMove(A.page), issueMove(B.page)]);
  check(!!ma && !!mb, `turn ${expectTurn}: 双方が移動命令を注入 (A=${ma?.pieceId}, B=${mb?.pieceId})`);

  // Aのみ確定 → 相手待ち表示
  await confirmTurn(A.page);
  let waiting = false;
  for (let i = 0; i < 20; i++) {
    const b = await readBoard(A.page);
    if (b?.status === 'waiting_opponent') { waiting = true; break; }
    await A.page.waitForTimeout(250);
  }
  check(waiting, `turn ${expectTurn}: Aのみ確定 → status=waiting_opponent（相手待ち）`);

  // Bも確定 → 双方が次ターンINPUTへ
  await confirmTurn(B.page);
  const [na, nb] = await Promise.all([waitForInput(A.page, 30000), waitForInput(B.page, 30000)]);
  check(!!na && !!nb, `turn ${expectTurn}: 双方が次ターンINPUTへ復帰`);
  check(na?.turn === expectTurn + 1 && nb?.turn === expectTurn + 1,
    `turn ${expectTurn}: ターン番号が両者で一致 (A=${na?.turn}, B=${nb?.turn})`);
  check(!!na && !!nb && boardKey(na) === boardKey(nb), `turn ${expectTurn}: 盤面・スコアがA/Bで一致`);
}

check(A.errors.length === 0 && B.errors.length === 0,
  `コンソールエラーなし (A=${A.errors.length}, B=${B.errors.length})`);
[...A.errors, ...B.errors].slice(0, 5).forEach(e => console.log('  ' + e.slice(0, 180)));

await browser.close();
console.log(failureCount() === 0 ? '\nALL PASS' : `\n${failureCount()} FAILURES`);
process.exit(failureCount() === 0 ? 0 : 1);
