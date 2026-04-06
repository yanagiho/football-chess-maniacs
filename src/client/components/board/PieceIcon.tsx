/**
 * PieceIcon.tsx — Football Chess ManiacS コマアイコンコンポーネント
 * ui_spec.md v1.2 §6-1 準拠
 *
 * 使い方:
 *   <PieceIcon cost={2} position="DF" side="ally" />
 *   <PieceIcon cost={3} position="FW" side="enemy" selected hasBall />
 */

import { memo } from "react";

// ── 型定義 ──────────────────────────────────────────────
export type Position = "GK" | "DF" | "SB" | "VO" | "MF" | "OM" | "WG" | "FW";
export type Cost = 1 | 1.5 | 2 | 2.5 | 3;
export type Side = "ally" | "enemy";

export interface PieceIconProps {
  cost: Cost;
  position: Position;
  side: Side;
  selected?: boolean;
  hasBall?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

// ── 定数 ─────────────────────────────────────────────────
const ALLY_COLOR = "#2563EB";
const ENEMY_COLOR = "#DC2626";
const SELECTED_RING_COLOR = "#FACC15";

type BorderType = "none" | "bronze" | "silver" | "gold" | "goldLarge";

interface CostConfig {
  rank: string;
  border: BorderType;
  size: number;
}

const COST_CONFIG: Record<number, CostConfig> = {
  1:   { rank: "1",  border: "none",      size: 64 },
  1.5: { rank: "1+", border: "bronze",    size: 64 },
  2:   { rank: "2",  border: "silver",    size: 64 },
  2.5: { rank: "2+", border: "gold",      size: 64 },
  3:   { rank: "SS", border: "goldLarge", size: 72 },
};

const BORDER_COLORS: Record<BorderType, string | null> = {
  none:      null,
  bronze:    "#CD7F32",
  silver:    "#C0C0C0",
  gold:      "#FFD700",
  goldLarge: "#FFD700",
};

// ── コンポーネント ────────────────────────────────────────
const PieceIcon = memo(function PieceIcon({
  cost,
  position,
  side,
  selected = false,
  hasBall = false,
  onClick,
  className,
  style,
}: PieceIconProps) {
  const config = COST_CONFIG[cost];
  if (!config) return null;

  const { rank, border, size } = config;
  const bg = side === "ally" ? ALLY_COLOR : ENEMY_COLOR;
  const borderColor = BORDER_COLORS[border];

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const borderWidth = border === "goldLarge" ? 5 : 3.5;
  const innerR = outerR - (borderColor ? borderWidth / 2 + 1 : 0);

  // ランク文字サイズ
  const fontSize = rank === "SS" ? Math.round(size * 0.44) : Math.round(size * 0.38);
  const textY = cy + fontSize * 0.35;

  // ポジションバッジ
  const badgeW = position.length > 2 ? 20 : 16;
  const badgeH = 12;
  const badgeX = size - 4 - badgeW;
  const badgeY = 4;

  // ボールアイコン位置
  const ballCx = size - 8;
  const ballCy = size - 8;
  const ballR = 10;
  const pentagons = Array.from({ length: 5 }, (_, i) => {
    const a = ((i * 72 - 90) * Math.PI) / 180;
    return { x: ballCx + 5 * Math.cos(a), y: ballCy + 5 * Math.sin(a) };
  });

  // SS 金枠の装飾ポイント（上下左右のダイヤ型）
  const sparklePoints = [
    [cx, 5],
    [size - 5, cy],
    [cx, size - 5],
    [5, cy],
  ] as const;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onClick={onClick}
      className={className}
      style={{ cursor: onClick ? "pointer" : undefined, ...style }}
      role="img"
      aria-label={`${position} Cost${cost} ${side === "ally" ? "味方" : "敵"}`}
    >
      {/* CSS animation for selected state */}
      {selected && (
        <style>{`@keyframes fcms-pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
      )}

      {/* 選択時の黄色リング（点滅） */}
      {selected && (
        <circle
          cx={cx}
          cy={cy}
          r={outerR + 1}
          fill="none"
          stroke={SELECTED_RING_COLOR}
          strokeWidth={3}
          style={{ animation: "fcms-pulse 1s ease-in-out infinite" }}
        />
      )}

      {/* 枠装飾 (bronze / silver / gold / goldLarge) */}
      {borderColor && (
        <circle
          cx={cx}
          cy={cy}
          r={outerR}
          fill="none"
          stroke={borderColor}
          strokeWidth={borderWidth}
        />
      )}

      {/* SS 金枠のダイヤ装飾 */}
      {border === "goldLarge" &&
        sparklePoints.map(([px, py], i) => (
          <polygon
            key={i}
            points={`${px},${py - 4} ${px + 2.5},${py} ${px},${py + 4} ${px - 2.5},${py}`}
            fill={borderColor!}
            opacity={0.85}
          />
        ))}

      {/* メイン円 */}
      <circle cx={cx} cy={cy} r={innerR} fill={bg} />

      {/* ランク表示 */}
      <text
        x={cx}
        y={textY}
        textAnchor="middle"
        fill="white"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight={700}
        fontSize={fontSize}
        letterSpacing={rank === "SS" ? 1 : 0}
      >
        {rank}
      </text>

      {/* ポジション略称バッジ (右上) */}
      <rect
        x={badgeX}
        y={badgeY}
        width={badgeW}
        height={badgeH}
        rx={3}
        fill="rgba(0,0,0,0.55)"
      />
      <text
        x={badgeX + badgeW / 2}
        y={badgeY + 9}
        textAnchor="middle"
        fill="white"
        fontFamily="system-ui, sans-serif"
        fontWeight={600}
        fontSize={8}
      >
        {position}
      </text>

      {/* ボール保持インジケーター (右下) */}
      {hasBall && (
        <g>
          <circle
            cx={ballCx}
            cy={ballCy}
            r={ballR}
            fill="white"
            stroke="#222"
            strokeWidth={0.8}
          />
          {pentagons.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={1.8} fill="#333" />
          ))}
        </g>
      )}
    </svg>
  );
});

export default PieceIcon;

// ── ユーティリティ: コストからランク文字列を取得 ─────────
export function costToRank(cost: Cost): string {
  return COST_CONFIG[cost]?.rank ?? String(cost);
}

// ── ユーティリティ: コマサイズを取得 ─────────────────────
export function pieceSize(cost: Cost): number {
  return COST_CONFIG[cost]?.size ?? 64;
}
