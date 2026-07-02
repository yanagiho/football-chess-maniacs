// ============================================================
// S3: フレンドマッチ（招待コード / URL / 不正コード）
// 実行: node e2e/online_s3_friend.mjs
// ============================================================

import { startAuthKit } from './online/authkit.mjs';
import {
  launchBrowser, newPlayer, waitForInput, boardKey, readBoard, check, failureCount,
} from './online/helpers.mjs';

const kit = startAuthKit();
const run = Date.now().toString(36);
const browser = await launchBrowser();

/** Title → 対戦へ → フレンド対戦 画面へ */
async function gotoFriendScreen(page) {
  await page.locator('button', { hasText: '対戦へ' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: 'フレンドマッチ' }).first().click(); // カード選択
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'フレンドマッチ' }).last().click();  // 遷移ボタン
  await page.waitForTimeout(600);
}

/** ホスト: 部屋を作ってroomIdを取得 */
async function createRoom(page) {
  const resPromise = page.waitForResponse(r => r.url().includes('/match/friend/create'), { timeout: 10000 });
  await page.locator('button', { hasText: '部屋を作る' }).first().click();
  const res = await resPromise;
  const body = await res.json();
  return body.roomId;
}

// ── コード方式 ──
{
  const A = await newPlayer(browser, kit.signToken(`e2e_s3a_${run}`));
  const B = await newPlayer(browser, kit.signToken(`e2e_s3b_${run}`));
  await gotoFriendScreen(A.page);
  const roomId = await createRoom(A.page);
  check(/^[A-Z0-9]{6}$/.test(roomId ?? ''), `コード方式: 6桁の招待コード発行 (${roomId})`);

  await gotoFriendScreen(B.page);
  await B.page.locator('button', { hasText: '部屋に入る' }).first().click();
  await B.page.waitForTimeout(400);
  await B.page.locator('input').first().fill(roomId);
  await B.page.locator('button', { hasText: '参加' }).last().click();

  const [ia, ib] = await Promise.all([waitForInput(A.page, 30000), waitForInput(B.page, 30000)]);
  check(!!ia && !!ib, 'コード方式: ホスト/参加者とも対戦画面INPUTに到達');
  check(ia?.myTeam === 'home' && ib?.myTeam === 'away',
    `コード方式: ホスト=home / 参加者=away (A=${ia?.myTeam}, B=${ib?.myTeam})`);
  check(!!ia && !!ib && boardKey(ia) === boardKey(ib), 'コード方式: 初期盤面が両者で一致');
  check(A.errors.length === 0 && B.errors.length === 0, `コード方式: コンソールエラーなし (A=${A.errors.length}, B=${B.errors.length})`);
  await A.ctx.close(); await B.ctx.close();
}

// ── URL方式（?friend=CODE で参加コードがプリフィルされる） ──
{
  const A = await newPlayer(browser, kit.signToken(`e2e_s3c_${run}`));
  await gotoFriendScreen(A.page);
  const roomId = await createRoom(A.page);

  const B = await newPlayer(browser, kit.signToken(`e2e_s3d_${run}`), { query: `?friend=${roomId}` });
  await gotoFriendScreen(B.page);
  await B.page.locator('button', { hasText: '部屋に入る' }).first().click();
  await B.page.waitForTimeout(400);
  const prefilled = await B.page.locator('input').first().inputValue();
  check(prefilled === roomId, `URL方式: ?friend= から参加コードがプリフィルされる (${prefilled})`);
  await B.page.locator('button', { hasText: '参加' }).last().click();

  const [ia, ib] = await Promise.all([waitForInput(A.page, 30000), waitForInput(B.page, 30000)]);
  check(!!ia && !!ib, 'URL方式: ホスト/参加者とも対戦画面INPUTに到達');
  await A.ctx.close(); await B.ctx.close();
}

// ── 不正コード ──
{
  const C = await newPlayer(browser, kit.signToken(`e2e_s3e_${run}`));
  await gotoFriendScreen(C.page);
  await C.page.locator('button', { hasText: '部屋に入る' }).first().click();
  await C.page.waitForTimeout(400);
  await C.page.locator('input').first().fill('ZZZZZZ');
  await C.page.locator('button', { hasText: '参加' }).last().click();
  await C.page.waitForTimeout(2000);
  const stillOnScreen = await C.page.locator('input').first().isVisible().catch(() => false);
  const board = await readBoard(C.page);
  check(stillOnScreen && !board, '不正コード: 対戦に遷移せずクラッシュもしない');
  const pageText = await C.page.evaluate(() => document.body.innerText);
  check(/見つかり|存在|無効|正しく/.test(pageText), `不正コード: エラーメッセージ表示`);
  // 404(ROOM_NOT_FOUND)はAPIの正常な失敗応答。ブラウザの "Failed to load resource: 404" は想定内
  const realErrors = C.errors.filter(e => !/status of 404/.test(e));
  check(realErrors.length === 0, `不正コード: 想定外のコンソールエラーなし (${realErrors.length})`);
  await C.ctx.close();
}

await browser.close();
console.log(failureCount() === 0 ? '\nALL PASS' : `\n${failureCount()} FAILURES`);
process.exit(failureCount() === 0 ? 0 : 1);
