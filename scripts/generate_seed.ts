#!/usr/bin/env npx tsx
// ============================================================
// generate_seed.ts — characters_200.csv → piece_master_seed.sql
// 一回限りのスクリプト。 npx tsx scripts/generate_seed.ts で実行
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '../docs/lore/characters_200.csv');
const OUT_PATH = resolve(__dirname, 'piece_master_seed.sql');

// ── マッピング定義 ──

const COST_MAP: Record<string, number> = {
  '1': 1, '1+': 1.5, '2': 2, '2+': 2.5, 'SS': 3,
};

// Era (1-13) → Shelf (1-7)
const ERA_SHELF_MAP: Record<number, number> = {
  1: 1, 2: 1,       // Dawn
  3: 2, 4: 2,       // Interwar
  5: 3, 6: 3,       // Post-War
  7: 4,             // Expansion
  8: 5, 9: 5,       // Modernization
  10: 6, 11: 6,     // Global
  12: 7, 13: 7,     // Present
};

// 日本語国籍略号 → ISO コード
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
  // 二重国籍は最初の国を使用
  '仏/烏': 'FR', '仏/阿': 'FR', '葡/伯': 'PT', '塞/蒙': 'RS',
};

// 日本語家系名 → 英語キー
const FAMILY_MAP: Record<string, string | null> = {
  'ブラックウッド': 'blackwood',
  'マクファーレン': 'macfarlane',
  'モンテフィオーレ': 'montefiore',
  'ヴァイスハウプト': 'weisshaupt',
  'デュボワ': 'dubois',
  'シルヴァ': 'silva',
  'コヴァチェヴィッチ': 'kovacevic',
  'オコンクウォ': 'okonkwo',
};

function parseFamily(raw: string): string | null {
  if (raw === 'FC Grassroots') return null;
  if (raw.startsWith('無所属')) return null;
  // 「ブラックウッド家(...)」→「ブラックウッド」を抽出、「縁戚」も同家系扱い
  for (const [ja, en] of Object.entries(FAMILY_MAP)) {
    if (raw.includes(ja)) return en;
  }
  return null;
}

function parseNationality(raw: string): string {
  const nat = NAT_MAP[raw];
  if (!nat) {
    console.warn(`Unknown nationality: "${raw}" — using raw value`);
    return raw;
  }
  return nat;
}

function escSql(s: string): string {
  return s.replace(/'/g, "''");
}

// ── CSV パース ──

const csv = readFileSync(CSV_PATH, 'utf-8');
const lines = csv.trim().split('\n');
const header = lines[0]; // id,name_ja,name_en,position,cost,era,family,nationality,is_fcg,summary
console.log(`Header: ${header}`);
console.log(`Rows: ${lines.length - 1}`);

const inserts: string[] = [
  '-- ============================================================',
  '-- piece_master_seed.sql — 200人コマ原本データ投入',
  '-- Generated from docs/lore/characters_200.csv',
  '-- ============================================================',
  '',
];

let errors = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // 10フィールド固定（summary は最後のフィールド、カンマなし確認済み）
  const parts = line.split(',');
  if (parts.length !== 10) {
    console.error(`Line ${i + 1}: expected 10 fields, got ${parts.length}`);
    errors++;
    continue;
  }

  const [idStr, nameJa, nameEn, position, costStr, eraStr, familyRaw, natRaw, isFcgStr, summary] = parts;

  const pieceId = parseInt(idStr, 10);
  const cost = COST_MAP[costStr];
  if (cost === undefined) {
    console.error(`Line ${i + 1}: unknown cost "${costStr}"`);
    errors++;
    continue;
  }

  const era = parseInt(eraStr, 10);
  const eraShelf = ERA_SHELF_MAP[era];
  if (!eraShelf) {
    console.error(`Line ${i + 1}: unknown era ${era}`);
    errors++;
    continue;
  }

  const family = parseFamily(familyRaw);
  const nationality = parseNationality(natRaw);
  const isFounding = isFcgStr === 'true' ? 1 : 0;
  const isPurchasable = isFounding ? 0 : 1;
  const sku = `fcms_piece_${idStr.padStart(3, '0')}`;

  const familySql = family ? `'${escSql(family)}'` : 'NULL';

  inserts.push(
    `INSERT INTO piece_master (piece_id, sku, name_ja, name_en, position, cost, era, era_shelf, family, nationality, is_founding, is_purchasable, summary_ja, image_status) VALUES (${pieceId}, '${sku}', '${escSql(nameJa)}', '${escSql(nameEn)}', '${position}', ${cost}, ${era}, ${eraShelf}, ${familySql}, '${nationality}', ${isFounding}, ${isPurchasable}, '${escSql(summary)}', 'provisional');`,
  );
}

if (errors > 0) {
  console.error(`\n${errors} errors found. Fix CSV and re-run.`);
  process.exit(1);
}

writeFileSync(OUT_PATH, inserts.join('\n') + '\n', 'utf-8');
console.log(`\nGenerated ${inserts.length - 5} INSERT statements → ${OUT_PATH}`);
