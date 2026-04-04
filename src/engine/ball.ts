// ============================================================
// ball.ts — フェーズ2: ボール処理
//
// §9-2 フェーズ2 処理順:
//   6. シュート判定チェーン（§7-2）— GK の移動後位置で判定
//   7. パスの配送: 受け手の移動後の位置にボールが届く
//   8. パスカット1: パスコース上の守備コマの移動後位置で判定
//   9. パスカット2: 受け手の移動後 ZOC 内に守備コマがいるか判定
// ============================================================

import { resolveShootChain } from './shoot';
import { resolvePass } from './pass';
import {
  buildZocMap,
  buildZoc2Map,
  getZocAdjacency,
  getZocHexes,
  hexDistance,
  hexKey,
  hexLinePath,
} from './movement';
import type {
  BallAcquiredEvent,
  BoardContext,
  GameEvent,
  HexCoord,
  Order,
  PassCutEvent,
  PassDeliveredEvent,
  Piece,
  ShootEvent,
  Team,
  ZocAdjacency,
} from './types';

// ============================================================
// 定数
// ============================================================

/** ゴールが存在するrow（攻撃方向別）—— フィールドは34行(0-33) */
const GOAL_ROW: Record<Team, number> = { home: 33, away: 0 };
/** ゴール中央列（22列中央: col 9-11、中心 col=10） */
const GOAL_CENTER_COL = 10;

// ============================================================
// ヘルパー
// ============================================================

/** ゴール座標を返す（攻撃チームのゴール = 相手ゴールライン上の中央） */
function goalCoord(attackingTeam: Team): HexCoord {
  const row = GOAL_ROW[attackingTeam];
  return { col: GOAL_CENTER_COL, row };
}

/**
 * パス/シュートコースを横切る最初の守備コマを返す。
 * "コースが守備コマのZOCを通る" = パス経路上のHEXが守備コマのZOC内にある。
 */
function findBlockerOnPath(
  path: HexCoord[],
  defenseTeam: Team,
  pieces: Piece[],
): Piece | null {
  const defZoc = buildZocMap(pieces, defenseTeam);
  for (const hex of path) {
    const ownerId = defZoc.get(hexKey(hex));
    if (ownerId) return pieces.find(p => p.id === ownerId) ?? null;
  }
  return null;
}

/**
 * パスカット1: パスコース上のHEXが守備コマの ZOC / ZOC2 内にあるかチェック。
 * ZOC → ZOC2 の順で最初に見つかったコマを返す。
 */
function findCut1Interceptor(
  path: HexCoord[],
  defenseTeam: Team,
  pieces: Piece[],
): Piece | null {
  const defZoc  = buildZocMap(pieces, defenseTeam);
  const defZoc2 = buildZoc2Map(pieces, defenseTeam);
  for (const hex of path) {
    const k = hexKey(hex);
    const ownerId = defZoc.get(k) ?? defZoc2.get(k);
    if (ownerId) return pieces.find(p => p.id === ownerId) ?? null;
  }
  return null;
}

/**
 * パスカット2: 受け手のZOC（隣接6HEX）内にいる守備コマを返す。
 * 最初の1体がトリガー（§7-3 注記: 1体目はZOC隣接修正に含めない）。
 */
function findCut2Defenders(
  receiver: Piece,
  defenseTeam: Team,
  pieces: Piece[],
): Piece[] {
  const zocKeys = new Set(getZocHexes(receiver.coord).map(hexKey));
  return pieces.filter(p => p.team === defenseTeam && zocKeys.has(hexKey(p.coord)));
}

/**
 * GK を返す（守備チーム内のポジションが GK のコマ）
 */
function findGk(defenseTeam: Team, pieces: Piece[]): Piece | null {
  return pieces.find(p => p.team === defenseTeam && p.position === 'GK') ?? null;
}

// ============================================================
// フェーズ2: ボール処理
// ============================================================

export interface BallResult {
  pieces: Piece[];
  events: GameEvent[];
  /** フェーズ3のオフサイド判定で参照するパス配送情報 */
  deliveredPass: { passerId: string; receiverId: string } | null;
}

export function processBall(
  piecesIn: Piece[],
  orders: Order[],
  context: BoardContext,
): BallResult {
  const events: GameEvent[] = [];
  const pieces: Piece[] = piecesIn.map(p => ({ ...p, coord: { ...p.coord } }));
  const pieceById = new Map(pieces.map(p => [p.id, p]));
  const orderMap  = new Map(orders.map(o => [o.pieceId, o]));

  let deliveredPass: BallResult['deliveredPass'] = null;

  // ────────────────────────────────────────────────────────
  // ステップ6: シュート判定チェーン
  // ────────────────────────────────────────────────────────
  const shootOrder = orders.find(o => o.type === 'shoot' && o.target);
  if (shootOrder) {
    const shooter = pieceById.get(shootOrder.pieceId);
    if (shooter?.hasBall && shootOrder.target) {
      const attackTeam  = shooter.team;
      const defenseTeam: Team = attackTeam === 'home' ? 'away' : 'home';
      const goal   = goalCoord(attackTeam);
      const gk     = findGk(defenseTeam, pieces);

      // シュート経路（シューターの次のHEXからゴールまで）
      const shootPath = hexLinePath(shooter.coord, goal).slice(1); // シューター自身を除く

      // ② シュートブロッカー（コース上最初の守備コマのZOC内のHEX）
      const blocker = findBlockerOnPath(shootPath, defenseTeam, pieces);

      // ① シューターのZOC内にいる守備コマ数
      const shooterZocKeys = new Set(getZocHexes(shooter.coord).map(hexKey));
      const defInShooterZoc = pieces.filter(
        p => p.team === defenseTeam && shooterZocKeys.has(hexKey(p.coord)),
      ).length;

      // GK までの距離
      const distToGk   = gk ? hexDistance(shooter.coord, gk.coord) : 99;
      // GK のZOC内にいる守備コマ数（GK 自身を除く）
      const defInGkZoc = gk
        ? pieces.filter(p =>
            p.team === defenseTeam &&
            p.id !== gk.id &&
            new Set(getZocHexes(gk.coord).map(hexKey)).has(hexKey(p.coord)),
          ).length
        : 0;

      const distToGoal = hexDistance(shooter.coord, goal);

      // ZOC隣接情報（各チェックの発生地点）
      const blockZocAdj: ZocAdjacency = blocker
        ? getZocAdjacency(blocker.coord, defenseTeam, pieces)
        : { attackCount: 0, defenseCount: 0 };
      const savingZocAdj: ZocAdjacency = gk
        ? getZocAdjacency(gk.coord, defenseTeam, pieces)
        : { attackCount: 0, defenseCount: 0 };
      const successZocAdj = getZocAdjacency(shooter.coord, attackTeam, pieces);

      const shootResult = resolveShootChain({
        shooter,
        gk,
        blocker,
        distanceToGoal: distToGoal,
        distanceToGk: distToGk,
        defenderCountInGkZoc: defInGkZoc,
        defenderCountInShooterZoc: defInShooterZoc,
        blockZoc: blockZocAdj,
        savingZoc: savingZocAdj,
        shootSuccessZoc: successZocAdj,
      });

      events.push({
        type: 'SHOOT',
        phase: 2,
        shooterId: shooter.id,
        coord: shooter.coord,
        result: shootResult,
      } as ShootEvent);

      // ボール所有権の更新
      if (shootResult.outcome === 'blocked' && blocker) {
        shooter.hasBall  = false;
        blocker.hasBall  = true;
        events.push({ type: 'BALL_ACQUIRED', phase: 2, pieceId: blocker.id } as BallAcquiredEvent);
      } else if (shootResult.outcome === 'saved_catch' && gk) {
        shooter.hasBall = false;
        gk.hasBall      = true;
        events.push({ type: 'BALL_ACQUIRED', phase: 2, pieceId: gk.id } as BallAcquiredEvent);
      }
      // goal / saved_ck / missed はフェーズ外処理（ゲームエンジン側で対応）
    }
  }

  // ────────────────────────────────────────────────────────
  // ステップ7-9: パス配送 + パスカット判定
  // ────────────────────────────────────────────────────────
  const passOrder = orders.find(o => o.type === 'pass' && o.target);
  if (passOrder && !shootOrder) { // シュートとパスは排他
    const passer = pieceById.get(passOrder.pieceId);
    if (passer?.hasBall && passOrder.target) {
      const defenseTeam: Team = passer.team === 'home' ? 'away' : 'home';

      // 受け手: 指定 HEX にいる味方コマ
      const targetKey = hexKey(passOrder.target);
      const receiver  = pieces.find(
        p => p.team === passer.team && hexKey(p.coord) === targetKey && p.id !== passer.id,
      ) ?? null;

      if (receiver) {
        // ステップ8: パスコース（パサー除く、受け手含む）
        const passPath = hexLinePath(passer.coord, receiver.coord);

        // パスカット1 の候補: パスコース上のHEXが ZOC or ZOC2 内
        const cut1Interceptor = findCut1Interceptor(passPath, defenseTeam, pieces);

        // パスカット1 の ZOC 隣接（インターセプター位置基準）
        const cut1Zoc: ZocAdjacency = cut1Interceptor
          ? getZocAdjacency(cut1Interceptor.coord, passer.team, pieces)
          : { attackCount: 0, defenseCount: 0 };

        // パスカット2 の候補: 受け手の ZOC 内にいる守備コマ
        const cut2Defenders = findCut2Defenders(receiver, defenseTeam, pieces);
        // トリガーコマ（1体目）を除いた残りのコマ数（§7-3 注記）
        const cut2Zoc: ZocAdjacency = {
          attackCount: getZocAdjacency(receiver.coord, passer.team, pieces).attackCount,
          defenseCount: Math.max(0, cut2Defenders.length - 1),
        };

        const passResult = resolvePass({
          passer,
          receiver,
          cut1Interceptor,
          cut1Zoc,
          cut2Defenders,
          cut2Zoc,
        });

        if (passResult.outcome === 'delivered') {
          passer.hasBall   = false;
          receiver.hasBall = true;
          deliveredPass = { passerId: passer.id, receiverId: receiver.id };
          events.push({
            type: 'PASS_DELIVERED',
            phase: 2,
            passerId: passer.id,
            receiverId: receiver.id,
            receiverCoord: { ...receiver.coord },
          } as PassDeliveredEvent);
          events.push({ type: 'BALL_ACQUIRED', phase: 2, pieceId: receiver.id } as BallAcquiredEvent);
        } else {
          const interceptor = passResult.outcome === 'cut1'
            ? passResult.cut1!.interceptor
            : passResult.cut2!.interceptor;
          passer.hasBall      = false;
          interceptor.hasBall = true;
          events.push({
            type: 'PASS_CUT',
            phase: 2,
            passerId: passer.id,
            receiverId: receiver.id,
            result: passResult,
          } as PassCutEvent);
          events.push({ type: 'BALL_ACQUIRED', phase: 2, pieceId: interceptor.id } as BallAcquiredEvent);
        }
      }
    }
  }

  return { pieces, events, deliveredPass };
}
