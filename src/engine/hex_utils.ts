// ============================================================
// hex_utils.ts — HEXマップ共通ユーティリティ
//
// hex_map.json のロード・ルックアップ・ゾーン/レーン取得を一元化。
// engine/, ai/ の複数ファイルで重複していたパターンを統合。
// ============================================================

import type { HexCoord, Zone, Lane, BoardContext } from './types';
import { hexKey, getZocHexes } from './movement';
import hexMapData from '../data/hex_map.json';

// ================================================================
// HexEntry 型 & ルックアップ
// ================================================================

export interface HexEntry {
  col: number;
  row: number;
  x: number;
  y: number;
  zone: string;
  lane: string;
}

const hexMap = hexMapData as HexEntry[];

const hexLookup = new Map<string, HexEntry>();
for (const h of hexMap) hexLookup.set(`${h.col},${h.row}`, h);

/** HEXエントリを取得 */
export function getHexEntry(coord: HexCoord): HexEntry | undefined {
  return hexLookup.get(hexKey(coord));
}

// ================================================================
// ゾーン / レーン取得
// ================================================================

export function getZone(coord: HexCoord): Zone {
  return (hexLookup.get(hexKey(coord))?.zone as Zone) ?? 'ミドルサードD';
}

export function getLane(coord: HexCoord): Lane {
  return (hexLookup.get(hexKey(coord))?.lane as Lane) ?? 'センターレーン';
}

export function isValidHex(coord: HexCoord): boolean {
  return hexLookup.has(hexKey(coord));
}

// ================================================================
// ゾーン別HEX集合
// ================================================================

const zoneByHex = new Map<string, Zone>();
for (const h of hexMap) {
  zoneByHex.set(`${h.col},${h.row}`, h.zone as Zone);
}

const hexesByZone = new Map<Zone, Set<string>>();
for (const h of hexMap) {
  const z = h.zone as Zone;
  if (!hexesByZone.has(z)) hexesByZone.set(z, new Set());
  hexesByZone.get(z)!.add(`${h.col},${h.row}`);
}

/** 座標からゾーンを引く（Map版） */
export function getZoneByKey(key: string): Zone | undefined {
  return zoneByHex.get(key);
}

/** ゾーンに含まれるHEXキーのSetを返す */
export function getHexesByZone(zone: Zone): Set<string> | undefined {
  return hexesByZone.get(zone);
}

// ================================================================
// ZOCキーSet生成（重複パターン統合）
// ================================================================

/** 指定座標のZOC(隣接6HEX)のhexKeyセットを返す */
export function getZocKeySet(coord: HexCoord): Set<string> {
  return new Set(getZocHexes(coord).map(hexKey));
}

// ================================================================
// BoardContext 生成
// ================================================================

/** hex_map.json ベースの BoardContext を返す（モジュールレベルシングルトン） */
export const boardContext: BoardContext = {
  getZone,
  getLane,
  isValidHex,
};
