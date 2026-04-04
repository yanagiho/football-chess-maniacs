#!/usr/bin/env npx tsx
// ============================================================
// run.ts — 10,000試合の実行スクリプト（§3-1 Phase 1）
//
// 使い方:
//   npx tsx src/ai/bootstrap/run.ts [--matches 10000] [--output training_data] [--batch 100]
//
// 出力:
//   training_data/
//   ├── matches_00001_00100.jsonl   # 学習データ（100試合ずつ分割）
//   ├── matches_00101_00200.jsonl
//   ├── ...
//   └── stats.json                 # 全体統計
//
// §3-2: 1試合90ターン×50ms/ターン ≈ 4.5秒/試合。
//        10,000試合 ≈ 12.5時間（直列）。
//        並列化は run.ts を複数プロセスで --offset 付き実行で対応。
// ============================================================

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { playMatch, type MatchResult } from './auto_play.js';
import { extractTrainingData, toJsonl, calcDatasetStats, type TrainingRecord } from './data_extract.js';

// ================================================================
// CLI 引数パース
// ================================================================

function parseArgs(): { totalMatches: number; outputDir: string; batchSize: number; offset: number } {
  const args = process.argv.slice(2);
  let totalMatches = 10_000;
  let outputDir = 'training_data';
  let batchSize = 100;
  let offset = 0;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--matches':
        totalMatches = parseInt(args[++i], 10);
        break;
      case '--output':
        outputDir = args[++i];
        break;
      case '--batch':
        batchSize = parseInt(args[++i], 10);
        break;
      case '--offset':
        offset = parseInt(args[++i], 10);
        break;
    }
  }

  return { totalMatches, outputDir, batchSize, offset };
}

// ================================================================
// メイン
// ================================================================

function main() {
  const { totalMatches, outputDir, batchSize, offset } = parseArgs();

  console.log(`=== FCMS Bootstrap: Phase 1 ===`);
  console.log(`Matches: ${totalMatches} (offset: ${offset})`);
  console.log(`Output: ${outputDir}/`);
  console.log(`Batch size: ${batchSize}`);
  console.log('');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const overallStart = Date.now();
  const allMatchResults: MatchResult[] = [];
  const totalBatches = Math.ceil(totalMatches / batchSize);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, totalMatches);

    const batchStartTime = Date.now();
    const globalStart = offset + batchStart;
    const globalEnd = offset + batchEnd;

    process.stdout.write(
      `[${batchIdx + 1}/${totalBatches}] Matches ${globalStart + 1}–${globalEnd}... `,
    );

    const batchResults: MatchResult[] = [];
    const batchRecords: TrainingRecord[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      const matchId = `m_${String(offset + i + 1).padStart(5, '0')}`;
      const result = playMatch(matchId);
      batchResults.push(result);
      batchRecords.push(...extractTrainingData(result));
    }

    allMatchResults.push(...batchResults);

    // JSONL出力
    const filename = `matches_${String(globalStart + 1).padStart(5, '0')}_${String(globalEnd).padStart(5, '0')}.jsonl`;
    writeFileSync(join(outputDir, filename), toJsonl(batchRecords));

    const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    const avgMs = batchResults.length > 0
      ? Math.round(batchResults.reduce((s, m) => s + m.durationMs, 0) / batchResults.length)
      : 0;

    const completed = allMatchResults.length;
    const elapsed = Math.round((Date.now() - overallStart) / 1000);
    const eta = completed > 0
      ? ((Date.now() - overallStart) / completed * (totalMatches - completed) / 60_000).toFixed(1)
      : '?';

    console.log(
      `${batchResults.length} matches, ${batchRecords.length} records, ` +
      `${batchDuration}s (${avgMs}ms/match) | ${completed}/${totalMatches} ETA ~${eta}min`,
    );
  }

  // ================================================================
  // 全体統計
  // ================================================================

  const stats = calcDatasetStats(allMatchResults);
  const totalDuration = Date.now() - overallStart;

  const statsOutput = {
    ...stats,
    totalDurationMs: totalDuration,
    totalDurationMin: +(totalDuration / 60_000).toFixed(1),
    avgMatchDurationMs: allMatchResults.length > 0
      ? Math.round(allMatchResults.reduce((s, m) => s + m.durationMs, 0) / allMatchResults.length)
      : 0,
    config: { totalMatches, batchSize, offset },
  };

  writeFileSync(join(outputDir, 'stats.json'), JSON.stringify(statsOutput, null, 2));

  console.log('');
  console.log('=== Complete ===');
  console.log(`Matches: ${stats.totalMatches} | Records: ~${stats.totalRecords}`);
  console.log(`Home ${stats.homeWins} / Away ${stats.awayWins} / Draw ${stats.draws}`);
  console.log(`Avg goals: ${stats.avgGoalsPerMatch.toFixed(2)}/match`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(0)}s (${(totalDuration / 60_000).toFixed(1)}min)`);
  console.log(`Output: ${outputDir}/`);
}

main();
