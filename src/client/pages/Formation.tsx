// ============================================================
// Formation.tsx — 編成画面 v2（formation-spec.md 準拠）
//
// 手持ちコマ（最大200個）からスタメン11枚+サブ9枚を編成。
// PieceIcon で統一表示。PC/スマホ レスポンシブ対応。
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import type { Page, FormationData } from '../types';
import type { Cost, Position } from '../components/board/PieceIcon';
import PieceIcon, { costToRank } from '../components/board/PieceIcon';
import { useDeviceType } from '../hooks/useDeviceType';

// ── 型定義 ─────────────────────────────────────────────────

interface OwnedPiece {
  id: string;
  position: Position;
  cost: Cost;
  name: string;
}

interface StarterPiece extends OwnedPiece {
  /** ピッチ上の配置位置（col, row） */
  col: number;
  row: number;
}

interface SaveSlot {
  systemBase: string;
  totalCost: number;
  starters: StarterPiece[];
  bench: OwnedPiece[];
}

/** 10スロット固定。null = 空スロット */
type SlotArray = (SaveSlot | null)[];

interface FormationProps {
  onNavigate: (page: Page) => void;
  /** 編成確定時のコールバック（スタメン・ベンチをApp.tsxへ引き渡す） */
  onFormationConfirm?: (data: FormationData) => void;
  /** 課金済みフラグ（セーブ機能の利用可否）。デフォルト true（テスト用） */
  isPremium?: boolean;
}

// ── 定数 ─────────────────────────────────────────────────

const MAX_FIELD_COST = 16;
const MAX_STARTERS = 11;
const MAX_BENCH = 9;
const MAX_SLOTS = 10;
const ALL_POSITIONS: Position[] = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];
const ALL_COSTS: Cost[] = [1, 1.5, 2, 2.5, 3];

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

// ── フォーメーションプリセット ───────────────────────────

interface PresetEntry { position: Position; col: number; row: number }

const PRESETS: Record<string, { label: string; entries: PresetEntry[] }> = {
  '4-4-2': {
    label: '4-4-2',
    entries: [
      { position: 'GK', col: 10, row: 1 },
      { position: 'DF', col: 7, row: 5 }, { position: 'DF', col: 13, row: 5 },
      { position: 'SB', col: 3, row: 6 }, { position: 'SB', col: 17, row: 6 },
      { position: 'VO', col: 7, row: 11 }, { position: 'VO', col: 13, row: 11 },
      { position: 'MF', col: 4, row: 14 }, { position: 'MF', col: 16, row: 14 },
      { position: 'FW', col: 8, row: 19 }, { position: 'FW', col: 12, row: 19 },
    ],
  },
  '3-5-2': {
    label: '3-5-2',
    entries: [
      { position: 'GK', col: 10, row: 1 },
      { position: 'DF', col: 6, row: 5 }, { position: 'DF', col: 10, row: 5 }, { position: 'DF', col: 14, row: 5 },
      { position: 'VO', col: 7, row: 10 }, { position: 'VO', col: 13, row: 10 },
      { position: 'MF', col: 4, row: 13 }, { position: 'MF', col: 16, row: 13 },
      { position: 'OM', col: 10, row: 15 },
      { position: 'FW', col: 8, row: 19 }, { position: 'FW', col: 12, row: 19 },
    ],
  },
  '3-6-1': {
    label: '3-6-1',
    // ライン構成: GK / DF×3 / SB×2+MF×1 / MF×1+OM×1 / WG×1 / FW×1
    entries: [
      { position: 'GK', col: 10, row: 1 },                                       // L1: GK
      { position: 'DF', col: 6, row: 4 }, { position: 'DF', col: 10, row: 4 }, { position: 'DF', col: 14, row: 4 }, // L2: 3バック
      { position: 'SB', col: 3, row: 8 }, { position: 'MF', col: 10, row: 8 }, { position: 'SB', col: 17, row: 8 }, // L3: WB両サイド+アンカー中央
      { position: 'MF', col: 7, row: 12 }, { position: 'OM', col: 13, row: 12 },  // L4: 中盤前方
      { position: 'WG', col: 4, row: 16 },                                        // L5: サイド前方
      { position: 'FW', col: 10, row: 19 },                                       // L6: 最前線
    ],
  },
  '4-3-3': {
    label: '4-3-3',
    entries: [
      { position: 'GK', col: 10, row: 1 },
      { position: 'DF', col: 7, row: 5 }, { position: 'DF', col: 13, row: 5 },
      { position: 'SB', col: 3, row: 6 }, { position: 'SB', col: 17, row: 6 },
      { position: 'VO', col: 10, row: 10 },
      { position: 'MF', col: 6, row: 13 }, { position: 'MF', col: 14, row: 13 },
      { position: 'WG', col: 4, row: 18 }, { position: 'WG', col: 16, row: 18 },
      { position: 'FW', col: 10, row: 19 },
    ],
  },
  '4-2-3-1': {
    label: '4-2-3-1',
    entries: [
      { position: 'GK', col: 10, row: 1 },
      { position: 'DF', col: 7, row: 5 }, { position: 'DF', col: 13, row: 5 },
      { position: 'SB', col: 3, row: 6 }, { position: 'SB', col: 17, row: 6 },
      { position: 'VO', col: 7, row: 10 }, { position: 'VO', col: 13, row: 10 },
      { position: 'OM', col: 3, row: 14 }, { position: 'OM', col: 17, row: 14 },
      { position: 'WG', col: 10, row: 15 },
      { position: 'FW', col: 10, row: 19 },
    ],
  },
  '3-4-3': {
    label: '3-4-3',
    entries: [
      { position: 'GK', col: 10, row: 1 },
      { position: 'DF', col: 6, row: 5 }, { position: 'DF', col: 10, row: 5 }, { position: 'DF', col: 14, row: 5 },
      { position: 'VO', col: 7, row: 10 }, { position: 'VO', col: 13, row: 10 },
      { position: 'MF', col: 4, row: 13 }, { position: 'MF', col: 16, row: 13 },
      { position: 'WG', col: 4, row: 18 }, { position: 'WG', col: 16, row: 18 },
      { position: 'FW', col: 10, row: 19 },
    ],
  },
};

// ── 初期コマ（新規ユーザー）──────────────────────────────

function createInitialOwned(): OwnedPiece[] {
  return [
    { id: 'own-gk-1', position: 'GK', cost: 1, name: 'GK' },
    { id: 'own-df-1', position: 'DF', cost: 1, name: 'CB 1' },
    { id: 'own-df-2', position: 'DF', cost: 1, name: 'CB 2' },
    { id: 'own-df-3', position: 'DF', cost: 1, name: 'SB左' },
    { id: 'own-df-4', position: 'DF', cost: 1, name: 'SB右' },
    { id: 'own-mf-1', position: 'MF', cost: 1, name: 'MF 1' },
    { id: 'own-mf-2', position: 'MF', cost: 1, name: 'MF 2' },
    { id: 'own-mf-3', position: 'MF', cost: 1, name: 'MF 3' },
    { id: 'own-mf-4', position: 'MF', cost: 1, name: 'MF 4' },
    { id: 'own-fw-1', position: 'FW', cost: 1, name: 'FW 1' },
    { id: 'own-fw-2', position: 'FW', cost: 1, name: 'FW 2' },
  ];
}

/** プリセットに基づいてスタメンを自動配置。手持ちコマからポジション一致→コスト低い順で割り当て */
function applyPreset(presetKey: string, owned: OwnedPiece[]): StarterPiece[] {
  const preset = PRESETS[presetKey];
  if (!preset) return [];

  const available = [...owned].sort((a, b) => a.cost - b.cost);
  const used = new Set<string>();
  const starters: StarterPiece[] = [];

  for (const entry of preset.entries) {
    // まずポジション一致で探す
    let pick = available.find(p => p.position === entry.position && !used.has(p.id));
    // なければ任意のコマで埋める
    if (!pick) pick = available.find(p => !used.has(p.id));
    if (!pick) continue;
    used.add(pick.id);
    starters.push({ ...pick, col: entry.col, row: entry.row });
  }
  return starters;
}

// ── メインコンポーネント ──────────────────────────────────

export default function Formation({ onNavigate, onFormationConfirm, isPremium = true }: FormationProps) {
  const device = useDeviceType();
  const isMobile = device === 'mobile' || device === 'tablet';

  // 手持ちコマ（本来はサーバーから取得）
  const [owned] = useState<OwnedPiece[]>(createInitialOwned);

  // スタメン・サブ
  const [starters, setStarters] = useState<StarterPiece[]>(() => applyPreset('4-4-2', createInitialOwned()));
  const [bench, setBench] = useState<OwnedPiece[]>([]);

  // UI state
  const [selectedStarterIdx, setSelectedStarterIdx] = useState<number | null>(null);
  const [selectedBenchIdx, setSelectedBenchIdx] = useState<number | null>(null);
  const [showCardGrid, setShowCardGrid] = useState(false);
  const [cardFilter, setCardFilter] = useState<Position | 'all'>('all');
  const [currentPreset, setCurrentPreset] = useState('4-4-2');

  // セーブスロット（1〜10 番号固定）
  const [slots, setSlots] = useState<SlotArray>(() => Array(MAX_SLOTS).fill(null));
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [premiumMessage, setPremiumMessage] = useState(false);

  // ── 計算値 ──

  const totalCost = useMemo(() => starters.reduce((s, p) => s + p.cost, 0), [starters]);
  const starterIds = useMemo(() => new Set(starters.map(s => s.id)), [starters]);
  const benchIds = useMemo(() => new Set(bench.map(b => b.id)), [bench]);
  const usedIds = useMemo(() => new Set([...starterIds, ...benchIds]), [starterIds, benchIds]);
  const hasGK = useMemo(() => starters.some(s => s.position === 'GK'), [starters]);
  const isValid = totalCost <= MAX_FIELD_COST && starters.length === MAX_STARTERS && hasGK;

  const selectedStarter = selectedStarterIdx !== null ? starters[selectedStarterIdx] : null;

  // ── フィルタ済み手持ちコマ ──

  const filteredOwned = useMemo(() => {
    let list = owned;
    if (cardFilter !== 'all') {
      list = list.filter(p => p.position === cardFilter);
    }
    return [...list].sort((a, b) => a.cost - b.cost);
  }, [owned, cardFilter]);

  // ── ハンドラー ──

  const handleStarterClick = useCallback((idx: number) => {
    if (selectedStarterIdx === idx) {
      setSelectedStarterIdx(null);
      setShowCardGrid(false);
    } else {
      setSelectedStarterIdx(idx);
      setSelectedBenchIdx(null);
    }
  }, [selectedStarterIdx]);

  const handleBenchClick = useCallback((idx: number) => {
    if (selectedBenchIdx === idx) {
      setSelectedBenchIdx(null);
      setShowCardGrid(false);
    } else {
      setSelectedBenchIdx(idx);
      setSelectedStarterIdx(null);
    }
  }, [selectedBenchIdx]);

  const handleSwapAction = useCallback(() => {
    setShowCardGrid(true);
    setCardFilter('all');
  }, []);

  const handleCardSelect = useCallback((piece: OwnedPiece) => {
    if (usedIds.has(piece.id)) return;

    if (selectedStarterIdx !== null) {
      // スタメン入れ替え: コスト超過チェック
      const current = starters[selectedStarterIdx];
      const newTotal = totalCost - current.cost + piece.cost;
      if (newTotal > MAX_FIELD_COST) return;

      setStarters(prev => {
        const updated = [...prev];
        updated[selectedStarterIdx] = {
          ...piece,
          col: current.col,
          row: current.row,
        };
        return updated;
      });
    } else if (selectedBenchIdx !== null) {
      // サブ入れ替え
      setBench(prev => {
        const updated = [...prev];
        updated[selectedBenchIdx] = piece;
        return updated;
      });
    } else if (bench.length < MAX_BENCH) {
      // サブに追加
      setBench(prev => [...prev, piece]);
    }

    setShowCardGrid(false);
    setSelectedStarterIdx(null);
    setSelectedBenchIdx(null);
  }, [selectedStarterIdx, selectedBenchIdx, starters, bench, totalCost, usedIds]);

  const handleAddBench = useCallback(() => {
    if (bench.length >= MAX_BENCH) return;
    setSelectedStarterIdx(null);
    setSelectedBenchIdx(null);
    setShowCardGrid(true);
    setCardFilter('all');
  }, [bench.length]);

  /** ピッチ上の空きHEXタップ → 選択中コマをそこに移動 */
  const handlePitchTap = useCallback((col: number, row: number) => {
    if (selectedStarterIdx === null) return;
    // 他のコマと重複チェック
    const occupied = starters.some((s, i) => i !== selectedStarterIdx && s.col === col && s.row === row);
    if (occupied) return;
    setStarters(prev => {
      const updated = [...prev];
      updated[selectedStarterIdx] = { ...updated[selectedStarterIdx], col, row };
      return updated;
    });
    // 選択状態を維持（続けて微調整可能）
  }, [selectedStarterIdx, starters]);

  const handlePresetChange = useCallback((key: string) => {
    setCurrentPreset(key);
    setStarters(applyPreset(key, owned));
    setBench([]);
    setSelectedStarterIdx(null);
    setShowCardGrid(false);
  }, [owned]);

  // ── セーブスロット ──

  const handleOpenSlots = useCallback(() => {
    if (!isPremium) {
      setPremiumMessage(true);
      setTimeout(() => setPremiumMessage(false), 2500);
      return;
    }
    setShowSlotModal(true);
  }, [isPremium]);

  const handleSaveSlot = useCallback((idx: number) => {
    setSlots(prev => {
      const updated = [...prev];
      updated[idx] = {
        systemBase: currentPreset,
        totalCost,
        starters: [...starters],
        bench: [...bench],
      };
      return updated;
    });
    setActiveSlotIdx(idx);
  }, [currentPreset, totalCost, starters, bench]);

  const handleLoadSlot = useCallback((idx: number) => {
    const slot = slots[idx];
    if (!slot) return;
    setStarters(slot.starters);
    setBench(slot.bench);
    setCurrentPreset(slot.systemBase);
    setActiveSlotIdx(idx);
    setSelectedStarterIdx(null);
    setShowCardGrid(false);
  }, [slots]);

  const handleDeleteSlot = useCallback((idx: number) => {
    setSlots(prev => {
      const updated = [...prev];
      updated[idx] = null;
      return updated;
    });
    if (activeSlotIdx === idx) setActiveSlotIdx(null);
  }, [activeSlotIdx]);

  // ── レンダリング ──

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0' }}>
      {/* ═══ ヘッダー ═══ */}
      <Header
        totalCost={totalCost}
        starterCount={starters.length}
        benchCount={bench.length}
        hasGK={hasGK}
        currentPreset={currentPreset}
        onPresetChange={handlePresetChange}
        onShowSlots={handleOpenSlots}
        onBack={() => onNavigate('teamSelect')}
        isPremium={isPremium}
        premiumMessage={premiumMessage}
      />

      {/* ═══ メインエリア ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>
        {/* ── ピッチ（スタメン一覧） ── */}
        <div style={{ flex: isMobile ? 'none' : 1, height: isMobile ? '45%' : '100%', overflow: 'auto', padding: 12 }}>
          <PitchView
            starters={starters}
            selectedIdx={selectedStarterIdx}
            onSelect={handleStarterClick}
            onPitchTap={handlePitchTap}
          />
        </div>

        {/* ── 操作パネル ── */}
        <div style={{
          flex: isMobile ? 1 : '0 0 380px',
          display: 'flex', flexDirection: 'column',
          borderLeft: isMobile ? 'none' : '1px solid rgba(255,255,255,0.08)',
          borderTop: isMobile ? '1px solid rgba(255,255,255,0.08)' : 'none',
          overflow: 'hidden',
        }}>
          {showCardGrid ? (
            <CardGrid
              pieces={filteredOwned}
              usedIds={usedIds}
              totalCost={totalCost}
              selectedStarterCost={selectedStarter?.cost ?? null}
              cardFilter={cardFilter}
              onFilterChange={setCardFilter}
              onSelect={handleCardSelect}
              onClose={() => { setShowCardGrid(false); setSelectedStarterIdx(null); setSelectedBenchIdx(null); }}
            />
          ) : selectedStarter ? (
            <DetailPanel
              piece={selectedStarter}
              onSwap={handleSwapAction}
              onDeselect={() => setSelectedStarterIdx(null)}
            />
          ) : (
            <BenchPanel
              bench={bench}
              selectedIdx={selectedBenchIdx}
              onSelect={handleBenchClick}
              onAdd={handleAddBench}
              onSwap={() => { if (selectedBenchIdx !== null) handleSwapAction(); }}
            />
          )}
        </div>
      </div>

      {/* ═══ フッター ═══ */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', justifyContent: 'center' }}>
        <button onClick={() => onNavigate('teamSelect')} style={btnStyle('#334155')}>戻る</button>
        <button
          onClick={() => {
            if (onFormationConfirm) {
              onFormationConfirm({
                starters: starters.map(s => ({
                  id: s.id, position: s.position, cost: s.cost, col: s.col, row: s.row,
                })),
                bench: bench.map(b => ({
                  id: b.id, position: b.position, cost: b.cost, col: 0, row: 0,
                })),
              });
            } else {
              onNavigate('matching');
            }
          }}
          disabled={!isValid}
          style={btnStyle(isValid ? '#16a34a' : '#334155', !isValid ? 0.5 : 1)}
        >
          マッチング開始
        </button>
      </div>

      {/* ═══ セーブスロットモーダル ═══ */}
      {showSlotModal && (
        <SlotModal
          slots={slots}
          activeSlotIdx={activeSlotIdx}
          onSave={handleSaveSlot}
          onLoad={handleLoadSlot}
          onDelete={handleDeleteSlot}
          onClose={() => setShowSlotModal(false)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// サブコンポーネント
// ══════════════════════════════════════════════════════════

// ── ヘッダー ──

function Header({ totalCost, starterCount, benchCount, hasGK, currentPreset, onPresetChange, onShowSlots, onBack, isPremium, premiumMessage }: {
  totalCost: number; starterCount: number; benchCount: number; hasGK: boolean;
  currentPreset: string; onPresetChange: (k: string) => void; onShowSlots: () => void; onBack: () => void;
  isPremium: boolean; premiumMessage: boolean;
}) {
  const costOver = totalCost > MAX_FIELD_COST;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>編成</h2>

      {/* ステータスバッジ */}
      <span style={{ fontSize: 13, color: costOver ? '#ef4444' : '#4ade80', fontWeight: 600 }}>
        コスト: {totalCost}/{MAX_FIELD_COST}
      </span>
      <span style={{ fontSize: 13, color: '#94a3b8' }}>スタメン: {starterCount}/{MAX_STARTERS}</span>
      <span style={{ fontSize: 13, color: '#94a3b8' }}>サブ: {benchCount}/{MAX_BENCH}</span>
      {!hasGK && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>GK未配置</span>}

      <div style={{ flex: 1 }} />

      {/* プリセット選択 */}
      <select
        value={currentPreset}
        onChange={e => onPresetChange(e.target.value)}
        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: '#1e293b', color: '#e2e8f0', fontSize: 13 }}
      >
        {Object.entries(PRESETS).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>

      {/* セーブスロット + Premium バッジ */}
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <button onClick={onShowSlots} style={{ ...btnStyle('#334155'), padding: '4px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span role="img" aria-label="premium">{isPremium ? '\u{1F451}' : '\u{1F512}'}</span>
          セーブ/ロード
        </button>
        {!isPremium && (
          <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, background: 'rgba(245,158,11,0.15)', padding: '1px 6px', borderRadius: 4 }}>
            Premium
          </span>
        )}
        {premiumMessage && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: '#1e293b', border: '1px solid #f59e0b', borderRadius: 8,
            padding: '8px 14px', fontSize: 12, color: '#f59e0b', whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)', zIndex: 50,
          }}>
            {'\u{1F512}'} プレミアム機能です
          </div>
        )}
      </div>
    </div>
  );
}

// ── ピッチビュー（HEXボード上にフォーメーション表示） ──

/** HEX座標 → ミニピッチ上のパーセント位置（Y反転: GK が下、FW が上） */
function hexToPercent(col: number, row: number): { left: number; top: number } {
  const HEX_DX = 45;
  const HEX_DY = 51.96;
  const ODD_Y = 25.98;
  // フォーメーション使用範囲: col 0-21, row 0-20
  const MAX_X = 21 * HEX_DX; // 945
  const MAX_Y = 20 * HEX_DY + ODD_Y; // 1065.18

  const x = col * HEX_DX;
  const y = row * HEX_DY + (col % 2 === 1 ? ODD_Y : 0);
  const PAD = 7; // 7% padding
  return {
    left: PAD + (x / MAX_X) * (100 - 2 * PAD),
    top: PAD + ((MAX_Y - y) / MAX_Y) * (100 - 2 * PAD),
  };
}

/** パーセント位置 → 最寄りHEX座標にスナップ（hexToPercent の逆変換） */
function percentToHex(leftPct: number, topPct: number): { col: number; row: number } {
  const HEX_DX = 45;
  const HEX_DY = 51.96;
  const ODD_Y = 25.98;
  const MAX_X = 21 * HEX_DX;
  const MAX_Y = 20 * HEX_DY + ODD_Y;
  const PAD = 7;

  const xNorm = (leftPct - PAD) / (100 - 2 * PAD);
  const yNorm = (topPct - PAD) / (100 - 2 * PAD);
  const px = xNorm * MAX_X;
  const py = MAX_Y - yNorm * MAX_Y;

  // 最寄りHEXを総当たりで探索（col 0-21, row 0-20）
  let bestCol = 10, bestRow = 10, bestDist = Infinity;
  for (let c = 0; c <= 21; c++) {
    for (let r = 0; r <= 20; r++) {
      const hx = c * HEX_DX;
      const hy = r * HEX_DY + (c % 2 === 1 ? ODD_Y : 0);
      const dist = (hx - px) ** 2 + (hy - py) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = c;
        bestRow = r;
      }
    }
  }
  return { col: bestCol, row: bestRow };
}

function PitchView({ starters, selectedIdx, onSelect, onPitchTap }: {
  starters: StarterPiece[]; selectedIdx: number | null; onSelect: (i: number) => void;
  onPitchTap: (col: number, row: number) => void;
}) {
  /** ピッチ背景クリック → クリック位置をHEX座標に変換して移動 */
  const handleBgClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (selectedIdx === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const leftPct = ((e.clientX - rect.left) / rect.width) * 100;
    const topPct = ((e.clientY - rect.top) / rect.height) * 100;
    const hex = percentToHex(leftPct, topPct);
    onPitchTap(hex.col, hex.row);
  }, [selectedIdx, onPitchTap]);

  return (
    <div
      onClick={handleBgClick}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 320,
        background: 'linear-gradient(180deg, #2d5a27 0%, #3a7a30 30%, #3a7a30 70%, #2d5a27 100%)',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: selectedIdx !== null ? 'crosshair' : 'default',
      }}
    >
      {/* ── ピッチマーキング ── */}
      {/* 外枠 */}
      <div style={{
        position: 'absolute', left: '5%', right: '5%', top: '3%', bottom: '3%',
        border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4, pointerEvents: 'none',
      }} />
      {/* センターライン */}
      <div style={{
        position: 'absolute', left: '5%', right: '5%', top: '50%',
        height: 0, borderTop: '1px solid rgba(255,255,255,0.2)', pointerEvents: 'none',
      }} />
      {/* センターサークル */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: 60, height: 60, borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.2)',
        transform: 'translate(-50%, -50%)', pointerEvents: 'none',
      }} />
      {/* ゴールエリア（下 = 自陣） */}
      <div style={{
        position: 'absolute', left: '30%', right: '30%', bottom: '3%',
        height: '8%',
        border: '1px solid rgba(255,255,255,0.2)', borderBottom: 'none', pointerEvents: 'none',
      }} />
      {/* ゴールエリア（上 = 敵陣） */}
      <div style={{
        position: 'absolute', left: '30%', right: '30%', top: '3%',
        height: '8%',
        border: '1px solid rgba(255,255,255,0.2)', borderTop: 'none', pointerEvents: 'none',
      }} />
      {/* 攻撃方向矢印（上向き） */}
      <div style={{
        position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
        fontSize: 10, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', pointerEvents: 'none',
      }}>
        ▲ 攻撃方向
      </div>
      {/* 選択中ヒント */}
      {selectedIdx !== null && (
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          fontSize: 10, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          ピッチをタップして配置移動
        </div>
      )}

      {/* ── コマ配置 ── */}
      {starters.map((piece, i) => {
        const pos = hexToPercent(piece.col, piece.row);
        const isSelected = selectedIdx === i;
        return (
          <div
            key={piece.id + '-' + i}
            onClick={(e) => { e.stopPropagation(); onSelect(i); }}
            style={{
              position: 'absolute',
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              transform: 'translate(-50%, -50%)',
              cursor: 'pointer',
              zIndex: isSelected ? 10 : 1,
              transition: 'left 0.3s ease, top 0.3s ease',
            }}
          >
            <PieceIcon
              cost={piece.cost}
              position={piece.position}
              side="ally"
              selected={isSelected}
              style={{ width: 38, height: 38 }}
            />
            <div style={{
              textAlign: 'center', fontSize: 9, fontWeight: 600,
              color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              marginTop: -2, whiteSpace: 'nowrap', lineHeight: 1,
            }}>
              {piece.position}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 詳細パネル（選択中コマ） ──

function DetailPanel({ piece, onSwap, onDeselect }: {
  piece: StarterPiece; onSwap: () => void; onDeselect: () => void;
}) {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* 顔イラスト用プレースホルダー */}
      <div style={{
        width: 120, height: 120, borderRadius: 16, background: 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 12,
      }}>
        顔イラスト
      </div>

      <PieceIcon cost={piece.cost} position={piece.position} side="ally" selected />

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{piece.name}</div>
        <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>
          {piece.position} ・ コスト {piece.cost} ({costToRank(piece.cost)})
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
          {COST_LABELS[piece.position]?.[piece.cost] ?? ''}
        </div>
      </div>

      {/* 背景テキスト用プレースホルダー */}
      <div style={{
        width: '100%', padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)',
        fontSize: 12, color: '#64748b', lineHeight: 1.6,
      }}>
        キャラクター背景テキスト（未実装）
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <button onClick={onSwap} style={{ ...btnStyle('#2563eb'), flex: 1 }}>入れ替え</button>
        <button onClick={onDeselect} style={{ ...btnStyle('#334155'), flex: 1 }}>戻る</button>
      </div>
    </div>
  );
}

// ── ベンチパネル ──

function BenchPanel({ bench, selectedIdx, onSelect, onAdd, onSwap }: {
  bench: OwnedPiece[]; selectedIdx: number | null;
  onSelect: (i: number) => void; onAdd: () => void; onSwap: () => void;
}) {
  return (
    <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
        サブ（ベンチ） {bench.length}/{MAX_BENCH}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {bench.map((piece, i) => {
          const isSelected = selectedIdx === i;
          return (
            <div
              key={piece.id + '-bench-' + i}
              onClick={() => onSelect(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                background: isSelected ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.02)',
                border: isSelected ? '1px solid rgba(250,204,21,0.4)' : '1px solid transparent',
              }}
            >
              <span style={{ width: 22, fontSize: 12, color: '#64748b', textAlign: 'right' }}>B{i + 1}</span>
              <PieceIcon cost={piece.cost} position={piece.position} side="ally" style={{ width: 36, height: 36, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13 }}>
                {piece.name}
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>{piece.position} {costToRank(piece.cost)}</span>
              </div>
            </div>
          );
        })}

        {bench.length < MAX_BENCH && (
          <button onClick={onAdd} style={{ ...btnStyle('#1e293b'), marginTop: 4, border: '1px dashed rgba(255,255,255,0.15)', fontSize: 13 }}>
            + サブを追加
          </button>
        )}

        {selectedIdx !== null && (
          <button onClick={onSwap} style={{ ...btnStyle('#2563eb'), marginTop: 8, fontSize: 13 }}>
            入れ替え
          </button>
        )}
      </div>
    </div>
  );
}

// ── カードグリッド（手持ちコマ一覧） ──

function CardGrid({ pieces, usedIds, totalCost, selectedStarterCost, cardFilter, onFilterChange, onSelect, onClose }: {
  pieces: OwnedPiece[]; usedIds: Set<string>; totalCost: number;
  selectedStarterCost: Cost | null; cardFilter: Position | 'all';
  onFilterChange: (f: Position | 'all') => void; onSelect: (p: OwnedPiece) => void; onClose: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* フィルタータブ */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <FilterBtn label="全部" active={cardFilter === 'all'} onClick={() => onFilterChange('all')} />
        {ALL_POSITIONS.map(pos => (
          <FilterBtn key={pos} label={pos} active={cardFilter === pos} onClick={() => onFilterChange(pos)} />
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
          閉じる
        </button>
      </div>

      {/* グリッド */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, alignContent: 'start' }}>
        {pieces.map(piece => {
          const isUsed = usedIds.has(piece.id);
          const wouldExceed = selectedStarterCost !== null
            ? (totalCost - selectedStarterCost + piece.cost) > MAX_FIELD_COST
            : piece.cost + totalCost > MAX_FIELD_COST;
          const disabled = isUsed || wouldExceed;

          return (
            <div
              key={piece.id}
              onClick={() => !disabled && onSelect(piece)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '10px 8px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
                background: disabled ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                opacity: isUsed ? 0.4 : wouldExceed ? 0.5 : 1,
                transition: 'background 0.15s',
              }}
            >
              {/* 顔イラスト用プレースホルダー */}
              <div style={{
                width: 48, height: 48, borderRadius: 8, background: 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#475569',
              }}>
                顔
              </div>

              <PieceIcon cost={piece.cost} position={piece.position} side="ally" style={{ width: 36, height: 36 }} />

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                  {piece.name}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>{piece.position} {costToRank(piece.cost)}</div>
              </div>

              {isUsed && <span style={{ fontSize: 10, color: '#94a3b8' }}>使用中</span>}
              {!isUsed && wouldExceed && <span style={{ fontSize: 10, color: '#ef4444' }}>超過</span>}
            </div>
          );
        })}

        {pieces.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 24, color: '#64748b', fontSize: 13 }}>
            該当するコマがありません
          </div>
        )}
      </div>
    </div>
  );
}

// ── フィルターボタン ──

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: active ? 700 : 400,
        background: active ? '#2563eb' : 'rgba(255,255,255,0.05)',
        color: active ? '#fff' : '#94a3b8',
        border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ── セーブスロットモーダル ──

function SlotModal({ slots, activeSlotIdx, onSave, onLoad, onDelete, onClose }: {
  slots: SlotArray; activeSlotIdx: number | null;
  onSave: (idx: number) => void; onLoad: (idx: number) => void;
  onDelete: (idx: number) => void; onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        background: '#1e293b', borderRadius: 16, padding: 24, zIndex: 101,
        minWidth: 320, maxWidth: 420, maxHeight: '80vh', overflow: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          {'\u{1F451}'} セーブスロット
          <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, background: 'rgba(245,158,11,0.15)', padding: '2px 8px', borderRadius: 4, marginLeft: 4 }}>
            Premium
          </span>
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slots.map((slot, idx) => {
            const isActive = activeSlotIdx === idx;
            const isEmpty = slot === null;
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
                background: isActive ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.03)',
                border: isActive ? '1px solid rgba(37,99,235,0.3)' : '1px solid rgba(255,255,255,0.06)',
              }}>
                {/* スロット番号 */}
                <span style={{ width: 28, fontSize: 13, fontWeight: 700, color: '#64748b', textAlign: 'center', flexShrink: 0 }}>
                  {idx + 1}
                </span>

                {/* スロット情報 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEmpty ? (
                    <span style={{ fontSize: 13, color: '#475569' }}>空</span>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>スロット {idx + 1}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {slot.systemBase} ・ コスト {slot.totalCost}/{MAX_FIELD_COST}
                      </div>
                    </>
                  )}
                </div>

                {/* アクションボタン */}
                <button
                  onClick={() => onSave(idx)}
                  style={{ ...btnStyle('#16a34a'), padding: '3px 8px', fontSize: 11 }}
                >
                  保存
                </button>
                {!isEmpty && (
                  <>
                    <button
                      onClick={() => onLoad(idx)}
                      style={{ ...btnStyle('#2563eb'), padding: '3px 8px', fontSize: 11 }}
                    >
                      読込
                    </button>
                    <button
                      onClick={() => onDelete(idx)}
                      style={{ ...btnStyle('#dc2626'), padding: '3px 8px', fontSize: 11 }}
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onClose} style={{ ...btnStyle('#334155'), width: '100%', marginTop: 16, fontSize: 13 }}>閉じる</button>
      </div>
    </>
  );
}

// ── ユーティリティ ──

function btnStyle(bg: string, opacity = 1): React.CSSProperties {
  return {
    padding: '8px 20px', borderRadius: 8, border: 'none',
    background: bg, color: '#e2e8f0', fontSize: 14, fontWeight: 600,
    cursor: opacity < 1 ? 'default' : 'pointer', opacity,
  };
}
