// ============================================================
// types.ts — 全型定義
// ============================================================

/** コマのポジション */
export type Position = 'GK' | 'DF' | 'SB' | 'VO' | 'MF' | 'OM' | 'WG' | 'FW';

/** コマのコスト（1 / 1.5 / 2 / 2.5 / 3） */
export type Cost = 1 | 1.5 | 2 | 2.5 | 3;

/** 所属チーム */
export type Team = 'home' | 'away';

/** フリーボールの発生元 */
export type FreeBallSource = 'throughPass' | 'loose';

/** HEX座標 */
export interface HexCoord {
  col: number;
  row: number;
}

/** ゾーン（サード）名 */
export type Zone =
  | 'ディフェンシブGサード'
  | 'ディフェンシブサード'
  | 'ミドルサードD'
  | 'ミドルサードA'
  | 'アタッキングサード'
  | 'ファイナルサード';

/** レーン名 */
export type Lane =
  | '左サイドレーン'
  | '左ハーフレーン'
  | 'センターレーン'
  | '右ハーフレーン'
  | '右サイドレーン';

/** コマ */
export interface Piece {
  id: string;
  team: Team;
  position: Position;
  cost: Cost;
  coord: HexCoord;
  hasBall: boolean;
}

/** ボードの状態 */
export interface Board {
  pieces: Piece[];
  /** キックオフ前スナップショット（オフサイド判定用）*/
  snapshot: Piece[];
  /** フリーボール位置（誰も持っていない場合のHEX座標） */
  freeBallHex?: HexCoord | null;
  /** フリーボールを最後に触ったチーム（スペースパス後のオフサイド判定用） */
  freeBallLastTouchedTeam?: Team | null;
  /** フリーボールを最後に触ったコマID（スペースパス後のオフサイド判定用） */
  freeBallLastTouchedPieceId?: string | null;
  /** フリーボール発生元 */
  freeBallSource?: FreeBallSource | null;
  /** 自陣保持による遅延行為カウント */
  possessionDelay?: PossessionDelayState | null;
  /** 消極的戦術ペナルティ中のチーム */
  passiveTacticsTeams?: Team[];
  /** ベンチ控えコマ（交代の投入元）。盤面上には存在しない */
  bench?: Piece[];
}

// ============================================================
// 指示（Order）型
// ============================================================

export type OrderType = 'move' | 'dribble' | 'pass' | 'throughPass' | 'shoot' | 'substitute' | 'stay';

export interface Order {
  pieceId: string;
  type: OrderType;
  target?: HexCoord; // 移動先 / パス先(受け手の移動前座標) / シュート先
  /** パス受け手のコマID（座標がフェーズ1移動でずれても確実に特定するため） */
  targetPieceId?: string;
  /** 交代で投入するベンチコマのID（type==='substitute' のとき必須） */
  benchPieceId?: string;
}

// ============================================================
// 判定イベント（Event）型
// ============================================================

/** 判定結果の基底 */
export interface JudgmentResult {
  success: boolean;
  probability: number; // 0-100
  roll: number;        // 0-100 の乱数
}

/** シュートチェーン結果 */
export interface ShootChainResult {
  blockCheck?: JudgmentResult & { blocker: Piece };
  savingCheck?: JudgmentResult;
  catchCheck?: JudgmentResult;
  shootSuccessCheck?: JudgmentResult;
  outcome: 'goal' | 'blocked' | 'saved_catch' | 'saved_ck' | 'missed';
}

/** パスカット結果 */
export interface PassCutResult {
  cut1?: JudgmentResult & { interceptor: Piece };
  cut2?: JudgmentResult & { interceptor: Piece };
  outcome: 'delivered' | 'cut1' | 'cut2';
}

/** タックル結果 */
export interface TackleResult extends JudgmentResult {
  tackler: Piece;
  dribbler: Piece;
  outcome: 'tackled' | 'survived';
}

/** ファウル結果 */
export interface FoulResult {
  occurred: boolean;
  isPA: boolean;
  outcome: 'fk' | 'pk' | 'none';
}

/** 競合判定結果 */
export interface CollisionResult extends JudgmentResult {
  winner: Piece;
  loser: Piece;
}

/** オフサイド判定結果 */
export interface OffsideResult {
  isOffside: boolean;
  isGrayZone: boolean;
  /** グレーゾーン判定（50%）の結果 */
  grayZoneRoll?: number;
}

/** 自陣保持による遅延行為カウント */
export interface PossessionDelayState {
  team: Team | null;
  count: number;
}

// ============================================================
// ZOC ユーティリティ用型
// ============================================================

/** ZOC 隣接情報 */
export interface ZocAdjacency {
  /** 対象HEXのZOC内にいる攻撃側コマ数 */
  attackCount: number;
  /** 対象HEXのZOC内にいる守備側コマ数 */
  defenseCount: number;
}

// ============================================================
// ボードコンテキスト（HEX情報プロバイダ）
// ============================================================

export interface BoardContext {
  getZone(coord: HexCoord): Zone;
  getLane(coord: HexCoord): Lane;
  /** ボード内の有効HEXか判定（col 0-21, row 0-33） */
  isValidHex(coord: HexCoord): boolean;
}

// ============================================================
// ゲームイベント（何が起きたかの記録）
// ============================================================

export interface PieceMovedEvent {
  type: 'PIECE_MOVED';
  phase: 1;
  pieceId: string;
  from: HexCoord;
  to: HexCoord;
}

export interface ZocStopEvent {
  type: 'ZOC_STOP';
  phase: 1;
  pieceId: string;
  /** 停止したHEX */
  coord: HexCoord;
  /** ZOCを展開していた敵コマID */
  zocOwnerId: string;
}

export interface CollisionEvent {
  type: 'COLLISION';
  phase: 1;
  coord: HexCoord;
  result: CollisionResult;
}

export interface TackleEvent {
  type: 'TACKLE';
  phase: 1;
  coord: HexCoord;
  result: TackleResult;
}

export interface FoulEvent {
  type: 'FOUL';
  phase: 1;
  coord: HexCoord;
  /** タックルを仕掛けた守備コマID（ファウルで無効化されたタックル） */
  tacklerId: string;
  result: FoulResult;
}

export interface ShootEvent {
  type: 'SHOOT';
  phase: 2;
  shooterId: string;
  coord: HexCoord;
  result: ShootChainResult;
}

export interface PassDeliveredEvent {
  type: 'PASS_DELIVERED';
  phase: 2;
  passerId: string;
  receiverId: string;
  receiverCoord: HexCoord;
}

export interface PassCutEvent {
  type: 'PASS_CUT';
  phase: 2;
  passerId: string;
  receiverId: string;
  result: PassCutResult;
}

export interface OffsideEvent {
  type: 'OFFSIDE';
  phase: 3;
  receiverId: string;
  /** パスを出したコマID */
  passerId: string;
  /** スペース/フリーボール取得時に発生したオフサイドか */
  source?: 'pass' | 'throughPass' | 'freeBall';
  result: OffsideResult;
}

export interface BattleDelayEvent {
  type: 'BATTLE_DELAY';
  phase: 3;
  team: Team;
  count: number;
  coord: HexCoord;
  awardedToPieceId?: string;
}

export interface PassiveTacticsEvent {
  type: 'PASSIVE_TACTICS';
  phase: 3;
  team: Team;
  pieceCount: number;
}

export interface BallAcquiredEvent {
  type: 'BALL_ACQUIRED';
  phase: 1 | 2 | 3;
  pieceId: string;
}

export interface SubstitutionEvent {
  type: 'SUBSTITUTION';
  phase: 0;
  team: Team;
  /** 退場する（盤面→ベンチ）コマID */
  outPieceId: string;
  /** 投入する（ベンチ→盤面）コマID */
  inPieceId: string;
  /** 交代が行われた盤面座標 */
  coord: HexCoord;
}

export interface LooseBallEvent {
  type: 'LOOSE_BALL';
  phase: 1 | 2;
  coord: HexCoord;
  /** ボールを拾ったコマID（null = 誰も拾えず→フリーボール継続） */
  acquiredBy: string | null;
}

export type GameEvent =
  | PieceMovedEvent
  | ZocStopEvent
  | CollisionEvent
  | TackleEvent
  | FoulEvent
  | ShootEvent
  | PassDeliveredEvent
  | PassCutEvent
  | OffsideEvent
  | BattleDelayEvent
  | PassiveTacticsEvent
  | BallAcquiredEvent
  | SubstitutionEvent
  | LooseBallEvent;

// ============================================================
// ターン結果
// ============================================================

export interface TurnResult {
  /** フェーズ3完了後のボード状態 */
  board: Board;
  /** フェーズ0〜3で発生した全イベント（発生順） */
  events: GameEvent[];
}
