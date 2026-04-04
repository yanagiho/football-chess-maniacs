# Football Chess ManiacS (FCMS) — Claude Code ガイド

## プロジェクト概要

HEXグリッド上で行うサッカー×チェス型ボードゲーム（TypeScript）。
仕様書: `docs/fcms_spec_v3.md` / コスト帯シミュレーション表: `docs/piece_allocation.md` / UI仕様: `docs/ui_spec.md`

---

## ディレクトリ構成

```
src/
├── data/
│   └── hex_map.json          # 22×34 flat-top HEX グリッド（748 エントリ）
├── engine/                   # ゲームエンジン（判定式・ターン処理）
│   ├── types.ts              # 全型定義（Piece, Order, GameEvent, TurnResult …）
│   ├── dice.ts               # 判定式: calcProbability / judge / calcZocModifier
│   ├── shoot.ts              # §7-2 シュート判定チェーン
│   ├── pass.ts               # §7-3 パスカット1・2
│   ├── tackle.ts             # §7-4 タックル判定
│   ├── foul.ts               # §7-5 ファウル判定
│   ├── collision.ts          # §7-6 競合判定
│   ├── offside.ts            # §9-5 オフサイド判定
│   ├── movement.ts           # フェーズ1: コマ移動・ZOC停止・タックル・ファウル
│   ├── ball.ts               # フェーズ2: シュート・パス配送・パスカット
│   ├── special.ts            # フェーズ3: オフサイド処理
│   ├── turn_processor.ts     # processTurn — フェーズ0〜3 オーケストレーション
│   ├── index.ts              # 全モジュール再エクスポート
│   └── __tests__/
├── worker.ts                 # Cloudflare Workers エントリポイント（Hono）
├── wrangler.toml             # Cloudflare設定（DO/D1/KV/R2/Queues）
├── durable/
│   ├── game_session.ts       # ゲームセッションDO（Hibernation API）
│   └── matchmaking.ts        # マッチメイキングDO（リージョンシャード）
├── api/
│   ├── auth.ts               # プラットフォーム認証・Webhook
│   ├── team.ts               # チーム編成CRUD（D1）
│   ├── match.ts              # マッチング・セッション接続
│   └── replay.ts             # リプレイ取得（R2）
├── middleware/
│   ├── jwt_verify.ts         # JWT検証（JWKS）
│   ├── rate_limit.ts         # レート制限（KV）
│   └── validation.ts         # 入力バリデーション（§7-3 全14項目）
└── client/                   # React フロントエンド（Cloudflare Pages）
    ├── App.tsx               # ルートコンポーネント
    ├── main.tsx              # エントリポイント
    ├── index.html            # HTMLテンプレート
    ├── types.ts              # クライアント型定義
    ├── pages/
    │   ├── Title.tsx          # タイトル画面
    │   ├── ModeSelect.tsx     # モード選択
    │   ├── TeamSelect.tsx     # チーム選択
    │   ├── Formation.tsx      # フォーメーション設定
    │   ├── Matching.tsx       # マッチング待機
    │   ├── Battle.tsx         # 対戦画面（スマホ§2 / PC§3 統合）
    │   ├── HalfTime.tsx       # ハーフタイム
    │   ├── Result.tsx         # 結果画面
    │   └── Replay.tsx         # リプレイ画面
    ├── components/
    │   ├── board/
    │   │   ├── HexBoard.tsx   # HEXボード（背景画像+Canvas+DOM §6-1）
    │   │   ├── Piece.tsx      # コマ表示（ポジション別色 §6-1）
    │   │   ├── Overlay.tsx    # Canvas: ZOC/パスライン/オフサイドライン
    │   │   └── Controls.tsx   # ズーム/パン制御
    │   ├── ui/
    │   │   ├── Timer.tsx      # ターンタイマー（§2-2）
    │   │   ├── ActionBar.tsx  # スマホ用アクションバー（§2-4）
    │   │   ├── SidePanel.tsx  # PC用左右パネル（§3-4, §3-5）
    │   │   └── PresetButtons.tsx # プリセット行動（§2-7）
    │   └── minigame/
    │       ├── FKGame.tsx     # FKミニゲーム（§4-1）
    │       ├── CKGame.tsx     # CKミニゲーム（§4-2）
    │       └── PKGame.tsx     # PKミニゲーム（§4-3）
    ├── hooks/
    │   ├── useWebSocket.ts    # WebSocket通信
    │   ├── useGameState.ts    # ゲーム状態管理（useReducer）
    │   └── useDeviceType.ts   # スマホ/PC判定
    └── data/
        └── hex_map.json       # HEX座標マップ（コピー）
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
| worker.ts + api/* | Hono REST API + WebSocket | ✅ |
| durable/game_session.ts | §4-3 DO Hibernation + §7-2 WS認証 | ✅ |
| durable/matchmaking.ts | §4-2 シャード構成マッチメイキング | ✅ |
| middleware/* | §7-2 JWT + §7-3 バリデーション14項目 + §7-4 レート制限 | ✅ |
| wrangler.toml | DO/D1/KV/R2/Queues バインディング | ✅ |
| client/pages/* | 全9画面（タイトル〜リプレイ） | ✅ |
| client/components/board/* | HEXボード（背景+Canvas+DOM §6-1） | ✅ |
| client/components/ui/* | タイマー・アクションバー・パネル・プリセット | ✅ |
| client/components/minigame/* | FK/CK/PK ミニゲーム（§4-1〜§4-3） | ✅ |
| client/hooks/* | WebSocket・状態管理・デバイス判定 | ✅ |

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
