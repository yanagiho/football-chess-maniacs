# Football Chess ManiacS — 開発手順書
**対象読者：非エンジニアでもClaude Codeを使って開発を進められることを前提とする**

---

## 全体スケジュール概要

```
Phase 0: 環境構築 ........................ 1〜2日
Phase 1: アセット制作 .................... 1〜2週間（Phase 2と並行可）
Phase 2: ゲームエンジン開発 .............. 2〜3週間
Phase 3: サーバーサイド開発 .............. 1〜2週間
Phase 4: フロントエンド開発 .............. 2〜3週間
Phase 5: COM AI開発 ...................... 3〜4週間
Phase 6: 結合・テスト .................... 2週間
Phase 7: デプロイ・サービスイン .......... 1週間
```

> Phase 1（アセット）とPhase 2〜4（開発）は並行作業できる。合計約2〜3ヶ月。

---

## Phase 0: 環境構築（1〜2日）

### 0-1. 必要なアカウント作成

| サービス | URL | 用途 | 費用 |
|---|---|---|---|
| GitHub | https://github.com | コード管理 | 無料 |
| Cloudflare | https://dash.cloudflare.com | サーバー・DB・CDN | 無料〜（従量課金） |
| Claude（Pro以上） | https://claude.ai | Claude Code利用 | 月額$20〜 |

### 0-2. PCに入れるもの

**Macの場合（ターミナルで実行）：**

```bash
# 1. Homebrewインストール（まだ入っていない場合）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Node.js インストール
brew install node

# 3. pnpm インストール（パッケージ管理ツール）
npm install -g pnpm

# 4. Wrangler インストール（Cloudflare CLIツール）
npm install -g wrangler

# 5. Git インストール（通常Macには入っている）
git --version

# 6. Claude Code インストール
npm install -g @anthropic-ai/claude-code
```

**Windowsの場合：**
- Node.js: https://nodejs.org からインストーラをDL
- 残りはコマンドプロンプトで同じコマンド

### 0-3. Cloudflare の初期設定

```bash
# 1. Cloudflareにログイン
wrangler login
# ブラウザが開くのでログインする

# 2. D1データベースを作成
wrangler d1 create fcms-db
# 表示されたdatabase_idをメモする

# 3. KV Namespaceを作成
wrangler kv namespace create FCMS_CACHE
# 表示されたidをメモする

# 4. R2バケットを作成
wrangler r2 bucket create fcms-assets
wrangler r2 bucket create fcms-records

# 5. Queuesを作成
wrangler queues create fcms-match-results
```

### 0-4. プロジェクトの初期化

```bash
# 1. フォルダ作成
mkdir football-chess-maniacs
cd football-chess-maniacs

# 2. Git初期化
git init

# 3. 設計書を配置
mkdir docs
# DLした設計書ファイル（13ファイル）を docs/ フォルダにコピー

# 4. アセット用フォルダ作成
mkdir -p assets/board
mkdir -p assets/pieces
mkdir -p assets/ui
mkdir -p assets/effects
mkdir -p assets/audio/bgm
mkdir -p assets/audio/se
```

---

## Phase 1: アセット制作（1〜2週間、開発と並行）

### 1-1. HEXボード背景画像の制作

**使用ツール：** nanobanana または任意の画像ソフト

**制作手順：**

1. **新規キャンバス作成**
   - スマホ用：幅1320px × 高さ2040px（HEX 1マスあたり60px幅）
   - PC用：幅2640px × 高さ4080px（HEX 1マスあたり120px幅）

2. **芝生の背景を塗る**
   - 全体を緑色（#4CAF50程度）で塗りつぶし
   - 濃淡のテクスチャを入れてリアル感を出す

3. **HEXグリッドを描く**
   - 六角形を横22個×縦34個並べる
   - 線の色：白（#FFFFFF）、太さ1px、透明度30%程度
   - 六角形のサイズ：スマホ版で幅60px、PC版で幅120px

4. **白線を描く**
   - タッチライン（外周の四辺）：白、太さ3px
   - ハーフライン（中央横線）：白、太さ2px
   - センターサークル：白、太さ2px、半径4HEX分
   - ペナルティエリア：白、太さ2px、横14HEX×縦6HEX（両ゴール前）
   - ゴール：横3HEX、太さ4px

5. **サード境界線を描く（薄い線）**
   - 縦方向に6分割（各サードの境界）
   - 線の色：白、太さ1px、透明度15%

6. **保存**
   - `assets/board/board_mobile.png`
   - `assets/board/board_pc.png`

> **ポイント**：完璧を目指さなくてOK。最初はシンプルな芝生＋グリッドで十分。後からいくらでも差し替えられる。

### 1-2. コマアイコンの制作

**MVP版はテキスト＋カラー背景のシンプルアイコン。**

1. **ポジション別に8色を決める**

| ポジション | 色 | 色コード |
|---|---|---|
| GK | 黄色 | #FFC107 |
| DF | 青 | #2196F3 |
| SB | 水色 | #03A9F4 |
| VO | 紫 | #9C27B0 |
| MF | 緑 | #4CAF50 |
| OM | オレンジ | #FF9800 |
| WG | 赤 | #F44336 |
| FW | 白 | #FFFFFF |

2. **円形アイコンを制作（各64×64px）**
   - 円の背景：ポジション色
   - 中央テキスト：ポジション略称（白文字、太字）
   - 例：青い円の中に白文字で「DF」

3. **コスト別の枠を追加**
   - コスト1：枠なし
   - コスト1.5：銅色の細い枠（#CD7F32）
   - コスト2：銀色の枠（#C0C0C0）
   - コスト2.5：金色の枠（#FFD700）
   - コスト3：虹色のグラデーション枠

4. **自チーム/相手チームの2セット**
   - 自チーム：上記の通り（明るい色）
   - 相手チーム：同じ色の暗いバージョン（彩度を下げる）

5. **保存先**
   - `assets/pieces/gk_cost1.png`, `assets/pieces/gk_cost2.png` ...
   - 全部で 8ポジション × 5コスト帯 × 2チーム ＝ 80ファイル

> **時短テクニック**：1つだけ丁寧に作って、色と文字を変えて量産する。

### 1-3. ボールアイコン

- 16×16pxの小さなサッカーボール画像
- `assets/pieces/ball.png`

### 1-4. UIパーツ

**最低限必要なもの：**

| パーツ | サイズ | 保存先 |
|---|---|---|
| ゲームロゴ | 400×100px | `assets/ui/logo.png` |
| ボタン背景（通常） | 200×50px | `assets/ui/btn_normal.png` |
| ボタン背景（押下） | 200×50px | `assets/ui/btn_pressed.png` |

> UIパーツの大半はCSS（コード）で作れるので、画像は最小限でOK。

### 1-5. BGM・SE

**BGM（4曲）：**

| 用途 | ファイル名 | 秒数 | 指示 |
|---|---|---|---|
| タイトル | `assets/audio/bgm/title.mp3` | 60秒ループ | 壮大で期待感のある曲 |
| 対戦（通常） | `assets/audio/bgm/battle.mp3` | 120秒ループ | テンポの良い戦術的な曲 |
| 勝利ジングル | `assets/audio/bgm/victory.mp3` | 10秒 | 短い勝利のファンファーレ |
| 敗北ジングル | `assets/audio/bgm/defeat.mp3` | 8秒 | 短い残念な曲 |

**SE（最低限20音）：**

| 用途 | ファイル名 |
|---|---|
| コマ選択 | `assets/audio/se/select.mp3` |
| 指示確定 | `assets/audio/se/confirm.mp3` |
| ターン確定 | `assets/audio/se/turn_end.mp3` |
| パス | `assets/audio/se/pass.mp3` |
| シュート | `assets/audio/se/shoot.mp3` |
| ゴール | `assets/audio/se/goal.mp3` |
| セーブ | `assets/audio/se/save.mp3` |
| タックル | `assets/audio/se/tackle.mp3` |
| ホイッスル | `assets/audio/se/whistle.mp3` |
| エラー | `assets/audio/se/error.mp3` |

> BGM/SEの調達方法：
> - 自作：GarageBand、FL Studio等
> - フリー素材：DOVA-SYNDROME、魔王魂等（ライセンス確認必須）
> - AI生成：Suno AI、Udio等
> - 有料素材：AudioJungle等

---

## Phase 2: ゲームエンジン開発（2〜3週間）

**ここからClaude Codeを使います。**

### 2-1. Claude Codeの起動

```bash
cd football-chess-maniacs
claude
```

### 2-2. HEX座標マップの生成

**Claude Codeへの指示：**
```
docs/fcms_spec_v3.md のボード仕様（§5）を読んでください。
22×34のHEXグリッドの全マスの中心座標を計算し、
以下の形式でJSONファイルを生成してください。

- 六角形はフラットトップ（横向き六角形）
- 1HEXの幅 = 60px（スマホ基準）
- 出力先: src/data/hex_map.json
- 各マスに以下の情報を含める:
  - col, row（列・行インデックス）
  - x, y（ピクセル座標）
  - zone（所属サード名）
  - lane（所属レーン名）
```

### 2-3. 判定エンジンの実装

**Claude Codeへの指示：**
```
docs/fcms_spec_v3.md の判定システム（§7）を全て読んでください。
以下のTypeScriptモジュールを作成してください。

src/engine/
├── types.ts          # 全型定義（Piece, Board, Order, Event等）
├── dice.ts           # 確率判定（基本判定式 (x-y+3)*Ω）
├── shoot.ts          # シュート判定チェーン（§7-2の4段階）
├── pass.ts           # パスカット1・パスカット2判定（§7-3）
├── tackle.ts         # タックル判定（§7-4）
├── foul.ts           # ファウル判定（§7-5）
├── collision.ts      # 同一HEX競合判定（§7-6）
├── offside.ts        # オフサイド判定（§9-5）
└── index.ts          # エクスポート

全ての判定式の数値（Ω値、ポジション修正、ZOC隣接修正）は
仕様書に記載の通り正確に実装してください。
```

### 2-4. ターン処理エンジンの実装

**Claude Codeへの指示：**
```
docs/fcms_spec_v3.md の同時解決の処理順序（§9-2）を読んでください。
ターン処理エンジンを作成してください。

src/engine/
├── turn_processor.ts  # フェーズ0〜3の処理順序を実装
├── movement.ts        # コマ移動処理（ZOC停止含む）
├── ball.ts            # ボール処理（パス配送・シュート）
└── special.ts         # 特殊判定（オフサイド）

フェーズ0: スナップショット（移動前位置記録）
フェーズ1: コマ移動（ZOC停止→競合→タックル→ファウル）
フェーズ2: ボール処理（シュート→パス配送→パスカット）
フェーズ3: オフサイド判定

入力: 両者のOrders配列
出力: Events配列（何が起きたかのリスト）+ 新しいBoardState
```

### 2-5. ユニットテストの作成

**Claude Codeへの指示：**
```
docs/piece_allocation.md のコスト帯ごとの判定シミュレーション（§7）を読んでください。
全判定式のユニットテストを作成してください。

src/engine/__tests__/
├── shoot.test.ts
├── pass.test.ts
├── tackle.test.ts
├── offside.test.ts
└── turn_processor.test.ts

テストケースは以下を含めてください:
- 全コスト差（-2〜+2）× 全ポジション修正の組み合わせ
- ZOC隣接修正の0体〜3体のケース
- スルーパスの成立/不成立
- オフサイドの確定/グレーゾーン/オンサイド
- ファウルの優先順位（タックル成功＋ファウル成立→ファウル優先）
```

**テストの実行：**
```bash
pnpm test
```

> テストが全てパスするまでClaude Codeに修正を依頼する。ここが品質の要。

---

## Phase 3: サーバーサイド開発（1〜2週間）

### 3-1. Cloudflare Workers プロジェクトの作成

**Claude Codeへの指示：**
```
docs/tech_requirements.md を読んでください。
Cloudflare Workers + Durable Objects + D1 + KV + R2 + Queues の
プロジェクトを以下の構成で作成してください。

src/
├── worker.ts              # Workersエントリポイント（Hono）
├── durable/
│   ├── game_session.ts    # ゲームセッションDO
│   └── matchmaking.ts     # マッチメイキングDO（シャード構成）
├── api/
│   ├── auth.ts            # プラットフォーム認証検証
│   ├── team.ts            # チーム編成API
│   ├── match.ts           # マッチングAPI
│   └── replay.ts          # リプレイAPI
├── middleware/
│   ├── jwt_verify.ts      # JWT検証ミドルウェア
│   ├── rate_limit.ts      # レート制限
│   └── validation.ts      # 入力バリデーション（§7-3の14項目）
└── wrangler.toml          # Cloudflare設定ファイル

WebSocket認証はupgradeハンドラで行い（§7-2）、
未認証接続が一切存在しない設計にしてください。
```

### 3-2. D1スキーマの作成

**Claude Codeへの指示：**
```
docs/tech_requirements.md の§5-2を読んでください。
D1のスキーマファイルを作成してください。

src/db/
├── schema.sql             # テーブル定義
└── seed.sql               # 初期データ（コママスタ、プリセットチーム）

piece_masterテーブルには docs/piece_allocation.md の
全コマデータ（7時代×20枚＝140枚 + 初期チーム汎用16枚）を投入してください。
SKU命名規約: fcms_{position}_{cost}_{era}
例: fcms_om_cost3_modern, fcms_df_cost1_generic
```

**D1にスキーマを適用：**
```bash
wrangler d1 execute fcms-db --file=src/db/schema.sql
wrangler d1 execute fcms-db --file=src/db/seed.sql
```

### 3-3. ゲームセッションDurable Objectの実装

**Claude Codeへの指示：**
```
docs/tech_requirements.md の§4-3, §4-4, §8を読んでください。
ゲームセッションのDurable Objectを実装してください。

機能:
- WebSocket Hibernation API対応
- ターン入力の受付→両者揃ったら解決→結果配信
- 1分のターンタイマー
- 切断検知（10秒ping）→30秒猶予→自動敗北
- 入力バリデーション14項目（§7-3）
- sequence + nonce のリプレイ攻撃防止
- 試合終了時にQueues経由で棋譜をR2に保存

Phase 2で作ったゲームエンジン（src/engine/）を
このDurable Object内で呼び出してターンを解決してください。
```

---

## Phase 4: フロントエンド開発（2〜3週間）

### 4-1. Reactプロジェクトの作成

**Claude Codeへの指示：**
```
React + TypeScript のフロントエンドプロジェクトを作成してください。
Cloudflare Pages でホスティングする前提です。

src/client/
├── App.tsx
├── pages/
│   ├── Title.tsx              # タイトル画面
│   ├── ModeSelect.tsx         # モード選択
│   ├── TeamSelect.tsx         # チーム選択
│   ├── Formation.tsx          # フォーメーション設定
│   ├── Matching.tsx           # マッチング待機
│   ├── Battle.tsx             # 対戦画面（メイン）
│   ├── HalfTime.tsx           # ハーフタイム
│   ├── Result.tsx             # 結果画面
│   └── Replay.tsx             # リプレイ画面
├── components/
│   ├── board/
│   │   ├── HexBoard.tsx       # HEXボード（背景画像+Canvas+DOM）
│   │   ├── Piece.tsx          # コマ表示
│   │   ├── Overlay.tsx        # ZOC/パスライン等のCanvas
│   │   └── Controls.tsx       # ズーム/パン制御
│   ├── ui/
│   │   ├── Timer.tsx          # タイマー
│   │   ├── ActionBar.tsx      # アクションバー（スマホ）
│   │   ├── SidePanel.tsx      # サイドパネル（PC）
│   │   └── PresetButtons.tsx  # プリセット行動ボタン
│   └── minigame/
│       ├── FKGame.tsx         # FKミニゲーム
│       ├── CKGame.tsx         # CKミニゲーム
│       └── PKGame.tsx         # PKミニゲーム
├── hooks/
│   ├── useWebSocket.ts        # WebSocket通信
│   ├── useGameState.ts        # ゲーム状態管理
│   └── useDeviceType.ts       # スマホ/PC判定
└── data/
    └── hex_map.json           # Phase 2で生成済み
```

### 4-2. HEXボードの実装

**Claude Codeへの指示：**
```
docs/ui_spec.md の§6を読んでください。
HEXボードをレイヤー分離構成で実装してください。

1. 背景レイヤー: assets/board/board_mobile.png を <img> で表示
2. Canvasオーバーレイ: ZOCハイライト、移動範囲、パスラインをCanvasで描画
3. コマレイヤー: assets/pieces/ のスプライト画像を絶対配置の<img>で表示
4. 座標は src/data/hex_map.json を参照

ズーム/パンはCSS transform (scale/translate) で実装。
スマホはピンチ/ドラッグ、PCはホイール/中クリックドラッグ。
```

### 4-3. スマホUIとPC UIの分岐

**Claude Codeへの指示：**
```
docs/ui_spec.md の§2（スマホ）と§3（PC）を読んでください。
デバイスに応じてUIを完全に切り替えてください。

スマホ:
- アクションバー（下部固定）
- プリセット行動ボタン（長押しメニュー）
- 自動ズーム（コマ選択時）
- クイック選択（右端の縦アイコン列）

PC:
- 左パネル（自チーム一覧）
- 右パネル（指示一覧+ターンログ）
- キーボードショートカット（1-0でコマ選択、Q/Wでパス/シュート、Spaceで確定）
- マウスオーバーでZOC表示
```

---

## Phase 5: COM AI開発（3〜4週間）

### 5-1. ルールベースAIの実装

**Claude Codeへの指示：**
```
docs/com_ai_spec.md の§4（局面評価）と§5（合法手生成）を読んでください。
ルールベースAIエンジンを実装してください。

src/ai/
├── evaluator.ts       # 局面評価（§4の盤面スコアリング）
├── legal_moves.ts     # 合法手生成（§5）
├── rule_based.ts      # ルールベース最善手選択（フォールバック用）
└── index.ts

これはGemmaのフォールバックとして使うので、
Gemmaなしでも単独で動作する必要があります。
```

### 5-2. Gemma連携の実装

**Claude Codeへの指示：**
```
docs/com_ai_spec.md の§1-4（AIの構造）、§2（プロンプト設計）、
§9（技術仕様）を読んでください。
Gemma連携モジュールを実装してください。

src/ai/
├── gemma_client.ts    # Workers AI (Gemma) 呼び出し
├── prompt_builder.ts  # 難易度別プロンプト生成（§2-2〜2-5）
├── output_parser.ts   # Gemma出力のパース＋検証（§9-3）
├── fallback.ts        # フォールバック制御（§9-4）
└── com_ai.ts          # 統合COM AIクラス

モデルIDは環境変数 AI_MODEL_ID から取得。
500ms以内に応答がない場合、ルールベースにフォールバック。
```

### 5-3. ブートストラップ（初期学習データ生成）

**Claude Codeへの指示：**
```
docs/com_ai_spec.md の§3（ブートストラップパイプライン）を読んでください。
ルールベースAI同士の自動対戦スクリプトを作成してください。

src/ai/bootstrap/
├── auto_play.ts       # ルールベースAI同士の自動対戦
├── data_extract.ts    # 盤面→指示ペアの抽出
└── run.ts             # 10,000試合の実行スクリプト

出力: training_data/ フォルダにJSONL形式で保存
```

**実行：**
```bash
# 10,000試合の自動対戦を実行（数時間かかる）
pnpm run bootstrap
```

### 5-4. Gemmaのファインチューニング

**Google Colabで実行：**

1. Google Colab（https://colab.research.google.com）を開く
2. 新しいノートブックを作成
3. ランタイム → ランタイムのタイプを変更 → GPU（T4）を選択
4. 以下のコードを実行：

```python
# 1. 必要なライブラリのインストール
!pip install transformers peft datasets

# 2. 学習データのアップロード
from google.colab import files
uploaded = files.upload()  # training_data.jsonl をアップロード

# 3. LoRAファインチューニング
# （Claude Codeに具体的なスクリプトを生成してもらう）
```

> この手順の詳細なPythonスクリプトは、Phase 5の段階でClaude Codeに生成を依頼する。

---

## Phase 6: 結合・テスト（2週間）

### 6-1. ローカルでの結合テスト

```bash
# 1. ローカルサーバー起動
wrangler dev

# 2. フロントエンド起動（別ターミナル）
pnpm run dev

# 3. ブラウザで http://localhost:3000 を開く
```

### 6-2. テスト項目チェックリスト

**Claude Codeへの指示：**
```
以下のテストを全て通るE2Eテストスクリプトを作成してください。

□ タイトル画面が表示される
□ COM対戦（ビギナー）を開始できる
□ HEXボードが正しく表示される
□ コマをタップ/クリックで選択できる
□ 移動可能HEXがハイライトされる
□ ZOCが赤で表示される
□ パスラインが描画される
□ ターン確定ボタンが動作する
□ 解決アニメーションが再生される
□ ゴール時にスコアが更新される
□ ハーフタイム演出が表示される
□ 90ターンで結果画面が表示される
□ FKミニゲームが動作する
□ CKミニゲームが動作する
□ PKミニゲームが動作する
□ 交代が正しく動作する（コスト上限チェック含む）
□ オフサイドが正しく判定される
□ 切断→30秒→自動敗北が動作する
```

### 6-3. バランステスト

```bash
# COM同士の自動対戦でバランスを確認
pnpm run balance-test

# 確認項目:
# - ビギナー vs マニアック: マニアック勝率85%以上
# - 同難易度同士: 勝率45-55%
# - 1試合の平均得点: 1-3点程度
# - 先攻/後攻の勝率差: 55%未満
```

---

## Phase 7: デプロイ（1週間）

### 7-1. ステージング環境へのデプロイ

```bash
# 1. Workers をステージングにデプロイ
wrangler deploy --env staging

# 2. フロントエンドをステージングにデプロイ
wrangler pages deploy dist/ --project-name=fcms-staging
```

### 7-2. 本番環境へのデプロイ

```bash
# 1. Workers を本番にデプロイ
wrangler deploy --env production

# 2. フロントエンドを本番にデプロイ
wrangler pages deploy dist/ --project-name=fcms

# 3. カスタムドメインの設定（Cloudflareダッシュボードで）
# - Workers: api.manics.example.com
# - Pages: manics.example.com

# 4. R2にアセットをアップロード
wrangler r2 object put fcms-assets/board/board_mobile.png --file=assets/board/board_mobile.png
wrangler r2 object put fcms-assets/board/board_pc.png --file=assets/board/board_pc.png
# （全アセットを同様にアップロード）
```

### 7-3. 動作確認

```
□ 本番URLでタイトル画面が表示される
□ COM対戦が最後まで動作する
□ スマホでの操作が問題ない
□ PCでの操作が問題ない
□ WebSocket通信が安定している
□ BGM/SEが正しく再生される
```

---

## トラブルシューティング

### Claude Codeがエラーを出す場合

```
エラーの内容をそのままClaude Codeに貼り付けて、
「このエラーを修正してください」と伝える。
仕様書の該当箇所を指定すると精度が上がる。
例: 「docs/fcms_spec_v3.md の§7-2に基づいて修正してください」
```

### テストが通らない場合

```
失敗したテストの出力をClaude Codeに見せて、
「このテストが通るように修正してください。
 仕様は docs/fcms_spec_v3.md の§7-3です」と伝える。
```

### Cloudflareのデプロイが失敗する場合

```
エラーメッセージをClaude Codeに見せて、
「wrangler.toml の設定を修正してください」と伝える。
```

---

## Claude Codeへの指示のコツ

1. **仕様書の章番号を必ず指定する**
   - ✕「シュートの処理を作って」
   - ◎「docs/fcms_spec_v3.md の§7-2（シュート判定チェーン）に基づいてsrc/engine/shoot.tsを作ってください」

2. **1回の指示で1ファイル〜3ファイルに留める**
   - ✕「全部一気に作って」
   - ◎「まずsrc/engine/types.tsとsrc/engine/dice.tsを作ってください」

3. **テストを先に書かせてから実装させる**
   - 「まずテストを書いて、次にテストが通る実装を書いてください」

4. **エラーはそのまま貼り付ける**
   - Claude Codeはエラーメッセージから問題を特定できる

5. **「仕様書と違う」と指摘する**
   - 「仕様書ではΩ=18ですが、コードでは15になっています。修正してください」

---

*本手順書はゲーム仕様書v10、技術要件書v2.2、UI設計書v1.1、COM AI設計書v3.1、アセットリストを前提に作成。*
