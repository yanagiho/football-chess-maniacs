// 盤面端のコマ(GK等)タップ時の自動ズームで画面がどれだけ黒くなるか検証
// 実行: node e2e/mobile_gk_tap.mjs
import { webkit, devices } from 'playwright';
import fs from 'node:fs';

const SHOT_DIR = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
page.on('pageerror', err => console.log(`[pageerror] ${err}`));

await page.addInitScript(() => {
  localStorage.setItem('fcms_tutorial_done', '1');
  localStorage.setItem('fcms.locale', 'ja');
});

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/';
await page.goto(BASE_URL);
await page.waitForTimeout(1200);
await page.getByText('COM対戦', { exact: true }).first().tap();
await page.waitForTimeout(6000); // KICKOFF演出 + INPUT到達待ち

// 最も画面下にある自軍コマ（=GK）を特定してタップ
const pieces = page.locator('img[src*="/assets/pieces/ally_"]');
const n = await pieces.count();
let bottomIdx = 0, bottomY = -1;
for (let i = 0; i < n; i++) {
  const b = await pieces.nth(i).boundingBox();
  if (b && b.y > bottomY) { bottomY = b.y; bottomIdx = i; }
}
const box = await pieces.nth(bottomIdx).boundingBox();
console.log(`[gk] tapping bottommost piece idx=${bottomIdx} at y=${Math.round(bottomY)}`);
await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOT_DIR}gk_tap_zoomed.png` });

// 盤面コンテナ内の「黒背景（盤外）」率をピクセルサンプリングで計測
const darkness = await page.evaluate(() => {
  // HexBoardコンテナ（transformを持つ子を含む要素）を探す
  const boardOuter = [...document.querySelectorAll('div')].find(d =>
    [...d.children].some(c => c.style?.transform?.includes('scale')));
  if (!boardOuter) return { error: 'board not found' };
  const rect = boardOuter.getBoundingClientRect();
  const inner = [...boardOuter.children].find(c => c.style?.transform?.includes('scale'));
  const t = inner.style.transform; // translate(Xpx, Ypx) scale(S)
  const m = t.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/);
  if (!m) return { error: `unparsable transform: ${t}` };
  const [tx, ty, s] = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  const BOARD_W = 1035, BOARD_H = 1827;
  // コンテナ内で盤面画像が占める矩形
  const boardLeft = tx, boardTop = ty;
  const boardRight = tx + BOARD_W * s, boardBottom = ty + BOARD_H * s;
  const visW = rect.width, visH = rect.height;
  const ovLeft = Math.max(0, boardLeft), ovTop = Math.max(0, boardTop);
  const ovRight = Math.min(visW, boardRight), ovBottom = Math.min(visH, boardBottom);
  const boardArea = Math.max(0, ovRight - ovLeft) * Math.max(0, ovBottom - ovTop);
  const offBoardRatio = 1 - boardArea / (visW * visH);
  return { transform: t, container: { w: visW, h: visH }, offBoardRatio: Math.round(offBoardRatio * 100) + '%' };
});
console.log('[gk] board coverage:', JSON.stringify(darkness, null, 2));

await browser.close();
