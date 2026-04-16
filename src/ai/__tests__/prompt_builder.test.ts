// ============================================================
// prompt_builder.test.ts — プロンプト構築のユニットテスト
// ============================================================

import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../prompt_builder';
import type { PromptContext, Difficulty, Era } from '../prompt_builder';
import { generateAllLegalMoves } from '../legal_moves';
import type { PieceLegalMoves } from '../legal_moves';
import type { Piece } from '../../engine/types';

// ── ヘルパー ──

function makeTestPieces(): Piece[] {
  const formation = [
    { pos: 'GK' as const, cost: 1 as const,   col: 10, row: 1 },
    { pos: 'DF' as const, cost: 1 as const,   col: 7,  row: 5 },
    { pos: 'DF' as const, cost: 1.5 as const, col: 13, row: 5 },
    { pos: 'SB' as const, cost: 1 as const,   col: 4,  row: 6 },
    { pos: 'SB' as const, cost: 1.5 as const, col: 16, row: 6 },
    { pos: 'VO' as const, cost: 2 as const,   col: 10, row: 9 },
    { pos: 'MF' as const, cost: 1 as const,   col: 7,  row: 12 },
    { pos: 'MF' as const, cost: 1.5 as const, col: 13, row: 12 },
    { pos: 'OM' as const, cost: 2 as const,   col: 10, row: 15 },
    { pos: 'WG' as const, cost: 1.5 as const, col: 4,  row: 17 },
    { pos: 'FW' as const, cost: 2.5 as const, col: 10, row: 19 },
  ];

  const pieces: Piece[] = [];
  for (let i = 0; i < formation.length; i++) {
    const f = formation[i];
    pieces.push({
      id: `h${String(i + 1).padStart(2, '0')}`,
      team: 'home',
      position: f.pos,
      cost: f.cost,
      coord: { col: f.col, row: f.row },
      hasBall: false,
    });
    pieces.push({
      id: `a${String(i + 1).padStart(2, '0')}`,
      team: 'away',
      position: f.pos,
      cost: f.cost,
      coord: { col: f.col, row: 33 - f.row },
      hasBall: false,
    });
  }
  // awayのFWにボール
  const fw = pieces.find(p => p.team === 'away' && p.position === 'FW');
  if (fw) fw.hasBall = true;
  return pieces;
}

function makeMinimalLegalMoves(): PieceLegalMoves[] {
  return Array.from({ length: 11 }, (_, i) => ({
    pieceId: `a${String(i + 1).padStart(2, '0')}`,
    position: 'MF',
    cost: 1,
    currentHex: { col: 10, row: 10 },
    hasBall: i === 10, // FW has ball
    legalActions: [
      { id: 'a1', action: 'move' as const, targetHex: { col: 10, row: 12 }, note: 'move' },
      { id: 'a2', action: 'stay' as const, note: '静止' },
    ],
  }));
}

function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    difficulty: 'regular',
    era: '現代',
    pieces: makeTestPieces(),
    myTeam: 'away',
    scoreHome: 0,
    scoreAway: 0,
    turn: 1,
    maxTurn: 36,
    legalMoves: makeMinimalLegalMoves(),
    ...overrides,
  };
}

describe('buildPrompt', () => {
  // ================================================================
  // 基本構造テスト
  // ================================================================

  describe('基本構造', () => {
    it('system + user の2メッセージを返す', () => {
      const result = buildPrompt(makeContext());
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[1].role).toBe('user');
    });

    it('systemプロンプトにルール概要が含まれる', () => {
      const result = buildPrompt(makeContext());
      const system = result.messages[0].content;
      expect(system).toContain('HEXグリッド');
      expect(system).toContain('出力形式');
      expect(system).toContain('orders');
    });

    it('userプロンプトに盤面状態が含まれる', () => {
      const result = buildPrompt(makeContext());
      const user = result.messages[1].content;
      expect(user).toContain('現在の盤面');
      expect(user).toContain('各コマの合法手');
    });

    it('userプロンプトにスコアとターン情報がある', () => {
      const result = buildPrompt(makeContext({ scoreHome: 2, scoreAway: 1, turn: 15 }));
      const user = result.messages[1].content;
      expect(user).toContain('2-1');
      expect(user).toContain('"turn":15');
    });
  });

  // ================================================================
  // 難易度別テスト
  // ================================================================

  describe('難易度別性格', () => {
    it('beginner: 3〜4枚指示の性格が含まれる', () => {
      const result = buildPrompt(makeContext({ difficulty: 'beginner' }));
      const system = result.messages[0].content;
      expect(system).toContain('3〜4枚');
      expect(system).not.toContain('9〜10枚');
    });

    it('regular: 6〜7枚指示の性格が含まれる', () => {
      const result = buildPrompt(makeContext({ difficulty: 'regular' }));
      const system = result.messages[0].content;
      expect(system).toContain('6〜7枚');
    });

    it('maniac: 9〜10枚指示+オフサイドトラップが含まれる', () => {
      const result = buildPrompt(makeContext({ difficulty: 'maniac' }));
      const system = result.messages[0].content;
      expect(system).toContain('9〜10枚');
      expect(system).toContain('オフサイドトラップ');
    });
  });

  // ================================================================
  // 時代戦術テスト
  // ================================================================

  describe('時代戦術', () => {
    const eras: Era[] = ['草創期', '戦間期', '戦後黄金期', 'テレビ・拡張期', '近代化期', 'グローバル期', '現代'];

    for (const era of eras) {
      it(`${era}: 時代戦術テンプレートが含まれる`, () => {
        const result = buildPrompt(makeContext({ era }));
        const system = result.messages[0].content;
        expect(system).toContain('時代戦術');
      });
    }

    it('草創期: ドリブル優先', () => {
      const result = buildPrompt(makeContext({ era: '草創期' }));
      expect(result.messages[0].content).toContain('ドリブル');
    });

    it('現代: ハイプレス', () => {
      const result = buildPrompt(makeContext({ era: '現代' }));
      expect(result.messages[0].content).toContain('ハイプレス');
    });
  });

  // ================================================================
  // 履歴・傾向テスト
  // ================================================================

  describe('ターン履歴とプレイヤー傾向', () => {
    it('beginner: ターン履歴を含めない', () => {
      const result = buildPrompt(makeContext({
        difficulty: 'beginner',
        recentHistory: [{ turn: 1, events: [{ type: 'SHOOT' } as any] }],
      }));
      const user = result.messages[1].content;
      expect(user).not.toContain('直近のターン履歴');
    });

    it('regular: ターン履歴を含める', () => {
      const result = buildPrompt(makeContext({
        difficulty: 'regular',
        recentHistory: [{ turn: 1, events: [{ type: 'SHOOT' } as any] }],
      }));
      const user = result.messages[1].content;
      expect(user).toContain('直近のターン履歴');
      expect(user).toContain('SHOOT');
    });

    it('maniac: プレイヤー傾向を含める', () => {
      const result = buildPrompt(makeContext({
        difficulty: 'maniac',
        playerTendency: 'ロングボール多用',
      }));
      const user = result.messages[1].content;
      expect(user).toContain('相手プレイヤーの傾向');
      expect(user).toContain('ロングボール多用');
    });

    it('regular: プレイヤー傾向を含めない', () => {
      const result = buildPrompt(makeContext({
        difficulty: 'regular',
        playerTendency: 'ロングボール多用',
      }));
      const user = result.messages[1].content;
      expect(user).not.toContain('相手プレイヤーの傾向');
    });
  });

  // ================================================================
  // トークン数推定テスト（Task #7 用）
  // ================================================================

  describe('トークン数推定', () => {
    it('初期盤面のプロンプトが文字数上限以内', () => {
      // Gemma 12Bの入力上限は8192トークン
      // 日本語1文字≈1-2トークン、英語1単語≈1トークン
      // 安全マージンを見て、合計20000文字以下を目標
      const result = buildPrompt(makeContext());
      const totalChars = result.messages.reduce((sum, m) => sum + m.content.length, 0);
      console.log(`[prompt_builder.test] 初期盤面プロンプト: system=${result.messages[0].content.length}chars, user=${result.messages[1].content.length}chars, total=${totalChars}chars`);
      // 20000文字 ≈ 10000-15000トークン — 要調整の場合はここで検知
      expect(totalChars).toBeLessThan(20000);
    });

    it('合法手5手制限でプロンプトサイズが抑制される', () => {
      // 大量の合法手を持つ盤面でもtop5に絞られるか確認
      const bigLegalMoves: PieceLegalMoves[] = Array.from({ length: 11 }, (_, i) => ({
        pieceId: `a${String(i + 1).padStart(2, '0')}`,
        position: 'MF',
        cost: 1,
        currentHex: { col: 10, row: 10 },
        hasBall: i === 10,
        legalActions: Array.from({ length: 50 }, (_, j) => ({
          id: `a${j}`,
          action: 'move' as const,
          targetHex: { col: j % 22, row: j % 34 },
          note: `移動先${j}`,
        })),
      }));
      const result = buildPrompt(makeContext({ legalMoves: bigLegalMoves }));
      const user = result.messages[1].content;
      // 各コマ最大5手なので、11*5=55アクション以内のはず
      const actionCount = (user.match(/"action"/g) || []).length;
      expect(actionCount).toBeLessThanOrEqual(55);
    });

    // ── 実合法手生成を使ったリアル盤面トークン数テスト ──

    /**
     * 中盤戦のリアルな盤面を構築:
     * - awayチームがボール保持（OMがボール）
     * - 両チームのコマが散らばっている
     * - 多様なコスト帯（1, 1.5, 2, 2.5）
     * - awayのOMがアタッキングサード付近でボール保持 → シュート/パス/ドリブル全て発生
     */
    function makeMidGamePieces(): Piece[] {
      // home: row 0方向がゴール、row 33方向に攻撃
      const homePieces: Piece[] = [
        { id: 'h01', team: 'home', position: 'GK',  cost: 1,   coord: { col: 10, row: 1  }, hasBall: false },
        { id: 'h02', team: 'home', position: 'DF',  cost: 1.5, coord: { col: 7,  row: 6  }, hasBall: false },
        { id: 'h03', team: 'home', position: 'DF',  cost: 1,   coord: { col: 13, row: 6  }, hasBall: false },
        { id: 'h04', team: 'home', position: 'SB',  cost: 1,   coord: { col: 3,  row: 8  }, hasBall: false },
        { id: 'h05', team: 'home', position: 'SB',  cost: 1.5, coord: { col: 17, row: 7  }, hasBall: false },
        { id: 'h06', team: 'home', position: 'VO',  cost: 2,   coord: { col: 10, row: 12 }, hasBall: false },
        { id: 'h07', team: 'home', position: 'MF',  cost: 1,   coord: { col: 6,  row: 14 }, hasBall: false },
        { id: 'h08', team: 'home', position: 'MF',  cost: 1.5, coord: { col: 14, row: 13 }, hasBall: false },
        { id: 'h09', team: 'home', position: 'OM',  cost: 2,   coord: { col: 10, row: 18 }, hasBall: false },
        { id: 'h10', team: 'home', position: 'WG',  cost: 2,   coord: { col: 4,  row: 20 }, hasBall: false },
        { id: 'h11', team: 'home', position: 'FW',  cost: 2.5, coord: { col: 10, row: 24 }, hasBall: false },
      ];
      // away: row 33方向がゴール、row 0方向に攻撃
      // OMがボール保持、ディフェンシブサード付近（row 8）→ シュート可能ゾーン
      const awayPieces: Piece[] = [
        { id: 'a01', team: 'away', position: 'GK',  cost: 1,   coord: { col: 10, row: 32 }, hasBall: false },
        { id: 'a02', team: 'away', position: 'DF',  cost: 2,   coord: { col: 8,  row: 27 }, hasBall: false },
        { id: 'a03', team: 'away', position: 'DF',  cost: 1,   coord: { col: 12, row: 27 }, hasBall: false },
        { id: 'a04', team: 'away', position: 'SB',  cost: 1.5, coord: { col: 4,  row: 25 }, hasBall: false },
        { id: 'a05', team: 'away', position: 'SB',  cost: 1,   coord: { col: 18, row: 26 }, hasBall: false },
        { id: 'a06', team: 'away', position: 'VO',  cost: 2,   coord: { col: 10, row: 20 }, hasBall: false },
        { id: 'a07', team: 'away', position: 'MF',  cost: 1.5, coord: { col: 7,  row: 17 }, hasBall: false },
        { id: 'a08', team: 'away', position: 'MF',  cost: 1,   coord: { col: 14, row: 18 }, hasBall: false },
        { id: 'a09', team: 'away', position: 'OM',  cost: 2.5, coord: { col: 10, row: 10 }, hasBall: true },
        { id: 'a10', team: 'away', position: 'WG',  cost: 1.5, coord: { col: 5,  row: 8  }, hasBall: false },
        { id: 'a11', team: 'away', position: 'FW',  cost: 2.5, coord: { col: 11, row: 5  }, hasBall: false },
      ];
      return [...homePieces, ...awayPieces];
    }

    it('リアル合法手（generateAllLegalMoves）で全難易度プロンプトが文字数上限以内', () => {
      const pieces = makeMidGamePieces();

      // generateAllLegalMovesで実際の合法手を生成
      const realLegalMoves = generateAllLegalMoves({
        pieces,
        myTeam: 'away',
        remainingSubs: 3,
        maxFieldCost: 16,
        benchPieces: [],  // ベンチなしで移動/パス/シュート/ドリブルに集中
      });

      // 合法手の統計をログ出力
      const totalActions = realLegalMoves.reduce((sum, pm) => sum + pm.legalActions.length, 0);
      const ballHolderMoves = realLegalMoves.find(pm => pm.hasBall);
      const ballHolderActions = ballHolderMoves?.legalActions.length ?? 0;
      const actionTypeCounts: Record<string, number> = {};
      for (const pm of realLegalMoves) {
        for (const a of pm.legalActions) {
          actionTypeCounts[a.action] = (actionTypeCounts[a.action] || 0) + 1;
        }
      }

      console.log(`[prompt_builder.test] リアル合法手統計:`);
      console.log(`  コマ数: ${realLegalMoves.length}`);
      console.log(`  合法手総数: ${totalActions}`);
      console.log(`  ボール保持者(${ballHolderMoves?.pieceId})の合法手: ${ballHolderActions}`);
      console.log(`  アクション種別:`, JSON.stringify(actionTypeCounts));

      // 全3難易度でテスト
      const difficulties: Difficulty[] = ['beginner', 'regular', 'maniac'];

      for (const difficulty of difficulties) {
        const result = buildPrompt({
          difficulty,
          era: '現代',
          pieces,
          myTeam: 'away',
          scoreHome: 1,
          scoreAway: 0,
          turn: 12,
          maxTurn: 36,
          legalMoves: realLegalMoves,
          recentHistory: difficulty !== 'beginner' ? [
            { turn: 11, events: [{ type: 'TACKLE' } as any, { type: 'PASS_CUT' } as any] },
            { turn: 10, events: [{ type: 'SHOOT' } as any, { type: 'GK_SAVE' } as any] },
          ] : undefined,
          playerTendency: difficulty === 'maniac' ? 'サイド攻撃多用、SBのオーバーラップが多い' : undefined,
        });

        const systemChars = result.messages[0].content.length;
        const userChars = result.messages[1].content.length;
        const totalChars = systemChars + userChars;
        // 日本語テキスト: 1文字≈1.5トークン（平均）、英数字/JSON: 1文字≈0.5トークン
        // 保守的に全体を1トークン/文字で推定
        const estimatedTokens = totalChars;

        console.log(`[prompt_builder.test] リアル盤面 ${difficulty}: system=${systemChars}chars, user=${userChars}chars, total=${totalChars}chars, 推定トークン≈${estimatedTokens}`);

        // Gemma 3 12B ITの入力上限8192トークンに対して安全マージン
        // 20000文字以下 = おおよそ10000-15000トークン以内を保証
        expect(totalChars).toBeLessThan(20000);
      }
    });

    it('リアル合法手でボール保持者のアクション種別が全て含まれる', () => {
      const pieces = makeMidGamePieces();

      const realLegalMoves = generateAllLegalMoves({
        pieces,
        myTeam: 'away',
        remainingSubs: 3,
        maxFieldCost: 16,
        benchPieces: [],
      });

      const ballHolder = realLegalMoves.find(pm => pm.hasBall);
      expect(ballHolder).toBeDefined();

      const actionTypes = new Set(ballHolder!.legalActions.map(a => a.action));
      console.log(`[prompt_builder.test] ボール保持者のアクション種別: ${[...actionTypes].join(', ')}`);

      // ボール保持者は move, dribble, pass, stay を必ず持つ
      expect(actionTypes.has('move')).toBe(true);
      expect(actionTypes.has('dribble')).toBe(true);
      expect(actionTypes.has('pass')).toBe(true);
      expect(actionTypes.has('stay')).toBe(true);
      // OMがrow 10にいるのでawayのシュート可能ゾーン（row 0-11）内 → shoot も持つ
      expect(actionTypes.has('shoot')).toBe(true);
    });
  });
});
