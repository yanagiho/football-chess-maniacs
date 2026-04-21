// ============================================================
// movement.test.ts — コマ移動ユーティリティ（§9-2 フェーズ1）
//
// 検証項目:
//   - hexKey: HEX座標の文字列キー生成
//   - hexDistance: cube距離計算
//   - getNeighbors: 隣接6HEX（偶数列/奇数列）
//   - getZocHexes: ZOC（= getNeighbors エイリアス）
//   - getZoc2Hexes: 外周12HEX（距離2）
//   - hexLinePath: HEX直線パス生成
//   - buildZocMap / buildZoc2Map: ZOCマップ構築
//   - getZocAdjacency: ZOC隣接情報（攻撃/守備コマ数）
//   - getMovementRange: 移動力計算（§8-1）
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  hexKey,
  hexDistance,
  getNeighbors,
  getZocHexes,
  getZoc2Hexes,
  hexLinePath,
  buildZocMap,
  buildZoc2Map,
  getZocAdjacency,
  getMovementRange,
} from '../movement';
import type { Piece, HexCoord } from '../types';

// ── ヘルパー ──

function makePiece(overrides: Partial<Piece> & Pick<Piece, 'id' | 'position' | 'cost' | 'team' | 'coord'>): Piece {
  return { hasBall: false, ...overrides };
}

// ============================================================
// hexKey
// ============================================================
describe('hexKey — HEX座標の文字列キー', () => {
  it('"col,row" 形式で返す', () => {
    expect(hexKey({ col: 5, row: 10 })).toBe('5,10');
  });

  it('col=0, row=0 の場合', () => {
    expect(hexKey({ col: 0, row: 0 })).toBe('0,0');
  });
});

// ============================================================
// hexDistance
// ============================================================
describe('hexDistance — cube距離計算', () => {
  it('同一HEX → 0', () => {
    expect(hexDistance({ col: 5, row: 5 }, { col: 5, row: 5 })).toBe(0);
  });

  it('隣接HEX → 1', () => {
    const center: HexCoord = { col: 4, row: 5 };
    const neighbors = getNeighbors(center);
    for (const n of neighbors) {
      expect(hexDistance(center, n)).toBe(1);
    }
  });

  it('{col:0,row:0} → {col:2,row:0} = 2', () => {
    expect(hexDistance({ col: 0, row: 0 }, { col: 2, row: 0 })).toBe(2);
  });

  it('{col:0,row:0} → {col:0,row:3} = 3', () => {
    expect(hexDistance({ col: 0, row: 0 }, { col: 0, row: 3 })).toBe(3);
  });
});

// ============================================================
// getNeighbors
// ============================================================
describe('getNeighbors — 隣接6HEX', () => {
  it('偶数列(col=4, row=5): 6個の隣接HEXを返す', () => {
    const neighbors = getNeighbors({ col: 4, row: 5 });
    expect(neighbors).toHaveLength(6);
  });

  it('奇数列(col=5, row=5): 6個の隣接HEXを返す', () => {
    const neighbors = getNeighbors({ col: 5, row: 5 });
    expect(neighbors).toHaveLength(6);
  });

  it('偶数列の全隣接がhexDistance 1', () => {
    const center: HexCoord = { col: 4, row: 5 };
    for (const n of getNeighbors(center)) {
      expect(hexDistance(center, n)).toBe(1);
    }
  });

  it('奇数列の全隣接がhexDistance 1', () => {
    const center: HexCoord = { col: 5, row: 5 };
    for (const n of getNeighbors(center)) {
      expect(hexDistance(center, n)).toBe(1);
    }
  });

  it('偶数列と奇数列で異なるオフセットを返す', () => {
    const evenNeighbors = getNeighbors({ col: 4, row: 5 });
    const oddNeighbors = getNeighbors({ col: 5, row: 5 });
    const evenKeys = new Set(evenNeighbors.map(hexKey));
    const oddKeys = new Set(oddNeighbors.map(hexKey));
    // 少なくとも一部は異なるはず
    const intersection = [...evenKeys].filter(k => oddKeys.has(k));
    expect(intersection.length).toBeLessThan(6);
  });
});

// ============================================================
// getZocHexes（getNeighbors のエイリアス）
// ============================================================
describe('getZocHexes — ZOC（getNeighborsエイリアス）', () => {
  it('getNeighborsと同じ結果を返す', () => {
    const coord: HexCoord = { col: 10, row: 15 };
    const neighbors = getNeighbors(coord);
    const zoc = getZocHexes(coord);
    expect(zoc).toEqual(neighbors);
  });
});

// ============================================================
// getZoc2Hexes
// ============================================================
describe('getZoc2Hexes — 外周12HEX（距離2）', () => {
  it('12個のHEXを返す（中央付近）', () => {
    const zoc2 = getZoc2Hexes({ col: 10, row: 15 });
    expect(zoc2).toHaveLength(12);
  });

  it('全HEXがhexDistance 2', () => {
    const center: HexCoord = { col: 10, row: 15 };
    for (const h of getZoc2Hexes(center)) {
      expect(hexDistance(center, h)).toBe(2);
    }
  });

  it('ZOC（距離1）や自分自身と重複しない', () => {
    const center: HexCoord = { col: 10, row: 15 };
    const zoc1Keys = new Set([hexKey(center), ...getZocHexes(center).map(hexKey)]);
    const zoc2 = getZoc2Hexes(center);
    for (const h of zoc2) {
      expect(zoc1Keys.has(hexKey(h))).toBe(false);
    }
  });
});

// ============================================================
// hexLinePath
// ============================================================
describe('hexLinePath — HEX直線パス', () => {
  it('同一HEX → 空配列', () => {
    const h: HexCoord = { col: 5, row: 5 };
    expect(hexLinePath(h, h)).toEqual([]);
  });

  it('隣接HEX → 1要素（ターゲット自身）', () => {
    const from: HexCoord = { col: 4, row: 5 };
    const to: HexCoord = { col: 4, row: 6 };
    const path = hexLinePath(from, to);
    expect(path).toHaveLength(1);
    expect(path[0]).toEqual(to);
  });

  it('直線: {col:10,row:5} → {col:10,row:10} = 5HEX', () => {
    const path = hexLinePath({ col: 10, row: 5 }, { col: 10, row: 10 });
    expect(path).toHaveLength(5);
  });

  it('maxSteps制限: 最大2HEXのみ返す', () => {
    const from: HexCoord = { col: 10, row: 5 };
    const to: HexCoord = { col: 10, row: 10 };
    const path = hexLinePath(from, to, 2);
    expect(path).toHaveLength(2);
  });

  it('結果にfromを含まない', () => {
    const from: HexCoord = { col: 10, row: 5 };
    const to: HexCoord = { col: 10, row: 10 };
    const path = hexLinePath(from, to);
    const fromKey = hexKey(from);
    for (const h of path) {
      expect(hexKey(h)).not.toBe(fromKey);
    }
  });
});

// ============================================================
// buildZocMap
// ============================================================
describe('buildZocMap — ZOCマップ構築', () => {
  it('1体のコマ: 隣接6HEXにエントリを作成', () => {
    const piece = makePiece({
      id: 'p1', position: 'DF', cost: 2, team: 'home',
      coord: { col: 10, row: 15 },
    });
    const map = buildZocMap([piece], 'home');
    expect(map.size).toBe(6);
    for (const n of getZocHexes(piece.coord)) {
      expect(map.get(hexKey(n))).toBe('p1');
    }
  });

  it('指定チームのみ含む', () => {
    const homePiece = makePiece({
      id: 'h1', position: 'DF', cost: 2, team: 'home',
      coord: { col: 10, row: 15 },
    });
    const awayPiece = makePiece({
      id: 'a1', position: 'FW', cost: 2, team: 'away',
      coord: { col: 5, row: 5 },
    });
    const map = buildZocMap([homePiece, awayPiece], 'home');
    // awayのZOCは含まれない
    for (const n of getZocHexes(awayPiece.coord)) {
      expect(map.has(hexKey(n))).toBe(false);
    }
  });

  it('複数コマのZOC重複: 最初のコマIDが記録される', () => {
    const p1 = makePiece({
      id: 'p1', position: 'DF', cost: 2, team: 'home',
      coord: { col: 10, row: 15 },
    });
    const p2 = makePiece({
      id: 'p2', position: 'DF', cost: 2, team: 'home',
      coord: { col: 11, row: 15 },
    });
    const map = buildZocMap([p1, p2], 'home');
    // p1とp2のZOCが重なるHEXでは先に登録されたp1のIDになる
    const p1Zoc = new Set(getZocHexes(p1.coord).map(hexKey));
    const p2Zoc = new Set(getZocHexes(p2.coord).map(hexKey));
    const overlapping = [...p1Zoc].filter(k => p2Zoc.has(k));
    for (const k of overlapping) {
      expect(map.get(k)).toBe('p1');
    }
  });
});

// ============================================================
// getZocAdjacency
// ============================================================
describe('getZocAdjacency — ZOC隣接情報', () => {
  it('周囲にコマなし → attackCount:0, defenseCount:0', () => {
    const result = getZocAdjacency({ col: 10, row: 15 }, 'home', []);
    expect(result).toEqual({ attackCount: 0, defenseCount: 0 });
  });

  it('攻撃側1体がZOC内 → attackCount:1, defenseCount:0', () => {
    const attacker = makePiece({
      id: 'a1', position: 'FW', cost: 2, team: 'home',
      coord: { col: 10, row: 14 }, // 隣接
    });
    const result = getZocAdjacency({ col: 10, row: 15 }, 'home', [attacker]);
    expect(result).toEqual({ attackCount: 1, defenseCount: 0 });
  });

  it('攻守混在 → 正確なカウント', () => {
    const center: HexCoord = { col: 10, row: 15 };
    const neighbors = getNeighbors(center);
    const attacker1 = makePiece({
      id: 'h1', position: 'FW', cost: 2, team: 'home',
      coord: neighbors[0],
    });
    const attacker2 = makePiece({
      id: 'h2', position: 'MF', cost: 2, team: 'home',
      coord: neighbors[1],
    });
    const defender = makePiece({
      id: 'a1', position: 'DF', cost: 2, team: 'away',
      coord: neighbors[2],
    });
    const result = getZocAdjacency(center, 'home', [attacker1, attacker2, defender]);
    expect(result).toEqual({ attackCount: 2, defenseCount: 1 });
  });
});

// ============================================================
// getMovementRange — 移動力計算（§8-1）
// ============================================================
describe('getMovementRange — 移動力計算', () => {
  it('基本: move=4, dribble=3', () => {
    const piece = makePiece({
      id: 'p1', position: 'MF', cost: 2, team: 'home',
      coord: { col: 10, row: 15 },
    });
    expect(getMovementRange(piece, false, 'ミドルサードD', 'センターレーン')).toBe(4);
    expect(getMovementRange(piece, true, 'ミドルサードD', 'センターレーン')).toBe(3);
  });

  it('コスト3ボーナス: +1', () => {
    const piece = makePiece({
      id: 'p1', position: 'MF', cost: 3, team: 'home',
      coord: { col: 10, row: 15 },
    });
    expect(getMovementRange(piece, false, 'ミドルサードD', 'センターレーン')).toBe(5);
  });

  it('ゾーンボーナス: DFがディフェンシブサード → +1', () => {
    const piece = makePiece({
      id: 'p1', position: 'DF', cost: 2, team: 'home',
      coord: { col: 10, row: 3 },
    });
    expect(getMovementRange(piece, false, 'ディフェンシブサード', 'センターレーン')).toBe(5);
  });

  it('複合ボーナス: コスト3 + ゾーンボーナス → base + 2', () => {
    const piece = makePiece({
      id: 'p1', position: 'DF', cost: 3, team: 'home',
      coord: { col: 10, row: 3 },
    });
    // move: 4 + 1(cost3) + 1(zone) = 6
    expect(getMovementRange(piece, false, 'ディフェンシブサード', 'センターレーン')).toBe(6);
    // dribble: 3 + 1(cost3) + 1(zone) = 5
    expect(getMovementRange(piece, true, 'ディフェンシブサード', 'センターレーン')).toBe(5);
  });
});
