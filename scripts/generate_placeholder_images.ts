#!/usr/bin/env npx tsx
// ============================================================
// generate_placeholder_images.ts — 仮SVG画像200枚生成
// npx tsx scripts/generate_placeholder_images.ts で実行
// 出力: public/images/pieces/{piece_id:03d}.svg
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '../docs/lore/characters_200.csv');
const OUT_DIR = resolve(__dirname, '../public/images/pieces');

// ── 定数 ──

const SHELF_NAMES: Record<number, string> = {
  1: 'Dawn', 2: 'Interwar', 3: 'Post-War', 4: 'Expansion',
  5: 'Modernization', 6: 'Global', 7: 'Present',
};

const SHELF_COLORS: Record<number, string> = {
  1: '#D4C5A9', // Dawn: セピア
  2: '#C9B78E', // Interwar
  3: '#E8D9B5', // Post-War
  4: '#D8A878', // Expansion
  5: '#B5C9D4', // Modernization
  6: '#D9D9D9', // Global
  7: '#F0F0F0', // Present
};

const ERA_SHELF_MAP: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3,
  7: 4, 8: 5, 9: 5, 10: 6, 11: 6, 12: 7, 13: 7,
};

const COST_DISPLAY: Record<string, string> = {
  '1': '1', '1+': '1+', '2': '2', '2+': '2+', 'SS': 'SS',
};

// ── SVG生成 ──

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function generateSvg(opts: {
  pieceId: number;
  nameEn: string;
  position: string;
  costDisplay: string;
  cost: number;
  nationality: string;
  era: number;
  shelf: number;
}): string {
  const { pieceId, nameEn, position, costDisplay, cost, nationality, era, shelf } = opts;
  const bgColor = SHELF_COLORS[shelf] ?? '#F0F0F0';
  const shelfName = SHELF_NAMES[shelf] ?? 'Unknown';
  const fileNo = String(pieceId).padStart(3, '0');
  const isSS = cost === 3;

  // テキストカラー（明るい背景用にダークブラウン）
  const textColor = '#3E2723';
  const subTextColor = '#5D4037';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">
  <!-- 背景 -->
  <rect width="1024" height="1536" fill="${bgColor}" />
  <rect x="24" y="24" width="976" height="1488" rx="16" fill="none" stroke="${textColor}" stroke-width="2" opacity="0.3" />

  <!-- File No. (上部) -->
  <text x="512" y="100" text-anchor="middle" font-family="Georgia, serif" font-size="48" fill="${textColor}" font-weight="bold">File No. ${fileNo}</text>
  <line x1="312" y1="120" x2="712" y2="120" stroke="${textColor}" stroke-width="1" opacity="0.4" />

  <!-- 人物シルエット (中央) -->
  <g transform="translate(512, 620)">
    <!-- 頭 -->
    <circle cx="0" cy="-180" r="120" fill="#1A1A1A" opacity="0.85" />
    <!-- 肩・胴体 -->
    <ellipse cx="0" cy="20" rx="180" ry="220" fill="#1A1A1A" opacity="0.85" />
    <!-- 首 -->
    <rect x="-40" y="-80" width="80" height="60" fill="#1A1A1A" opacity="0.85" />
  </g>

  <!-- 下部情報 -->
  <text x="512" y="1060" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="${textColor}" font-weight="bold">${escXml(nameEn)}</text>

  <text x="512" y="1130" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="${subTextColor}">
    ${escXml(position)} | Cost ${escXml(costDisplay)}
  </text>

  <text x="512" y="1190" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="${subTextColor}">
    ${escXml(nationality)} · Era ${era} (${escXml(shelfName)})
  </text>

  <!-- 装飾ライン -->
  <line x1="212" y1="1220" x2="812" y2="1220" stroke="${textColor}" stroke-width="1" opacity="0.3" />

  <!-- PROVISIONAL スタンプ (右上) -->
  <g transform="translate(820, 200) rotate(15)">
    <rect x="-140" y="-30" width="280" height="60" rx="8" fill="none" stroke="#C62828" stroke-width="4" opacity="0.7" />
    <text x="0" y="12" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#C62828" font-weight="bold" opacity="0.7">PROVISIONAL</text>
  </g>${isSS ? `

  <!-- SS スタンプ (右下) -->
  <g transform="translate(880, 1350)">
    <circle cx="0" cy="0" r="60" fill="#C62828" opacity="0.85" />
    <text x="0" y="16" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="48" fill="#FFF" font-weight="bold">SS</text>
  </g>` : ''}
</svg>`;
}

// ── メイン ──

mkdirSync(OUT_DIR, { recursive: true });

const csv = readFileSync(CSV_PATH, 'utf-8');
const lines = csv.trim().split('\n');
console.log(`CSV rows: ${lines.length - 1}`);

let generated = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const parts = line.split(',');
  if (parts.length !== 10) {
    console.error(`Line ${i + 1}: expected 10 fields, got ${parts.length}`);
    continue;
  }

  const [idStr, , nameEn, position, costStr, eraStr, , natRaw] = parts;
  const pieceId = parseInt(idStr, 10);
  const era = parseInt(eraStr, 10);
  const shelf = ERA_SHELF_MAP[era];
  const costDisplay = COST_DISPLAY[costStr] ?? costStr;
  const cost = costStr === 'SS' ? 3 : costStr === '2+' ? 2.5 : costStr === '1+' ? 1.5 : parseFloat(costStr);

  // 国籍略号マッピング（generate_seed.tsと同じ）
  const NAT_MAP: Record<string, string> = {
    '英': 'GB-ENG', '蘇': 'GB-SCO', '愛': 'IE',
    '独': 'DE', '東独': 'DE', '東独→独': 'DE',
    '仏': 'FR', '伊': 'IT', '西': 'ES', '葡': 'PT',
    '蘭': 'NL', '墺': 'AT', '匈': 'HU', '捷': 'CZ',
    '波': 'PL', '瑞典': 'SE', '諾': 'NO', '芬': 'FI',
    '丁抹': 'DK', '露': 'RU',
    '塞': 'RS', '南斯': 'RS', '克': 'HR',
    '伯': 'BR', '亜': 'AR', '智': 'CL', '烏': 'UY',
    '中': 'CN', '日': 'JP', '韓': 'KR', '印': 'IN',
    '埃': 'EG', '奈': 'NG', '咖麦隆': 'CM',
    '塞内加': 'SN', '坦': 'TZ', '馬': 'ML', '牙買加': 'JM',
    '仏/烏': 'FR', '仏/阿': 'FR', '葡/伯': 'PT', '塞/蒙': 'RS',
  };
  const nationality = NAT_MAP[natRaw] ?? natRaw;

  const svg = generateSvg({ pieceId, nameEn, position, costDisplay, cost, nationality, era, shelf });
  const fileName = `${String(pieceId).padStart(3, '0')}.svg`;
  writeFileSync(resolve(OUT_DIR, fileName), svg, 'utf-8');
  generated++;
}

console.log(`\nGenerated ${generated} SVG files → ${OUT_DIR}`);
