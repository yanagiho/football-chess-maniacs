// ============================================================
// S5: 試合完走
// カジュアルマッチをFULL TIMEまで完走 → 両者finished → スコア整合 →
// レーティング永続化（/api/ranking に反映）を確認
// 実行: node e2e/online_s5_fullmatch.mjs（3〜6分かかる）
// ============================================================

import { startAuthKit } from './online/authkit.mjs';
import {
  launchBrowser, newPlayer, readBoard, waitForInput,
  issueMove, confirmTurn, check, failureCount, API_URL,
} from './online/helpers.mjs';

/** Title → 対戦へ → オンライン対戦（ランクマッチ）→ この設定で開始
 *  ELO更新の検証のため ranked 経由で入る（マイページの「ランダム対戦」はcasual=レート対象外） */
async function enterRankedMatch(page) {
  await page.locator('button', { hasText: '対戦へ' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: 'オンライン対戦' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'ランクマッチ' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'この設定で開始' }).first().click();
}

const kit = startAuthKit();
const run = Date.now().toString(36);
const userA = `e2e_s5a_${run}`;
const userB = `e2e_s5b_${run}`;
const browser = await launchBrowser();
const A = await newPlayer(browser, kit.signToken(userA));
const B = await newPlayer(browser, kit.signToken(userB));

await Promise.all([enterRankedMatch(A.page), enterRankedMatch(B.page)]);
const [ia, ib] = await Promise.all([waitForInput(A.page, 40000), waitForInput(B.page, 40000)]);
check(!!ia && !!ib, 'マッチ成立（ranked）');

// rankedマッチは m_ プレフィックス（レーティング対象）
const savedMatch = await A.page.evaluate(() => JSON.parse(sessionStorage.getItem('fcms_active_match') ?? 'null'));
check(savedMatch?.matchId?.startsWith('m_') && savedMatch?.gameMode === 'ranked',
  `rankedマッチはm_プレフィックス+mode=ranked (${savedMatch?.matchId?.slice(0, 10)}...)`);

// FULL TIMEまで回す（最大45ターン分の安全弁）
let finished = false;
let lastTurn = 0;
for (let i = 0; i < 45 && !finished; i++) {
  const [sa, sb] = await Promise.all([readBoard(A.page), readBoard(B.page)]);
  if (sa?.status === 'finished' || sb?.status === 'finished') { finished = true; break; }

  const [wa, wb] = await Promise.all([waitForInput(A.page, 20000), waitForInput(B.page, 20000)]);
  if (!wa || !wb) {
    const [fa, fb] = await Promise.all([readBoard(A.page), readBoard(B.page)]);
    if (fa?.status === 'finished' || fb?.status === 'finished') { finished = true; break; }
    console.log(`WARN: turn待ちタイムアウト A=${JSON.stringify(fa)?.slice(0, 90)}`);
    console.log(`WARN:                    B=${JSON.stringify(fb)?.slice(0, 90)}`);
    console.log(`WARN: A warns=${JSON.stringify(A.warns.slice(-2))} B warns=${JSON.stringify(B.warns.slice(-2))}`);
    continue;
  }
  lastTurn = wa.turn;
  await Promise.all([issueMove(A.page), issueMove(B.page)]);
  await Promise.all([confirmTurn(A.page), confirmTurn(B.page)]);
  await A.page.waitForTimeout(500);
}
check(finished, `FULL TIMEまで完走（最終確認ターン=${lastTurn}）`);

// 両者がfinished + スコア一致
let fa = null, fb = null;
for (let i = 0; i < 30; i++) {
  [fa, fb] = await Promise.all([readBoard(A.page), readBoard(B.page)]);
  if (fa?.status === 'finished' && fb?.status === 'finished') break;
  await A.page.waitForTimeout(500);
}
check(fa?.status === 'finished' && fb?.status === 'finished', '両クライアントがfinishedに到達');
check(fa?.scoreHome === fb?.scoreHome && fa?.scoreAway === fb?.scoreAway,
  `最終スコアが一致 (${fa?.scoreHome}-${fa?.scoreAway})`);

// FULL TIME表示 → 結果を見る → リザルト画面へ
const fullTimeVisible = (await A.page.locator('text=FULL TIME').count()) > 0;
check(fullTimeVisible, 'FULL TIME演出が表示される');
try {
  // 結果を見るボタンは FULLTIME_RESULT_BTN_DELAY_MS(3秒) 後に出現する
  await A.page.locator('button', { hasText: '結果を見る' }).first().click({ timeout: 15000 });
  await A.page.waitForTimeout(2500); // ResultScreenは遅延ロードのため少し待つ
  const text = await A.page.evaluate(() => document.body.innerText);
  check(/ボール支配率|タイトルへ|WIN|LOSE|DRAW/.test(text), 'リザルト画面へ遷移');
} catch (e) {
  await A.page.screenshot({ path: 'e2e/shots/s5_result_fail.png' }).catch(() => {});
  console.log('  click error:', String(e).slice(0, 140));
  check(false, 'リザルト画面へ遷移（結果を見るボタン）');
}

// レーティング永続化（queue経由）: /api/ranking に両ユーザーが載るまでポーリング
// （ローカルqueueのバッチ配送には数十秒かかることがある）
let hasA = false, hasB = false;
for (let i = 0; i < 15; i++) {
  const rankingRes = await fetch(`${API_URL}/api/ranking`, {
    headers: { Authorization: `Bearer ${kit.signToken(userA)}` },
  });
  const entries = JSON.stringify(rankingRes.ok ? await rankingRes.json() : {});
  hasA = entries.includes(userA);
  hasB = entries.includes(userB);
  if (hasA && hasB) break;
  await new Promise(r => setTimeout(r, 4000));
}
check(hasA && hasB, `ELO更新(rankedのみ対象): /api/ranking に両ユーザーが反映 (A=${hasA}, B=${hasB})`);

check(A.errors.length === 0 && B.errors.length === 0,
  `コンソールエラーなし (A=${A.errors.length}, B=${B.errors.length})`);
[...A.errors, ...B.errors].slice(0, 5).forEach(e => console.log('  ' + e.slice(0, 180)));

await browser.close();
console.log(failureCount() === 0 ? '\nALL PASS' : `\n${failureCount()} FAILURES`);
process.exit(failureCount() === 0 ? 0 : 1);
