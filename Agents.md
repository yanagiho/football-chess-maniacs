# Agents.md — FCMS 機能別エージェント定義

このファイルはプロジェクトを機能ドメインごとに分割し、各エージェントの担当範囲・主要ファイル・仕様書参照を定義する。

---

## 1. Engine（ゲームエンジン）

判定式・ターン処理・ルール判定の中核ロジック。

### 担当ファイル
```
src/engine/
├── types.ts              # 全型定義（Piece, Order, GameEvent, TurnResult …）
├── dice.ts               # 判定式: effectiveDiff / calcProbability / judge
├── shoot.ts              # シュート判定チェーン（§7-2）
├── pass.ts               # パスカット1・2（§7-3）
├── tackle.ts             # タックル判定（§7-4）
├── foul.ts               # ファウル判定（§7-5）
├── collision.ts          # 競合判定（§7-6）
├── offside.ts            # オフサイド判定（§9-5）
├── movement.ts           # フェーズ1: コマ移動・ZOC停止
├── ball.ts               # フェーズ2: シュート・パス配送
├── special.ts            # フェーズ3: オフサイド処理
├── turn_processor.ts     # processTurn — フェーズ0〜3 統合
├── index.ts              # 再エクスポート
└── __tests__/            # ユニット・統合テスト（281件）
```

### 仕様書
- `docs/fcms_spec_v3.md` — §7 判定式、§9-2 フェーズ処理、§9-5 オフサイド

### 注意事項
- HEX座標はflat-top odd-q offset（22列×34行）
- ランク帯システム: 生コスト差でなく `effectiveDiff` を使用
- フェーズ順序: 0(スナップショット) → 1(移動) → 2(ボール) → 3(オフサイド)
- ファウル優先: タックル成功後のファウルはタックルを無効化

---

## 2. AI（COM AIエンジン）

ルールベースAI・Gemma推論・フォールバック制御。

### 担当ファイル
```
src/ai/
├── evaluator.ts          # 局面評価（盤面スコアリング）
├── legal_moves.ts        # 合法手生成
├── rule_based.ts         # フォーメーション維持型AI（3ライン制御）
├── prompt_builder.ts     # 難易度別プロンプト生成
├── gemma_client.ts       # Workers AI (Gemma) 呼び出し
├── output_parser.ts      # Gemma出力パース＋検証
├── fallback.ts           # フォールバック制御
├── com_ai.ts             # 統合COM AIクラス（安全層→判断層→検証層）
├── index.ts              # 再エクスポート
└── bootstrap/            # ブートストラップパイプライン
    ├── auto_play.ts      # 自動対戦（30-36ターン）
    ├── data_extract.ts   # 学習データ抽出（JSONL）
    └── run.ts            # 実行スクリプト
```

### 仕様書
- `docs/com_ai_spec.md` — COM AI設計全体

### 注意事項
- AIの方向計算は `hexDistance`（cube座標）ベース。offset row差は禁止
- ルールベースAI: 3ライン制御 + 2手パスルート + プレス守備
- `selectBallHolderOrder` はクロージャ内関数
- Gemma障害時はルールベース最善手に自動切替

---

## 3. Client/Board（HEXボード・コマ表示）

HEXグリッド描画・コマアイコン・オーバーレイ・ズーム/パン。

### 担当ファイル
```
src/client/components/board/
├── HexBoard.tsx          # HEXボード（背景+Canvas+DOM、flipY対応）
├── PieceIcon.tsx         # コマアイコンSVG（ランク表記・枠装飾・敵味方色）
├── Piece.tsx             # コマ表示ラッパー（PA外警告・交代マーク）
├── Overlay.tsx           # Canvas: 矢印・パスライン・シュート線・ZOC・ゾーン境界
└── Controls.tsx          # ズーム/パン（ピンチ/ホイール/中クリック）
src/data/hex_map.json     # 22×34 flat-top HEXグリッド（748エントリ）
```

### 仕様書
- `docs/ui_spec.md` — §6-1 コマアイコン、ボード描画

### 注意事項
- flipY: homeプレイヤーは row → 33-row に反転表示
- PieceIcon統一: 全コマ表示は PieceIcon を使用
- 味方=青(#2563EB)、敵=赤(#DC2626)

---

## 4. Client/Battle（対戦画面）

ターン進行・ボール操作UI・演出・ゴール処理・AT。

### 担当ファイル
```
src/client/pages/Battle.tsx       # 対戦画面メイン
src/client/components/
├── BallActionMenu.tsx            # ボールアクションメニュー
├── CenterOverlay.tsx             # 中央オーバーレイ演出
├── FlyingBall.tsx                # ボール飛行アニメーション
├── ShootOverlay.tsx              # シュート演出
├── SubstitutionPanel.tsx         # 選手交代パネル
└── ui/
    ├── Timer.tsx                 # ターンタイマー（60秒）
    ├── ActionBar.tsx             # スマホ: アクションバー
    └── SidePanel.tsx             # PC: 左右パネル
src/client/hooks/
├── useGameState.ts               # ゲーム状態管理（useReducer）
└── useDeviceType.ts              # スマホ/PC判定
```

### 仕様書
- `docs/ui_spec.md` — §2-7 操作、§3 パネル、§4 演出
- `docs/fcms_spec_v3.md` — §4-3 ターン構成

### 注意事項
- COM対戦: Battle.tsx → processTurn 直接呼び出し（サーバー不要）
- 演出: KICK OFF / HALF TIME / SECOND HALF / FULL TIME / GOAL!
- 実行バナー2.5秒 + 8秒安全タイムアウト
- React.StrictMode: タイマー系useEffectでrefガード不使用

---

## 5. Client/Minigame（FK/CK/PKミニゲーム）

セットプレーのミニゲームUI・結果判定。

### 担当ファイル
```
src/client/components/minigame/
├── FKGame.tsx                    # FKミニゲーム（§4-1）
├── CKGame.tsx                    # CKミニゲーム（§4-2）
└── PKGame.tsx                    # PKミニゲーム（§4-3）
src/client/components/
├── PKShootout.tsx                # PK戦
└── CoinToss.tsx                  # コイントス
```

### 仕様書
- `docs/ui_spec.md` — §4-1〜§4-3

### 注意事項
- FK/PK: 6ゾーン選択、同ゾーン=GKセーブ（パワー突破可能）
- CK: 3枚×3ゾーン、2ゾーン以上勝利で攻撃側ボール獲得
- タイムアウト時は未選択をランダム補完して自動送信
- isAttacker/isKicker: ファウルされた側が攻撃側

---

## 6. Client/Formation（編成画面）

チーム編成・フォーメーション選択・セーブスロット。

### 担当ファイル
```
src/client/pages/Formation.tsx    # 編成画面v2
src/client/types.ts               # FormationData, FormationPiece 等
```

### 仕様書
- `docs/formation-spec.md` — 編成画面仕様

### 注意事項
- 手持ちコマ制・プリセット6種・セーブスロット10枠
- コスト上限16（スタメン11枚: GK1+FP10）
- `onFormationConfirm(FormationData)` → App.tsx → Battle.tsx

---

## 7. Client/Flow（画面遷移・認証・通信）

画面遷移・モード選択・マッチング・WebSocket・リプレイ。

### 担当ファイル
```
src/client/App.tsx                # ルート（ページ遷移 + state管理）
src/client/main.tsx               # エントリポイント
src/client/pages/
├── Title.tsx                     # タイトル画面
├── ModeSelect.tsx                # モード選択（ranked/casual/com）
├── TeamSelect.tsx                # チーム選択
├── Matching.tsx                  # マッチング待機
├── HalfTime.tsx                  # ハーフタイム
├── Result.tsx                    # 結果画面
└── Replay.tsx                    # リプレイ画面
src/client/components/
└── ConnectionBanner.tsx          # 接続状態表示
src/client/hooks/
└── useWebSocket.ts               # WebSocket通信（認証・自動再接続）
```

### 注意事項
- COM: ModeSelect → 1秒即マッチ → Battle
- Online: Matching → WS接続 → MATCH_FOUND → Battle
- gameMode / formationData / authToken は App.tsx の state で管理

---

## 8. Server/API（REST API・認証・バリデーション）

Hono REST API・JWT認証・レート制限・入力バリデーション。

### 担当ファイル
```
src/worker.ts                     # Cloudflare Workers エントリポイント（Hono）
src/api/
├── auth.ts                       # プラットフォーム認証・Webhook
├── team.ts                       # チーム編成CRUD（D1）
├── match.ts                      # マッチング・セッション接続
└── replay.ts                     # リプレイ取得（R2）
src/middleware/
├── jwt_verify.ts                 # JWT検証（JWKS）
├── rate_limit.ts                 # レート制限（KV）
└── validation.ts                 # 入力バリデーション（14項目）
```

### 仕様書
- `docs/openapi.yaml` — API仕様
- `docs/schema.sql` — D1スキーマ
- `docs/fcms_spec_v3.md` — §7-2 認証、§7-3 バリデーション、§7-4 レート制限

---

## 9. Server/DurableObjects（ゲームセッション・マッチメイキング）

Durable Objects によるリアルタイムゲーム状態管理。

### 担当ファイル
```
src/durable/
├── game_session.ts               # GameSession DO（Hibernation API）
└── matchmaking.ts                # Matchmaking DO（リージョンシャード）
src/wrangler.toml                 # DO/D1/KV/R2/Queues バインディング
```

### 仕様書
- `docs/fcms_spec_v3.md` — §4-2 マッチメイキング、§4-3 ゲームセッション
- `docs/tech_requirements.md` — インフラ要件

### 注意事項
- GameSession: processTurn統合、ハーフタイム/AT/ゴールリスタート/試合終了
- Matchmaking: リージョンシャード構成
- アラーム上書き: 既存と比較して早い方を優先

---

## エージェント間の依存関係

```
                    ┌─────────────┐
                    │  1. Engine   │
                    └──────┬──────┘
                           │ processTurn / types
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │  2. AI   │ │ 4.Battle │ │ 9. Durable   │
        └──────────┘ │          │ │   Objects    │
                     └────┬─────┘ └──────┬───────┘
                          │              │
           ┌──────┬───────┼──────┐       │
           ▼      ▼       ▼     ▼       ▼
        ┌─────┐┌─────┐┌─────┐┌─────┐┌─────────┐
        │3.Brd││5.MG ││6.Fmt││7.Flw││ 8. API  │
        └─────┘└─────┘└─────┘└─────┘└─────────┘

Engine → AI:        合法手生成・局面評価がEngine型に依存
Engine → Battle:    COM対戦でprocessTurnを直接呼び出し
Engine → DO:        オンライン対戦でprocessTurnをサーバー側実行
Battle → Board:     HEXボード描画・コマ配置
Battle → Minigame:  ファウル時にFK/PK/CKミニゲーム起動
Battle → Formation: formationDataからチーム初期配置
Flow → Battle:      画面遷移・gameMode・formationData引継ぎ
API → DO:           REST/WSからDurable Objectsへルーティング
```
