// ============================================================
// special.ts — フェーズ3: 特殊判定（オフサイド）
//
// §9-2 フェーズ3 / §9-5
//   10. オフサイド判定
//       - 判定基準: フェーズ0スナップショット（移動前の位置）
//       - オフサイドライン = 守備側後方2番目のコマの row
//       - 受け手の移動前位置 で判定
//       - 確定OS / グレーゾーン(50%) / オンサイド
//
// オフサイド成立時:
//   - ボールを守備チームに返す（受け手の位置から再開）
//   - フェーズ2の PASS_DELIVERED を取り消す
// ============================================================

import { getOffsideLine, resolveOffside } from './offside';
import type {
  BallAcquiredEvent,
  GameEvent,
  OffsideEvent,
  Piece,
  Team,
} from './types';

// ============================================================
// フェーズ3: 特殊判定処理
// ============================================================

export interface SpecialResult {
  pieces: Piece[];
  events: GameEvent[];
}

export function processSpecial(
  piecesIn: Piece[],
  /** フェーズ0 スナップショット（移動前の全コマ位置） */
  snapshot: Piece[],
  /** フェーズ2で確定したパス配送情報（null なら判定スキップ） */
  deliveredPass: { passerId: string; receiverId: string } | null,
): SpecialResult {
  const events: GameEvent[] = [];
  const pieces: Piece[] = piecesIn.map(p => ({ ...p, coord: { ...p.coord } }));
  const pieceById = new Map(pieces.map(p => [p.id, p]));

  // パス配送が発生していなければオフサイド判定なし
  if (!deliveredPass) return { pieces, events };

  const passer   = pieceById.get(deliveredPass.passerId);
  const receiver = pieceById.get(deliveredPass.receiverId);
  if (!passer || !receiver) return { pieces, events };

  // スナップショットから受け手と守備コマの移動前位置を取得
  const receiverSnap = snapshot.find(p => p.id === receiver.id);
  if (!receiverSnap) return { pieces, events };

  const defenseTeam: Team = passer.team === 'home' ? 'away' : 'home';
  const defenderSnaps = snapshot.filter(p => p.team === defenseTeam);

  // 「敵陣方向」: home チームはrow増加方向に攻撃（row=33 がゴール）
  // away チームはrow減少方向に攻撃（row=0 がゴール）
  // 守備チームにとっての「後方 = 自陣側」:
  //   守備 = away なら row=33 側が自陣 → 降順ソートで2番目
  //   守備 = home なら row=0  側が自陣 → 昇順ソートで2番目
  const defenderGoalIsLowRow = defenseTeam === 'home'; // home守備ならゴール側=row=0
  const attackIsHighRow      = passer.team === 'home'; // home攻撃ならrow大きい方が敵陣

  const offsideLine = getOffsideLine(defenderSnaps, defenderGoalIsLowRow);
  const osResult    = resolveOffside({
    receiverSnapshot: receiverSnap,
    offsideLine,
    attackIsHighRow,
  });

  if (osResult.isOffside) {
    events.push({
      type: 'OFFSIDE',
      phase: 3,
      receiverId: receiver.id,
      passerId: passer.id,
      result: osResult,
    } as OffsideEvent);

    // ボールを守備チームに渡す（受け手の現在位置のコマに渡す）
    // 再開位置は受け手のいる HEX で守備チームの任意コマ（実装簡略化: GK）
    receiver.hasBall = false;
    const gk = pieces.find(p => p.team === defenseTeam && p.position === 'GK');
    const ballHolder = gk ?? pieces.find(p => p.team === defenseTeam);
    if (ballHolder) {
      ballHolder.hasBall = true;
      events.push({ type: 'BALL_ACQUIRED', phase: 3, pieceId: ballHolder.id } as BallAcquiredEvent);
    }
  }

  return { pieces, events };
}
