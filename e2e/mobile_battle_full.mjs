// フルターン自動プレイ: 確定→EXECUTION→次ターンINPUT復帰を3ターン検証
// 実行: node e2e/mobile_battle_full.mjs [--device=pixel7|iphone13] [--reduced-motion] [--tutorial]
import { chromium, webkit, devices } from 'playwright';
import fs from 'node:fs';

const SHOT_DIR = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(SHOT_DIR, { recursive: true });

const deviceArg = process.argv.find(a => a.startsWith('--device='))?.split('=')[1] ?? 'iphone13';
const reducedMotion = process.argv.includes('--reduced-motion');
const withTutorial = process.argv.includes('--tutorial');
const profiles = {
  pixel7: { browser: chromium, device: devices['Pixel 7'] },
  iphone13: { browser: webkit, device: devices['iPhone 13'] },
};
const { browser: browserType, device } = profiles[deviceArg];
const tag = `${deviceArg}${reducedMotion ? '_rm' : ''}${withTutorial ? '_tut' : ''}`;

const errors = [];
let shotIdx = 0;
async function shot(page, name) {
  const file = `${SHOT_DIR}full_${String(shotIdx++).padStart(2, '0')}_${tag}_${name}.png`;
  await page.screenshot({ path: file });
}

const browser = await browserType.launch();
const context = await browser.newContext({
  ...device,
  reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
});
const page = await context.newPage();

page.on('console', msg => {
  const type = msg.type();
  if (type === 'error' || type === 'warning') {
    errors.push({ kind: `console.${type}`, text: msg.text() });
    console.log(`[console.${type}] ${msg.text()}`);
  }
});
page.on('pageerror', err => {
  errors.push({ kind: 'pageerror', text: String(err) });
  console.log(`[pageerror] ${err}`);
});

await page.addInitScript(([tut]) => {
  if (!tut) localStorage.setItem('fcms_tutorial_done', '1');
  localStorage.setItem('fcms.locale', 'ja');
}, [withTutorial]);

const darkOverlayState = () => page.evaluate(() => {
  const dark = [...document.querySelectorAll('div')]
    .filter(d => (d.style.background || '').replace(/\s/g, '').includes('rgba(0,0,0,0.45)'));
  const confirmBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('確定') && !b.textContent.includes('取消'));
  return {
    darkOverlays: dark.length,
    confirmVisible: !!confirmBtn,
    confirmDisabled: confirmBtn ? confirmBtn.disabled : null,
    bodyText: document.body.innerText.slice(0, 120).replace(/\n/g, ' | '),
  };
});

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/';
await page.goto(BASE_URL);
await page.waitForTimeout(1200);
await page.getByText('COM対戦', { exact: true }).first().tap();
console.log('[full] started COM match');
// KICKOFF演出中にタッチ連打（実機報告の操作を模倣）
await page.waitForTimeout(2500);
await shot(page, 'kickoff');
for (let i = 0; i < 4; i++) {
  await page.touchscreen.tap(200, 400 + i * 30);
  await page.waitForTimeout(200);
}
console.log('[full] tapped during/after kickoff:', JSON.stringify(await darkOverlayState()));
await shot(page, 'after_kickoff_taps');

// 3ターン: INPUT待ち→コマタップ→確定→次INPUT復帰確認
for (let turn = 1; turn <= 3; turn++) {
  // INPUT待ち（確定ボタンが有効化されるまで）
  let ok = false;
  for (let i = 0; i < 40; i++) {
    const s = await darkOverlayState();
    if (s.darkOverlays === 0 && s.confirmVisible && s.confirmDisabled === false) { ok = true; break; }
    await page.waitForTimeout(500);
  }
  const pre = await darkOverlayState();
  console.log(`[full] turn ${turn} INPUT reached=${ok}:`, JSON.stringify(pre));
  await shot(page, `turn${turn}_input`);
  if (!ok) {
    console.log(`[full] !!! STUCK before turn ${turn} — dark overlay never cleared`);
    break;
  }

  // コマをタップ（自動ズーム発火）→ 少し上のHEXをタップ（移動命令）
  const piece = page.locator('img[src*="/assets/pieces/ally_"]').nth(7);
  const box = await piece.boundingBox();
  if (box) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
    await shot(page, `turn${turn}_selected`);
    const vp = page.viewportSize();
    await page.touchscreen.tap(vp.width / 2, vp.height / 2 - 120); // ズーム後の少し上のHEX
    await page.waitForTimeout(500);
  }
  // 確定
  const confirm = page.getByText('確定', { exact: false }).last();
  try { await confirm.tap({ timeout: 3000 }); } catch { console.log('[full] confirm tap failed'); }
  console.log(`[full] turn ${turn} confirmed`);
  await page.waitForTimeout(1500);
  await shot(page, `turn${turn}_executing`);
}

// 最終状態
const final = await darkOverlayState();
console.log('[full] final:', JSON.stringify(final));
await shot(page, 'final');

console.log('\n===== collected errors =====');
for (const e of errors) console.log(`- [${e.kind}] ${e.text}`);
if (errors.length === 0) console.log('(none)');

await browser.close();
