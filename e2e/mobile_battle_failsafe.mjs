// スマホ実機「タップ後に暗転して進行不能」対策の回帰テスト
// 1. 正常フロー: タップ→確定→暗転→INPUT復帰 を2ターン
// 2. フォールト注入: リプレイチェーン例外→フェイルセーフで次ターンINPUTへ復旧
// 3. 端コマタップ: 自動ズームで盤外(黒背景)が画面に出ない(クランプ)
// 実行: node e2e/mobile_battle_failsafe.mjs [--device=pixel7|iphone13]
// devサーバー(localhost:5173)必須（フォールト注入はDEVビルドのみ有効）
import { chromium, webkit, devices } from 'playwright';
import fs from 'node:fs';

const SHOT_DIR = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(SHOT_DIR, { recursive: true });

const deviceArg = process.argv.find(a => a.startsWith('--device='))?.split('=')[1] ?? 'iphone13';
const profiles = {
  pixel7: { browser: chromium, device: devices['Pixel 7'] },
  iphone13: { browser: webkit, device: devices['iPhone 13'] },
};
const { browser: browserType, device } = profiles[deviceArg];

let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures++;
};

const browser = await browserType.launch();
const context = await browser.newContext({ ...device });
const page = await context.newPage();

const consoleLogs = [];
page.on('console', msg => consoleLogs.push(msg.text()));
page.on('pageerror', err => console.log(`[pageerror] ${err}`));

await page.addInitScript(() => {
  localStorage.setItem('fcms_tutorial_done', '1');
  localStorage.setItem('fcms.locale', 'ja');
});

const uiState = () => page.evaluate(() => {
  const dark = [...document.querySelectorAll('div')]
    .filter(d => (d.style.background || '').replace(/\s/g, '').includes('rgba(0,0,0,0.45)'));
  const confirmBtn = [...document.querySelectorAll('button')]
    .find(b => b.textContent?.includes('確定') && !b.textContent.includes('取消'));
  return {
    dark: dark.length > 0,
    confirmEnabled: !!confirmBtn && !confirmBtn.disabled,
  };
});

const waitForInput = async (timeoutMs = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await uiState();
    if (!s.dark && s.confirmEnabled) return true;
    await page.waitForTimeout(400);
  }
  return false;
};

const boardCoverage = () => page.evaluate(() => {
  const boardImg = document.querySelector('img[src*="board_mobile"]');
  if (!boardImg) return null;
  const inner = boardImg.parentElement; // transformを持つ盤面レイヤー
  const boardOuter = inner.parentElement; // コンテナ
  const rect = boardOuter.getBoundingClientRect();
  const m = inner.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/);
  if (!m) return null;
  const [tx, ty, s] = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  const BOARD_W = 1035, BOARD_H = 1827;
  const ovW = Math.max(0, Math.min(rect.width, tx + BOARD_W * s) - Math.max(0, tx));
  const ovH = Math.max(0, Math.min(rect.height, ty + BOARD_H * s) - Math.max(0, ty));
  return { offBoardRatio: 1 - (ovW * ovH) / (rect.width * rect.height), scale: s };
});

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/';
await page.goto(BASE_URL);
await page.waitForTimeout(1200);
await page.getByText('COM対戦', { exact: true }).first().tap();
console.log('--- COM match started ---');

// ═══ 1. 正常フロー: 2ターン ═══
check(await waitForInput(15000), 'turn 1: INPUT到達（KICKOFF後に暗転が解除される）');
for (let turn = 1; turn <= 2; turn++) {
  await page.getByText('確定', { exact: false }).last().tap();
  await page.waitForTimeout(1000);
  const mid = await uiState();
  check(mid.dark, `turn ${turn}: 確定後にEXECUTION暗転が表示される`);
  check(await waitForInput(20000), `turn ${turn}→${turn + 1}: 暗転が解除され次ターンINPUTへ`);
}
await page.screenshot({ path: `${SHOT_DIR}failsafe_normal_turns.png` });

// ═══ 2. フォールト注入 → フェイルセーフ復旧 ═══
await page.evaluate(() => { window.__fcmsForceReplayError = true; });
await page.getByText('確定', { exact: false }).last().tap();
const recovered = await waitForInput(8000);
check(recovered, 'フォールト注入: リプレイチェーン例外でもINPUTへ復旧（フェイルセーフ）');
check(
  consoleLogs.some(l => l.includes('replay chain error')),
  'フォールト注入: フェイルセーフのエラーログが出力される',
);
await page.evaluate(() => { window.__fcmsForceReplayError = false; });
await page.screenshot({ path: `${SHOT_DIR}failsafe_recovered.png` });

// 復旧後にもう1ターン正常に回ることを確認
await page.getByText('確定', { exact: false }).last().tap();
check(await waitForInput(20000), '復旧後: 通常ターンが正常に進行する');

// ═══ 3. 端コマタップ: 自動ズームのクランプ ═══
const pieces = page.locator('img[src*="/assets/pieces/ally_"]');
const n = await pieces.count();
const boxes = [];
for (let i = 0; i < n; i++) {
  const b = await pieces.nth(i).boundingBox();
  if (b) boxes.push({ i, ...b });
}
// 最下・最左・最右のコマを順にタップしてクランプ検証
const targets = [
  boxes.reduce((a, b) => (b.y > a.y ? b : a)),
  boxes.reduce((a, b) => (b.x < a.x ? b : a)),
  boxes.reduce((a, b) => (b.x > a.x ? b : a)),
];
for (const [idx, tgt] of targets.entries()) {
  await page.touchscreen.tap(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2);
  await page.waitForTimeout(600);
  const cov = await boardCoverage();
  check(
    cov !== null && cov.offBoardRatio < 0.01,
    `端コマ${idx + 1}: 自動ズーム後も盤外(黒背景)が画面に出ない (offBoard=${cov ? (cov.offBoardRatio * 100).toFixed(1) : '?'}%)`,
  );
  // 選択解除（同じコマを再タップ）
  await page.touchscreen.tap(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2);
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${SHOT_DIR}failsafe_edge_zoom.png` });

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
