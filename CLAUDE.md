# Football Chess ManiacS (FCMS) — Claude Code ガイド

## プロジェクト概要

HEXグリッド上で行うサッカー×チェス型ボードゲームのゲームエンジン（TypeScript）。
仕様書: `docs/fcms_spec_v3.md` / コスト帯シミュレーション表: `docs/piece_allocation.md`

---

## ディレクトリ構成

```
src/
├── data/
│   └── hex_map.json          # 22×34 flat-top HEX グリッド（748 エントリ）
└── engine/
    ├── types.ts              # 全型定義（Piece, Order, GameEvent, TurnResult …）
    ├── dice.ts               # 判定式: calcProbability / judge / calcZocModifier
    ├── shoot.ts              # §7-2 シュート判定チェーン
    ├── pass.ts               # §7-3 パスカット1・2
    ├── tackle.ts             # §7-4 タックル判定
    ├── foul.ts               # §7-5 ファウル判定
    ├── collision.ts          # §7-6 競合判定
    ├── offside.ts            # §9-5 オフサイド判定
    ├── movement.ts           # フェーズ1: コマ移動・ZOC停止・タックル・ファウル
    ├── ball.ts               # フェーズ2: シュート・パス配送・パスカット
    ├── special.ts            # フェーズ3: オフサイド処理
    ├── turn_processor.ts     # processTurn — フェーズ0〜3 オーケストレーション
    ├── index.ts              # 全モジュール再エクスポート
    └── __tests__/
        ├── shoot.test.ts
        ├── pass.test.ts
        ├── tackle.test.ts
        ├── offside.test.ts
        └── turn_processor.test.ts
```

---

## 実装済みの仕様

| モジュール | 対応仕様 | 状態 |
|---|---|---|
| hex_map.json | §5 ボード仕様（flat-top odd-q） | ✅ |
| dice.ts | §7 判定式の基礎 | ✅ |
| shoot.ts | §7-2 シュート判定チェーン | ✅ |
| pass.ts | §7-3 パスカット1・2 | ✅ |
| tackle.ts | §7-4 タックル | ✅ |
| foul.ts | §7-5 ファウル | ✅ |
| collision.ts | §7-6 競合 | ✅ |
| offside.ts | §9-5 オフサイド | ✅ |
| movement.ts | §9-2 フェーズ1 | ✅ |
| ball.ts | §9-2 フェーズ2 | ✅ |
| special.ts | §9-2 フェーズ3 | ✅ |
| turn_processor.ts | §9-2 全フェーズ統合 | ✅ |
| ユニットテスト | 判定式全体・統合 | ✅ 210 tests passing |

---

## 重要な実装ルール

### HEX グリッド（flat-top odd-q offset）
- 22 列（col 0-21）× 34 行（row 0-33）
- 奇数列は偶数列より下にオフセット
- ZOC = 隣接6HEX、ZOC2 = 外周12HEX

### 判定式
```
(x - y + 3) × Ω + ポジション修正 + ZOC隣接修正
```
- 結果は 0〜100 にクランプ
- **全ポジション修正は必ず重ねて適用**（守備修正 + 攻撃/パサー修正の両方）
- 例: VO守備(+10) vs MF パサー(-10) → 修正合計 0

### フェーズ処理
- **フェーズ0**: スナップショット取得（移動前位置を記録）
- **フェーズ1**: 移動（前ターンのZOCマップで停止判定）
- **フェーズ2**: ボール処理（パス配送先はフェーズ1後の位置）
- **フェーズ3**: オフサイド判定（**スナップショット位置**で判定）

### オフサイド
- 受け手のスナップショット(移動前)位置で判定
- diff ≥ 2: 確定オフサイド
- diff = 1: グレーゾーン（50%判定）
- diff ≤ 0: オンサイド

### ファウル優先
- タックル成功後にファウルが成立した場合、**タックルを無効化してFK/PKを与える**
- イベント順: `TACKLE` → `BALL_ACQUIRED(tackler)` → `FOUL`（ボールはドリブラーに戻る）

---

## テスト

```bash
npm test          # vitest run（全210テスト）
npm run test:watch
```

### テスト上の注意点
- モック: `vi.mock('../dice', async () => ({...actual, judge: vi.fn()}))`
- テストデータの列順: `[positionA, costA, positionB, costB, expected]`（位置と cost は交互）
- ポジション修正テストの expected 値は**全修正を適用した結果**であること
- オフサイド統合テストの守備コマは **pass コース・FW移動経路と別の列に配置**（ZOC干渉を避けるため）

---

## 設定ファイル

- `package.json`: `"type": "module"`, vitest ^2.1.0, TypeScript ^5.5.0
- `tsconfig.json`: target ES2022, module ESNext, moduleResolution bundler, strict
- `vitest.config.ts`: globals: false, environment: node
