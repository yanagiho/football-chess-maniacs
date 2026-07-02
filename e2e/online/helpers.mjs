// ============================================================
// helpers.mjs — オンラインE2E共通ヘルパー
// 前提: vite@5173（VITE_API_BASE/WS_BASE→wrangler devのポート）、
//       wrangler dev（src/.dev.vars で authkit のJWKSを参照）が起動済み
// ============================================================

import { chromium, devices } from 'playwright';

export const APP_URL = process.env.BASE_URL ?? 'http://localhost:5173/';
export const API_URL = process.env.API_URL ?? 'http://localhost:8799';

let failures = 0;
export const check = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
};
export const failureCount = () => failures;

export async function launchBrowser() {
  return chromium.launch();
}

/** JWTをlocalStorageに積んだプレイヤーコンテキストを作る */
export async function newPlayer(browser, token, { query = '', consoleTag = null } = {}) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const errors = [];
  const warns = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e}`));
  page.on('console', m => {
    if (m.type() === 'warning') warns.push(m.text());
    // Reactのstyle警告等、既知の無害な警告はエラー扱いしない
    if (m.type() === 'error' && !m.text().includes('style property during rerender')) {
      errors.push(`console: ${m.text()}`);
    }
    if (consoleTag) console.log(`  [${consoleTag}]`, m.text().slice(0, 140));
  });
  await page.addInitScript(([tok]) => {
    localStorage.setItem('fcms_token', tok);
    localStorage.setItem('fcms_tutorial_done', '1');
    localStorage.setItem('fcms.locale', 'ja');
  }, [token]);
  await page.goto(APP_URL + query);
  await page.waitForTimeout(1200);
  return { ctx, page, errors, warns };
}

/** DEVフックの盤面ダイジェストを読む（Battle画面でのみ非null） */
export function readBoard(page) {
  return page.evaluate(() => window.__fcmsBoard ?? null);
}

/** INPUTフェーズ到達を待つ */
export async function waitForInput(page, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const b = await readBoard(page);
    if (b && b.turnPhase === 'INPUT' && b.status === 'playing') return b;
    await page.waitForTimeout(400);
  }
  return null;
}

/** 自チームの非GKコマ1体に前進moveを注入（UI座標計算を介さないDEVフック経由） */
export async function issueMove(page) {
  return page.evaluate(() => {
    const b = window.__fcmsBoard;
    if (!b) return null;
    const dir = b.myTeam === 'home' ? 1 : -1;
    const occupied = new Set(b.pieces.map(p => `${p.col},${p.row}`));
    for (const p of b.pieces) {
      if (p.team !== b.myTeam || p.id.includes('b')) continue;
      const target = { col: p.col, row: p.row + dir * 2 };
      if (target.row < 0 || target.row > 33) continue;
      if (occupied.has(`${target.col},${target.row}`)) continue;
      if (p.hasBall) continue; // ボール保持者はドリブル扱いになるため単純moveの対象外
      window.__fcmsAddOrder({ pieceId: p.id, action: 'move', targetHex: target });
      return { pieceId: p.id, target };
    }
    return null;
  });
}

/** ターン確定ボタンをクリック */
export async function confirmTurn(page) {
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent?.includes('確定') && !b.textContent.includes('取消'));
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });
}

/** 盤面ダイジェストの比較キー（表示座標ではなく盤面座標なのでflipYの影響なし） */
export function boardKey(b) {
  return JSON.stringify({
    turn: b.turn, scoreHome: b.scoreHome, scoreAway: b.scoreAway,
    pieces: b.pieces,
  });
}

/** Title画面の「ランダム対戦」からカジュアルマッチングに入る */
export async function enterRandomMatch(page) {
  await page.locator('button', { hasText: 'ランダム対戦' }).first().click();
}
