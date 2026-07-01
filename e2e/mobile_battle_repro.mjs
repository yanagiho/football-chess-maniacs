// スマホ実機でKICKOFF後タップ→暗転進行不能になる不具合の再現スクリプト
// 実行: node e2e/mobile_battle_repro.mjs [--device=pixel7|iphone13]
// devサーバー(localhost:5173)が起動している必要がある
import { chromium, webkit, devices } from 'playwright';
import fs from 'node:fs';

const SHOT_DIR = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(SHOT_DIR, { recursive: true });

const deviceArg = process.argv.find(a => a.startsWith('--device='))?.split('=')[1] ?? 'pixel7';
const profiles = {
  pixel7: { browser: chromium, device: devices['Pixel 7'] },
  iphone13: { browser: webkit, device: devices['iPhone 13'] },
};
const { browser: browserType, device } = profiles[deviceArg];

const errors = [];
let shotIdx = 0;
async function shot(page, name) {
  const file = `${SHOT_DIR}${String(shotIdx++).padStart(2, '0')}_${deviceArg}_${name}.png`;
  await page.screenshot({ path: file });
  console.log(`[shot] ${file}`);
}

const browser = await browserType.launch();
const context = await browser.newContext({ ...device });
const page = await context.newPage();

page.on('console', msg => {
  const type = msg.type();
  const text = msg.text();
  if (type === 'error' || type === 'warning') {
    errors.push({ kind: `console.${type}`, text });
    console.log(`[console.${type}] ${text}`);
  } else {
    console.log(`[console] ${text}`);
  }
});
page.on('pageerror', err => {
  errors.push({ kind: 'pageerror', text: String(err) });
  console.log(`[pageerror] ${err}`);
});

// チュートリアルはスキップ（タップ再現を優先）。必要なら外して初回動線も検証可
await page.addInitScript(() => {
  localStorage.setItem('fcms_tutorial_done', '1');
  localStorage.setItem('fcms.locale', 'ja');
});

await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
await shot(page, 'title');

// マイページ → COM対戦（ワンタップ、T12）
await page.getByText('COM対戦', { exact: true }).first().tap();
await page.waitForTimeout(500);
await shot(page, 'after_com_tap');

// マッチング → 1秒でバトルへ。KICK OFF演出を待つ
await page.waitForTimeout(4000);
await shot(page, 'kickoff');

// INPUTフェーズ到達を待つ（確定ボタンが出る）
await page.waitForTimeout(3000);
await shot(page, 'turn1_input');

// 盤面のコマ画像をタップ（自軍コマ = ally画像）
const pieceImgs = page.locator('img[src*="/assets/pieces/ally_"]');
const count = await pieceImgs.count();
console.log(`[repro] ally piece images: ${count}`);
if (count > 0) {
  // FW付近（リストの後方）のコマをタップ
  const target = pieceImgs.nth(Math.min(count - 2, 9));
  const box = await target.boundingBox();
  console.log(`[repro] tapping piece at`, box);
  if (box) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
}
await page.waitForTimeout(1200);
await shot(page, 'after_piece_tap');

// 盤面の状態をダンプ（transform / 暗転オーバーレイの有無）
const domState = await page.evaluate(() => {
  const findByBg = (bg) =>
    [...document.querySelectorAll('div')].filter(d => d.style.background?.includes(bg));
  const dark = findByBg('rgba(0, 0, 0, 0.45)').concat(findByBg('rgba(0,0,0,0.45)'));
  const transformed = [...document.querySelectorAll('div')]
    .filter(d => d.style.transform?.includes('translate') && d.style.transform?.includes('scale'))
    .map(d => d.style.transform);
  return { darkOverlayCount: dark.length, transforms: transformed.slice(0, 5) };
});
console.log('[repro] DOM state:', JSON.stringify(domState, null, 2));

// さらに数秒待って自然回復するか確認
await page.waitForTimeout(4000);
await shot(page, 'after_wait');

const domState2 = await page.evaluate(() => {
  const findByBg = (bg) =>
    [...document.querySelectorAll('div')].filter(d => d.style.background?.includes(bg));
  const dark = findByBg('rgba(0, 0, 0, 0.45)').concat(findByBg('rgba(0,0,0,0.45)'));
  const transformed = [...document.querySelectorAll('div')]
    .filter(d => d.style.transform?.includes('translate') && d.style.transform?.includes('scale'))
    .map(d => d.style.transform);
  return { darkOverlayCount: dark.length, transforms: transformed.slice(0, 5) };
});
console.log('[repro] DOM state (after wait):', JSON.stringify(domState2, null, 2));

console.log('\n===== collected errors =====');
for (const e of errors) console.log(`- [${e.kind}] ${e.text}`);
if (errors.length === 0) console.log('(none)');

await browser.close();
