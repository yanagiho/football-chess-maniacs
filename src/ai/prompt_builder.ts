// ============================================================
// prompt_builder.ts — 難易度別プロンプト生成（§2-1〜2-5）
// システムプロンプト＋ユーザープロンプトを構築して返す。
// ============================================================

import type { Piece, Team, GameEvent } from '../engine/types';
import type { PieceLegalMoves } from './legal_moves';
import { toLegalMovesJson } from './legal_moves';

// ================================================================
// 型定義
// ================================================================

export type Difficulty = 'beginner' | 'regular' | 'maniac';

export type Era =
  | '草創期'
  | '戦間期'
  | '戦後黄金期'
  | 'テレビ・拡張期'
  | '近代化期'
  | 'グローバル期'
  | '現代';

export interface PromptContext {
  difficulty: Difficulty;
  era: Era;
  pieces: Piece[];
  myTeam: Team;
  scoreHome: number;
  scoreAway: number;
  turn: number;
  maxTurn: number;
  legalMoves: PieceLegalMoves[];
  /** 直近3ターンの履歴（§2-1） */
  recentHistory?: TurnHistoryEntry[];
  /** 相手プレイヤーの傾向サマリ（§7、マニアックのみ） */
  playerTendency?: string;
}

export interface TurnHistoryEntry {
  turn: number;
  events: GameEvent[];
}

export interface PromptMessages {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}

// ================================================================
// §2-5 時代戦術テンプレート
// ================================================================

const ERA_TACTICS: Record<Era, string> = {
  '草創期': 'パスよりドリブルを優先してください。個人突破を重視し、ZOCに恐れず突っ込んでください',
  '戦間期': 'WMフォーメーション（3-2-5）を意識してください。FW/WGを5枚前方に配置し、守備は薄くてOKです',
  '戦後黄金期': 'OM/FWの個人技を中心にしてください。ドリブルでの突破を最優先してください',
  'テレビ・拡張期': 'トータルフットボールを実践してください。DFがアタッキングサードまで上がることを恐れないでください。全員攻撃・全員守備です',
  '近代化期': '組織的守備を重視してください。DF/SB/VOでコンパクトなブロックを作り、ZOCで中央を固めてください。カウンター主体です',
  'グローバル期': 'ポゼッションを最優先してください。パス成功確率60%以下のパスは出さないでください。ボール保持率を最大化してください',
  '現代': 'ハイプレス＋ハイラインを実行してください。DFラインを高く保ち、相手ボール時はFW/WGから前方プレスしてください。オフサイドトラップを多用してください',
};

// ================================================================
// 基本ルール説明（全難易度共通のシステムプロンプト先頭）
// ================================================================

const BASE_RULES = `あなたはHEXグリッド（22×34マス）上のサッカー戦術ゲームのAIです。

## ルール概要
- 各ターン、11枚のフィールドコマに同時に指示を出します
- 指示: 移動(move)、ドリブル(dribble)、パス(pass)、シュート(shoot)、交代(substitute)、静止(stay)
- ボール保持コマのみがパス/シュート/ドリブルを実行できます
- 移動力はコスト3で+1、ゾーンボーナスで+1。基本移動力4、ドリブル3
- ZOC: 相手コマの隣接6HEXに進入すると停止しタックル判定が発生します
- パスカット: パスコース上のZOC/ZOC2に相手コマがいるとカットされる可能性があります
- パスカット確率は移動前の推定値です。相手コマの移動でパスコースの状況は変動します。相手の移動を予測して判断してください
- シュートはアタッキングサード以上からゴール6ゾーンに向けて打てます
- オフサイド: パスの受け手が相手の後方2番目のコマより前にいるとオフサイド

## 出力形式
JSONのみを出力してください。説明文は不要です。
\`\`\`json
{
  "orders": [
    {"piece_id": "p01", "action": "move", "target_hex": [col, row]},
    {"piece_id": "p05", "action": "pass", "target_piece": "p11"},
    {"piece_id": "p09", "action": "shoot", "zone": "top_left"}
  ]
}
\`\`\`
指示を出さないコマは配列に含めないでください（静止扱い）。`;

// ================================================================
// §2-2 ビギナー用性格プロンプト
// ================================================================

const BEGINNER_PERSONALITY = `## 性格
- 3〜4枚のコマだけに指示を出してください。残りは空にしてください
- ボールを持っているコマは必ず指示を出してください
- 30%の確率で、最善手ではなく2番目に良い手を選んでください
- 相手のZOCを気にせず突っ込むことがあります
- オフサイドラインは無視してください
- 交代は使わないでください
- ときどき無謀なロングシュートを打ってください`;

// ================================================================
// §2-3 レギュラー用性格プロンプト
// ================================================================

const REGULAR_PERSONALITY = `## 性格
- 6〜7枚のコマに指示を出してください
- ボール保持コマ＋その周囲の味方を優先して動かしてください
- 常に最善手を選んでください
- 相手のZOCを避けて迂回するルートを選んでください
- オフサイドラインを意識し、FWをライン手前に配置してください
- 後半20ターン以降、必要なら交代を1回使ってください
- 得点差に応じて攻守のバランスを調整してください
  - リード時：守備的（DFラインを下げる）
  - ビハインド時：攻撃的（FW/WGを前方へ）`;

// ================================================================
// §2-4 マニアック用性格プロンプト
// ================================================================

const MANIAC_PERSONALITY = `## 性格
- 9〜10枚のコマに指示を出してください。ほぼ全枚を動かしてください
- 常に最善手を選び、複数ターン先を見据えた配置を意識してください
- ZOCを守備に積極的に活用してください。相手の進路を塞ぐ位置にコマを配置してください
- オフサイドトラップを状況に応じて仕掛けてください
  - 条件：相手ボールがミドルサード以下＋相手FW/WGがアタッキングサードにいる
  - 方法：DF/SBのラインを一斉に1〜2HEX押し上げる
  - 毎回やると読まれるので、条件を満たす場面の50%程度で使用
- 交代を戦術的に使ってください
  - ビハインド時：攻撃的コマを投入
  - リード時：守備的コマを投入
  - コスト上限16を必ず守ってください
- スルーパスを積極的に狙ってください（FWに走り込み指示＋OMからパス）
- 相手プレイヤーの傾向に対応してください`;

// ================================================================
// プロンプト構築メイン
// ================================================================

/**
 * §2-1 難易度別のプロンプトメッセージを構築
 */
export function buildPrompt(ctx: PromptContext): PromptMessages {
  const systemContent = buildSystemPrompt(ctx);
  const userContent = buildUserPrompt(ctx);

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  };
}

// ── システムプロンプト ──

function buildSystemPrompt(ctx: PromptContext): string {
  const parts: string[] = [BASE_RULES];

  // 難易度別性格（§2-2〜2-4）
  switch (ctx.difficulty) {
    case 'beginner':
      parts.push(BEGINNER_PERSONALITY);
      break;
    case 'regular':
      parts.push(REGULAR_PERSONALITY);
      break;
    case 'maniac':
      parts.push(MANIAC_PERSONALITY);
      break;
  }

  // §2-5 時代戦術テンプレート
  parts.push(`## 時代戦術\n${ERA_TACTICS[ctx.era]}`);

  return parts.join('\n\n');
}

// ── ユーザープロンプト（毎ターン変化）──

function buildUserPrompt(ctx: PromptContext): string {
  const parts: string[] = [];

  // §7 相手プレイヤーの傾向（マニアックのみ）
  if (ctx.difficulty === 'maniac' && ctx.playerTendency) {
    parts.push(`## 相手プレイヤーの傾向\n${ctx.playerTendency}`);
  }

  // 直近3ターンの履歴（レギュラー＋マニアック）
  if (ctx.difficulty !== 'beginner' && ctx.recentHistory && ctx.recentHistory.length > 0) {
    const historyText = ctx.recentHistory
      .map((h) => `ターン${h.turn}: ${h.events.map((e) => e.type).join(', ')}`)
      .join('\n');
    parts.push(`## 直近のターン履歴\n${historyText}`);
  }

  // 盤面状態
  parts.push(`## 現在の盤面\n${buildBoardStateJson(ctx)}`);

  // 合法手リスト（§9-5: 上位5手に絞る）
  const legalMovesJson = JSON.stringify(toLegalMovesJson(ctx.legalMoves, 5), null, 0);
  parts.push(`## 各コマの合法手\n${legalMovesJson}`);

  return parts.join('\n\n');
}

// ── 盤面状態JSON ──

function buildBoardStateJson(ctx: PromptContext): string {
  const state = {
    score: `${ctx.scoreHome}-${ctx.scoreAway}`,
    turn: ctx.turn,
    max_turn: ctx.maxTurn,
    remaining_turns: ctx.maxTurn - ctx.turn,
    my_team: ctx.myTeam,
    pieces: ctx.pieces.map((p) => ({
      id: p.id,
      team: p.team,
      position: p.position,
      cost: p.cost,
      hex: [p.coord.col, p.coord.row],
      has_ball: p.hasBall || undefined,
    })),
  };
  return JSON.stringify(state, null, 0);
}
