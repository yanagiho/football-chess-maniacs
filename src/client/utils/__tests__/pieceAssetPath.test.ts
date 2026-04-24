import { describe, it, expect } from 'vitest';
import { getPieceAssetPath } from '../pieceAssetPath';

describe('getPieceAssetPath', () => {
  it('ally GK cost 1', () => {
    expect(getPieceAssetPath('GK', 1, 'ally')).toBe('/assets/pieces/ally_gk_cost1.png');
  });

  it('enemy MF cost 3 (SS)', () => {
    expect(getPieceAssetPath('MF', 3, 'enemy')).toBe('/assets/pieces/enemy_mf_ss.png');
  });

  it('ally FW cost 1.5 → cost1plus', () => {
    expect(getPieceAssetPath('FW', 1.5, 'ally')).toBe('/assets/pieces/ally_fw_cost1plus.png');
  });

  it('enemy WG cost 2.5 → cost2plus', () => {
    expect(getPieceAssetPath('WG', 2.5, 'enemy')).toBe('/assets/pieces/enemy_wg_cost2plus.png');
  });

  it('ally DF cost 2', () => {
    expect(getPieceAssetPath('DF', 2, 'ally')).toBe('/assets/pieces/ally_df_cost2.png');
  });

  it('handles lowercase position input', () => {
    expect(getPieceAssetPath('gk', 1, 'ally')).toBe('/assets/pieces/ally_gk_cost1.png');
  });
});
