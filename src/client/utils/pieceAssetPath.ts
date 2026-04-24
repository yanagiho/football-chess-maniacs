/**
 * コマ情報から対応するPNGアセットのパスを返す。
 * 命名規則: /assets/pieces/{side}_{position}_{rank}.png
 */

type Side = 'ally' | 'enemy';

const RANK_MAP: Record<number, string> = {
  1:   'cost1',
  1.5: 'cost1plus',
  2:   'cost2',
  2.5: 'cost2plus',
  3:   'ss',
};

export function getPieceAssetPath(
  position: string,
  cost: number,
  side: Side,
): string {
  const pos = position.toLowerCase();
  const rank = RANK_MAP[cost] ?? 'cost1';
  return `/assets/pieces/${side}_${pos}_${rank}.png`;
}
