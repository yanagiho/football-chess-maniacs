// ============================================================
// S2: Bot補完フォールバック
// 1人でマッチングに入り、COM_TIMEOUT_MS(30秒)超過でBotが割り当てられ
// 試合が開始・進行することを検証
// 実行: node e2e/online_s2_bot.mjs
// ============================================================

import { startAuthKit } from './online/authkit.mjs';
import {
  launchBrowser, newPlayer, waitForInput,
  issueMove, confirmTurn, enterRandomMatch, check, failureCount,
} from './online/helpers.mjs';

const kit = startAuthKit();
const run = Date.now().toString(36);
const browser = await launchBrowser();
const A = await newPlayer(browser, kit.signToken(`e2e_s2_${run}`));

const t0 = Date.now();
await enterRandomMatch(A.page);

// COM_TIMEOUT_MS=30秒 + マッチングalarm間隔ぶんの余裕を見て待つ
const ia = await waitForInput(A.page, 60000);
const elapsedSec = Math.round((Date.now() - t0) / 1000);
check(!!ia, `Bot補完: 対戦相手不在でも試合開始（${elapsedSec}秒で開始、閾値30秒+alarm間隔）`);
check(elapsedSec >= 25, `Bot補完はCOM_TIMEOUT_MS(30秒)経過後に発動 (実測${elapsedSec}秒)`);
check(ia?.myTeam === 'home', `Bot戦ではプレイヤーがhome (実際: ${ia?.myTeam})`);

// Bot戦を3ターン進行（サーバー側COM AIがaway命令を自動生成）
for (let t = 0; t < 3; t++) {
  const turnBefore = (await waitForInput(A.page, 30000))?.turn;
  await issueMove(A.page);
  await confirmTurn(A.page);
  const next = await waitForInput(A.page, 30000);
  check(!!next && next.turn === turnBefore + 1,
    `Bot戦 turn ${turnBefore}: 自分の確定のみでターンが進行 (→${next?.turn})`);
}

check(A.errors.length === 0, `コンソールエラーなし (${A.errors.length})`);
A.errors.slice(0, 3).forEach(e => console.log('  ' + e.slice(0, 180)));

await browser.close();
console.log(failureCount() === 0 ? '\nALL PASS' : `\n${failureCount()} FAILURES`);
process.exit(failureCount() === 0 ? 0 : 1);
