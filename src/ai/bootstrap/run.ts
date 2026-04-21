#!/usr/bin/env npx tsx
// ============================================================
// run.ts — 10,000試合の実行スクリプト（§3-1 Phase 1）
//
// 使い方:
//   npx tsx src/ai/bootstrap/run.ts [--matches 10000] [--output training_data] [--batch 10]
//
// 出力:
//   training_data/
//   ├── matches_00001_00010.jsonl
//   ├── ...
//   └── stats.json
//
// メモリ対策:
//   - 1試合ずつ実行し、ターン毎にストリーミング書き込み
//   - allMatchResults にはサマリのみ保持（TurnRecordsを蓄積しない）
//   - バッチ毎にファイルを分割して1ファイルが巨大にならないよう制御
// ============================================================

import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { playMatch, type MatchSummary } from './auto_play.js';
import { extractTurnRecords, createStatsAccumulator } from './data_extract.js';

// ================================================================
// CLI 引数パース
// ================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  let totalMatches = 10_000;
  let outputDir = 'training_data';
  let batchSize = 10;
  let offset = 0;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--matches': {
        const v = parseInt(args[++i], 10);
        if (Number.isNaN(v) || v <= 0) { console.error('Invalid --matches value'); process.exit(1); }
        totalMatches = v;
        break;
      }
      case '--output':
        outputDir = args[++i];
        break;
      case '--batch': {
        const v = parseInt(args[++i], 10);
        if (Number.isNaN(v) || v <= 0) { console.error('Invalid --batch value'); process.exit(1); }
        batchSize = v;
        break;
      }
      case '--offset': {
        const v = parseInt(args[++i], 10);
        if (Number.isNaN(v) || v < 0) { console.error('Invalid --offset value'); process.exit(1); }
        offset = v;
        break;
      }
    }
  }

  return { totalMatches, outputDir, batchSize, offset };
}

// ================================================================
// メイン
// ================================================================

function main() {
  const { totalMatches, outputDir, batchSize, offset } = parseArgs();

  console.log('=== FCMS Bootstrap: Phase 1 ===');
  console.log(`Matches: ${totalMatches} (offset: ${offset})`);
  console.log(`Output: ${outputDir}/`);
  console.log(`Batch size: ${batchSize}`);
  console.log('');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const overallStart = Date.now();
  const statsAcc = createStatsAccumulator();
  const totalBatches = Math.ceil(totalMatches / batchSize);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, totalMatches);
    const globalStart = offset + batchStart;
    const globalEnd = offset + batchEnd;

    const batchStartTime = Date.now();
    process.stdout.write(
      `[${batchIdx + 1}/${totalBatches}] Matches ${globalStart + 1}–${globalEnd}... `,
    );

    // ── バッチ用のファイルをストリーム書き込みで開く ──
    const filename = `matches_${String(globalStart + 1).padStart(5, '0')}_${String(globalEnd).padStart(5, '0')}.jsonl`;
    const stream = createWriteStream(join(outputDir, filename));

    let batchRecordCount = 0;
    let batchDurationSum = 0;

    for (let i = batchStart; i < batchEnd; i++) {
      const matchId = `m_${String(offset + i + 1).padStart(5, '0')}`;
      let matchRecordCount = 0;

      // 1試合ずつ実行。キックオフを交互（偶数=home、奇数=away）で公平性確保。
      const firstKickoff = i % 2 === 0 ? 'home' as const : 'away' as const;
      const summary = playMatch(matchId, (turnRecord, currentSummary) => {
        const records = extractTurnRecords(turnRecord, currentSummary);
        for (const rec of records) {
          stream.write(JSON.stringify(rec) + '\n');
          matchRecordCount++;
        }
      }, firstKickoff);

      statsAcc.addMatch(summary, matchRecordCount);
      batchRecordCount += matchRecordCount;
      batchDurationSum += summary.durationMs;
    }

    // ストリームを閉じる
    stream.end();

    const batchCount = batchEnd - batchStart;
    const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    const avgMs = batchCount > 0 ? Math.round(batchDurationSum / batchCount) : 0;

    const stats = statsAcc.getStats();
    const elapsed = Math.round((Date.now() - overallStart) / 1000);
    const remaining = totalMatches - stats.totalMatches;
    const eta = stats.totalMatches > 0
      ? ((Date.now() - overallStart) / stats.totalMatches * remaining / 60_000).toFixed(1)
      : '?';

    console.log(
      `${batchCount} matches, ${batchRecordCount} records, ` +
      `${batchDuration}s (${avgMs}ms/match) | ` +
      `${stats.totalMatches}/${totalMatches} [${elapsed}s] ETA ~${eta}min`,
    );
  }

  // ================================================================
  // 全体統計
  // ================================================================

  const finalStats = statsAcc.getStats();
  const totalDuration = Date.now() - overallStart;

  const statsOutput = {
    ...finalStats,
    totalDurationMs: totalDuration,
    totalDurationMin: +(totalDuration / 60_000).toFixed(1),
    avgMatchDurationMs: finalStats.totalMatches > 0
      ? Math.round(totalDuration / finalStats.totalMatches)
      : 0,
    config: { totalMatches, batchSize, offset },
  };

  writeFileSync(join(outputDir, 'stats.json'), JSON.stringify(statsOutput, null, 2));

  console.log('');
  console.log('=== Complete ===');
  console.log(`Matches: ${finalStats.totalMatches} | Records: ${finalStats.totalRecords}`);
  console.log(`Home ${finalStats.homeWins} / Away ${finalStats.awayWins} / Draw ${finalStats.draws}`);
  console.log(`Avg goals: ${finalStats.avgGoalsPerMatch.toFixed(2)}/match`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(0)}s (${(totalDuration / 60_000).toFixed(1)}min)`);
  console.log(`Output: ${outputDir}/`);
}

main();
