// ============================================================
// Formation.tsx — フォーメーション設定
// デフォルト総コスト16以内。選手クリックで同ポジション別コマに入替可能。
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import type { Page, Cost, Position } from '../types';
import { POSITION_COLORS } from '../types';
import PieceIcon from '../components/board/PieceIcon';
import type { Cost as PICost, Position as PIPosition } from '../components/board/PieceIcon';

interface FormationProps {
  onNavigate: (page: Page) => void;
}

interface FormationPiece {
  id: string;
  position: Position;
  cost: Cost;
  coord: { col: number; row: number };
}

/** 各ポジションの利用可能なコスト一覧（docs/piece_allocation.md v2 §1: 全ポジション5段階） */
const ALL_COSTS: Cost[] = [1, 1.5, 2, 2.5, 3];
const AVAILABLE_COSTS: Record<Position, Cost[]> = {
  GK: ALL_COSTS,
  DF: ALL_COSTS,
  SB: ALL_COSTS,
  VO: ALL_COSTS,
  MF: ALL_COSTS,
  OM: ALL_COSTS,
  WG: ALL_COSTS,
  FW: ALL_COSTS,
};

/** コスト別の役割名（piece_allocation.md v2 §2） */
const COST_LABELS: Record<Position, Record<number, string>> = {
  GK: { 1: '控えGK', 1.5: '堅実なGK', 2: 'レギュラーGK', 2.5: '名手GK', 3: '守護神' },
  DF: { 1: 'ローテ要員', 1.5: '準レギュラーCB', 2: '主力CB', 2.5: '鉄壁CB', 3: 'リベロ' },
  SB: { 1: '控えSB', 1.5: '堅実なSB', 2: '攻撃参加SB', 2.5: '攻守兼備SB', 3: '攻撃的SB' },
  VO: { 1: '守備専門', 1.5: '堅実なVO', 2: '攻守兼備', 2.5: '司令塔VO', 3: 'アンカー' },
  MF: { 1: 'ローテ要員', 1.5: 'パス精度型', 2: '司令塔', 2.5: 'ゲームメーカー', 3: 'マエストロ' },
  OM: { 1: '控えトップ下', 1.5: '堅実なOM', 2: '攻撃の核', 2.5: 'エース10番', 3: 'ファンタジスタ' },
  WG: { 1: '控えWG', 1.5: 'スピード型', 2: 'バランス型', 2.5: 'テクニカル', 3: 'ドリブラー' },
  FW: { 1: '控えFW', 1.5: 'ポスト型', 2: 'レギュラーFW', 2.5: 'エースFW', 3: '点取り屋' },
};

const MAX_FIELD_COST = 16;

/** デフォルトフォーメーション（4-4-2 / 総コスト16.0） */
// GK1 + DF1+1.5 + SB1+1 + VO1 + MF1+1 + OM2 + WG1.5 + FW2.5 = 16.0
const DEFAULT_FORMATION: FormationPiece[] = [
  { id: 'p01', position: 'GK', cost: 1,   coord: { col: 10, row: 1 } },
  { id: 'p02', position: 'DF', cost: 1,   coord: { col: 7,  row: 5 } },
  { id: 'p03', position: 'DF', cost: 1.5, coord: { col: 13, row: 5 } },
  { id: 'p04', position: 'SB', cost: 1,   coord: { col: 4,  row: 6 } },
  { id: 'p05', position: 'SB', cost: 1,   coord: { col: 16, row: 6 } },
  { id: 'p06', position: 'VO', cost: 1,   coord: { col: 10, row: 9 } },
  { id: 'p07', position: 'MF', cost: 1,   coord: { col: 7,  row: 12 } },
  { id: 'p08', position: 'MF', cost: 1,   coord: { col: 13, row: 12 } },
  { id: 'p09', position: 'OM', cost: 2,   coord: { col: 10, row: 15 } },
  { id: 'p10', position: 'WG', cost: 1.5, coord: { col: 4,  row: 17 } },
  { id: 'p11', position: 'FW', cost: 2.5, coord: { col: 10, row: 19 } },
];

export default function Formation({ onNavigate }: FormationProps) {
  const [formation, setFormation] = useState<FormationPiece[]>(DEFAULT_FORMATION);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const totalCost = useMemo(
    () => formation.reduce((s, p) => s + p.cost, 0),
    [formation],
  );

  // 選手クリック → モーダル表示
  const handlePieceClick = useCallback((index: number) => {
    const piece = formation[index];
    // 選択肢が1つしかないポジション（FW）はモーダル不要
    if (AVAILABLE_COSTS[piece.position].length <= 1) return;
    setEditingIndex(index);
  }, [formation]);

  // コスト変更
  const handleCostChange = useCallback((newCost: Cost) => {
    if (editingIndex === null) return;

    setFormation((prev) => {
      const updated = [...prev];
      updated[editingIndex] = { ...updated[editingIndex], cost: newCost };
      return updated;
    });
    setEditingIndex(null);
  }, [editingIndex]);

  // 編集中の選手情報
  const editingPiece = editingIndex !== null ? formation[editingIndex] : null;

  // 各コスト候補について、選択後の総コストが16以内かチェック
  const getCostAfterChange = useCallback(
    (newCost: Cost): number => {
      if (editingIndex === null) return totalCost;
      const currentPieceCost = formation[editingIndex].cost;
      return totalCost - currentPieceCost + newCost;
    },
    [editingIndex, formation, totalCost],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        gap: 16,
        padding: 20,
        overflow: 'auto',
        position: 'relative',
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>フォーメーション</h2>

      <div style={{ fontSize: 14, color: '#aaa' }}>
        総コスト:{' '}
        <span style={{ color: totalCost > MAX_FIELD_COST ? '#ff4444' : '#6c6', fontWeight: 'bold' }}>
          {totalCost}
        </span>{' '}
        / {MAX_FIELD_COST}
      </div>

      {/* コマ一覧 */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        {formation.map((piece, i) => {
          const hasOptions = AVAILABLE_COSTS[piece.position].length > 1;
          const isEditing = editingIndex === i;
          return (
            <div
              key={piece.id}
              onClick={() => handlePieceClick(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                cursor: hasOptions ? 'pointer' : 'default',
                background: isEditing ? 'rgba(255,215,0,0.1)' : 'transparent',
                borderLeft: isEditing ? '3px solid #ffd700' : '3px solid transparent',
                borderRadius: 4,
                transition: 'background 0.15s',
              }}
            >
              <span style={{ width: 24, fontSize: 13, color: '#888' }}>{i + 1}.</span>
              <PieceIcon
                cost={piece.cost as PICost}
                position={piece.position as PIPosition}
                side="ally"
                style={{ width: 36, height: 36, flexShrink: 0 }}
              />
              <span style={{ flex: 1, fontSize: 12, color: '#777', marginLeft: 4 }}>
                {COST_LABELS[piece.position]?.[piece.cost] ?? ''}
              </span>
              {hasOptions && (
                <span style={{ fontSize: 11, color: '#555' }}>変更</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ボタン */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          onClick={() => onNavigate('teamSelect')}
          style={{
            padding: '10px 24px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            color: '#888',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          戻る
        </button>
        <button
          onClick={() => onNavigate('matching')}
          disabled={totalCost > MAX_FIELD_COST}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: totalCost <= MAX_FIELD_COST ? '#44aa44' : '#333',
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: totalCost <= MAX_FIELD_COST ? 'pointer' : 'default',
          }}
        >
          マッチング開始
        </button>
      </div>

      {/* ── 選手入替モーダル ── */}
      {editingPiece && editingIndex !== null && (
        <>
          {/* オーバーレイ */}
          <div
            onClick={() => setEditingIndex(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 100,
            }}
          />
          {/* モーダル本体 */}
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(30, 30, 50, 0.98)',
              borderRadius: 16,
              padding: 24,
              zIndex: 101,
              minWidth: 280,
              maxWidth: 340,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            {/* ヘッダー */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ margin: '0 auto 8px', width: 48, height: 48, display: 'flex', justifyContent: 'center' }}>
                <PieceIcon
                  cost={editingPiece.cost as PICost}
                  position={editingPiece.position as PIPosition}
                  side="ally"
                  style={{ width: 48, height: 48 }}
                />
              </div>
              <div style={{ fontSize: 16, fontWeight: 'bold' }}>
                {editingPiece.position} を入れ替え
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                現在: ★{editingPiece.cost} ({COST_LABELS[editingPiece.position]?.[editingPiece.cost] ?? ''})
              </div>
            </div>

            {/* コスト選択肢 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {AVAILABLE_COSTS[editingPiece.position].map((cost) => {
                const costAfter = getCostAfterChange(cost);
                const isOverBudget = costAfter > MAX_FIELD_COST;
                const isCurrent = cost === editingPiece.cost;
                const label = COST_LABELS[editingPiece.position]?.[cost] ?? '';

                return (
                  <button
                    key={cost}
                    onClick={() => !isOverBudget && handleCostChange(cost)}
                    disabled={isOverBudget}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: 10,
                      border: isCurrent
                        ? '2px solid #ffd700'
                        : isOverBudget
                        ? '1px solid rgba(255,255,255,0.05)'
                        : '1px solid rgba(255,255,255,0.15)',
                      background: isCurrent
                        ? 'rgba(255,215,0,0.1)'
                        : isOverBudget
                        ? 'rgba(255,255,255,0.02)'
                        : 'rgba(255,255,255,0.05)',
                      color: isOverBudget ? '#555' : '#fff',
                      cursor: isOverBudget ? 'default' : 'pointer',
                      fontSize: 14,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div>
                      <span style={{ color: isOverBudget ? '#555' : '#ffd700', fontWeight: 'bold' }}>
                        ★{cost}
                      </span>
                      <span style={{ marginLeft: 8, color: isOverBudget ? '#444' : '#aaa' }}>
                        {label}
                      </span>
                      {isCurrent && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#ffd700' }}>現在</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: isOverBudget ? '#ff4444' : '#888' }}>
                      {isOverBudget
                        ? `超過 (${costAfter})`
                        : `計 ${costAfter}`}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 閉じるボタン */}
            <button
              onClick={() => setEditingIndex(null)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 16,
                padding: '10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent',
                color: '#888',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              キャンセル
            </button>
          </div>
        </>
      )}
    </div>
  );
}
