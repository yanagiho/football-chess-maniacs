# Football Chess ManiacS (FCMS) — Claude Code ガイド

## プロジェクト概要

HEXグリッド上で行うサッカー×チェス型ボードゲーム（TypeScript）。
仕様書: `docs/fcms_spec_v3.md`(v11) / コスト帯シミュレーション表: `docs/piece_allocation.md` / UI仕様: `docs/ui_spec.md`(v3.0) / COM AI設計: `docs/com_ai_spec.md` / 編成画面仕様: `docs/formation-spec.md`

---

## ディレクトリ構成

```
src/
├── data/
│   └── hex_map.json          # 22×34 flat-top HEX グリッド（748 エントリ）
├── engine/                   # ゲームエンジン（判定式・ターン処理）
│   ├── types.ts              # 全型定義（Piece, Order, GameEvent, TurnResult …）
│   ├── dice.ts               # 判定式: effectiveDiff / calcProbability / judge / calcZocModifier
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
├── ai/                       # COM AIエンジン（ルールベース + Gemma）
│   ├── evaluator.ts          # §4 局面評価（盤面スコアリング）
│   ├── legal_moves.ts        # §5 合法手生成（全コマの合法手列挙）
│   ├── rule_based.ts         # ルールベース最善手選択（フォールバック）
│   ├── prompt_builder.ts     # §2 難易度別プロンプト生成（ビギナー/レギュラー/マニアック）
│   ├── gemma_client.ts       # §9-1 Workers AI (Gemma) 呼び出し（タイムアウト制御）
│   ├── output_parser.ts      # §9-3 Gemma出力のパース＋検証
│   ├── fallback.ts           # §9-4 フォールバック制御（障害パターン別対応）
│   ├── com_ai.ts             # §1-1 統合COM AIクラス（安全層→判断層→検証層）
│   ├── index.ts              # 全モジュール再エクスポート
│   └── bootstrap/            # §3 ブートストラップパイプライン
│       ├── auto_play.ts      # ルールベースAI同士の自動対戦
│       ├── data_extract.ts   # 盤面→指示ペアの抽出（JSONL）
│       └── run.ts            # 10,000試合実行スクリプト
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
    ├── App.tsx               # ルート（ページ遷移 + gameMode + formationData + authToken管理）
    ├── main.tsx              # エントリポイント（React.StrictMode）
    ├── index.html            # HTMLテンプレート
    ├── types.ts              # クライアント型定義（GameMode, FormationData, WsMessage, MAX_ROW等）
    ├── pages/
    │   ├── Title.tsx          # タイトル画面
    │   ├── ModeSelect.tsx     # モード選択（ranked/casual/com → onSelectMode）
    │   ├── TeamSelect.tsx     # チーム選択
    │   ├── Formation.tsx      # 編成画面v2（→onFormationConfirmでApp.tsxへデータ引継ぎ）
    │   ├── Matching.tsx       # マッチング待機（COM: 1秒即遷移 / Online: WS接続+キュー参加）
    │   ├── Battle.tsx         # 対戦画面（processTurn接続済・演出・ゴールリスタート・flipY）
    │   ├── HalfTime.tsx       # ハーフタイム
    │   ├── Result.tsx         # 結果画面
    │   └── Replay.tsx         # リプレイ画面
    ├── components/
    │   ├── board/
    │   │   ├── HexBoard.tsx   # HEXボード（背景画像+Canvas+DOM §6-1、flipY座標反転対応）
    │   │   ├── PieceIcon.tsx  # コマアイコンSVG（ui_spec v1.2 §6-1: ランク表記/枠装飾/敵味方色）
    │   │   ├── Piece.tsx      # コマ表示ラッパー（PieceIcon + PA外警告/交代マーク）
    │   │   ├── Overlay.tsx    # Canvas: 移動矢印(白)/ドリブル矢印(緑)/パスライン/シュート線/ZOC/ゾーン境界
    │   │   └── Controls.tsx   # ズーム/パン（ピンチ/ホイール/中クリック）
    │   ├── ui/
    │   │   ├── Timer.tsx      # ターンタイマー（60秒カウントダウン、プログレスバー、(M:SS)形式）
    │   │   ├── ActionBar.tsx  # スマホ: アクションバー（ドリブル/パス/シュート/交代/確定）+ベンチスライドアップ
    │   │   ├── SidePanel.tsx  # PC: 左パネル(§3-4)+右パネル(§3-5)
    │   │   └── PresetButtons.tsx # プリセット行動（§2-7）※Battle.tsxからは未使用（廃止）
    │   └── minigame/
    │       ├── FKGame.tsx     # FKミニゲーム（§4-1）
    │       ├── CKGame.tsx     # CKミニゲーム（§4-2）
    │       └── PKGame.tsx     # PKミニゲーム（§4-3）
    ├── hooks/
    │   ├── useWebSocket.ts    # WebSocket通信（§7-2 upgrade認証、自動再接続）
    │   ├── useGameState.ts    # ゲーム状態管理（useReducer + APPLY_ENGINE_RESULT + NEXT_TURN + AT）
    │   └── useDeviceType.ts   # スマホ/PC判定
    └── data/
        └── hex_map.json       # HEX座標マップ（コピー）
```

---

## 実装済みの仕様

| モジュール | 対応仕様 | 状態 |
|---|---|---|
| hex_map.json | §5 ボード仕様（flat-top odd-q） | ✅ |
| dice.ts | §7 判定式の基礎（ランク帯システム・有効差） | ✅ |
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
| ユニットテスト | 判定式全体・統合 | ✅ 228 tests passing |
| worker.ts + api/* | Hono REST API + WebSocket | ✅ |
| durable/game_session.ts | §4-3 DO Hibernation + §7-2 WS認証 | ✅ |
| durable/matchmaking.ts | §4-2 シャード構成マッチメイキング | ✅ |
| middleware/* | §7-2 JWT + §7-3 バリデーション14項目 + §7-4 レート制限 | ✅ |
| wrangler.toml | DO/D1/KV/R2/Queues バインディング | ✅ |
| client/pages/* | 全9画面（タイトル〜リプレイ） | ✅ |
| client/components/board/* | HEXボード + PieceIcon SVGコマアイコン（§6-1 v1.2）+ flipY座標反転 | ✅ |
| client/components/ui/* | タイマー(60秒)・アクションバー(ドリブル/パス/シュート/交代)・パネル | ✅ |
| client/components/minigame/* | FK/CK/PK ミニゲーム（§4-1〜§4-3） | ✅ |
| client/hooks/* | WebSocket(マッチメイキング+ゲームセッション)・状態管理・デバイス判定 | ✅ |
| ai/evaluator.ts | §4 局面評価（ボール位置+配置+ZOC支配+得点差） | ✅ |
| ai/legal_moves.ts | §5 合法手生成（移動/ドリブル/パス/シュート/交代） | ✅ |
| ai/rule_based.ts | §1-3 ルールベースAI（フォールバック/ブートストラップ） | ✅ |
| ai/prompt_builder.ts | §2 難易度別プロンプト（ビギナー/レギュラー/マニアック + 7時代） | ✅ |
| ai/gemma_client.ts | §9-1 Workers AI呼び出し（500msタイムアウト） | ✅ |
| ai/output_parser.ts | §9-3 Gemma出力パース＋検証（コードブロック除去対応） | ✅ |
| ai/fallback.ts | §9-4 フォールバック制御（4障害パターン対応） | ✅ |
| ai/com_ai.ts | §1-1 統合COM AI（安全層→判断層→検証層パイプライン） | ✅ |
| ai/bootstrap/* | §3-1 Phase 1 自動対戦＋学習データ生成（JSONL出力） | ✅ |
| Formation.tsx | 編成画面v2（手持ちコマ制・プリセット6種・セーブスロット10枠・ミニピッチ配置・onFormationConfirm引継ぎ） | ✅ |
| COM対戦フロー | モード選択→即マッチング→バトル初期化→processTurn全判定→ターン進行 | ✅ |
| processTurn接続 | Battle.tsx→processTurn（Phase0〜3）でシュート/パスカット/タックル/ファウル/競合/オフサイド判定が動作 | ✅ |
| ゴール処理 | ゴール判定→スコア加算→GOAL!演出→初期配置リスタート→失点チームキックオフ | ✅ |
| Battle.tsx 演出 | KICK OFF / HALF TIME / SECOND HALF / FULL TIME / GOAL! のCSSアニメーション演出 | ✅ |
| Battle.tsx 実行 | APPLY_ENGINE_RESULT→2.5秒「実行」表示→NEXT_TURN、8秒安全タイムアウト | ✅ |
| Battle.tsx AT | 前後半各1〜3ターンのアディショナルタイム（ランダム決定、赤色表示） | ✅ |
| 試合時間表示 | 90分制サッカー風（3分刻み: 0:00〜42:00、45+N、45:00〜87:00、90+N）、残り持ち時間(M:SS)併記 | ✅ |
| ボール操作UI | ドリブル/パス/シュート自動判定、アクションガイドテキスト、キーボード(D/Q/W) | ✅ |
| flipY座標反転 | homeプレイヤーは常に下から上に攻める表示（HexBoard.tsx） | ✅ |
| オンラインWS | Matching→マッチメイキングWS、Battle→ゲームセッションWS、TURN_INPUT送信 | ✅（クライアント側実装済、テスト未実施） |

---

## 重要な実装ルール

### HEX グリッド（flat-top odd-q offset）
- 22 列（col 0-21）× 34 行（row 0-33）
- 奇数列は偶数列より下にオフセット
- ZOC = 隣接6HEX、ZOC2 = 外周12HEX

### 攻撃方向（重要）
- **home → row 33 方向に攻撃**（ball.ts: `GOAL_ROW.home = 33`）
- **away → row 0 方向に攻撃**（ball.ts: `GOAL_ROW.away = 0`）
- hex_map.json のゾーン名は絶対座標: row 0-5=ディフェンシブGサード, row 28-33=ファイナルサード
- homeのシュート可能ゾーン: ファイナルサード/アタッキングサード（row 22-33）
- awayのシュート可能ゾーン: ディフェンシブGサード/ディフェンシブサード（row 0-11）
- **画面表示**: 両プレイヤーとも自分の画面では下から上に攻める（homeはflipY=trueでrow→33-rowに反転表示）
- **AIの方向計算はhexDistance（cube座標）ベースを使用**（odd-q offsetのrow差ベースは非対称になるため禁止）
- **キックオフ時の配置制約**: 各チーム自陣のみ（home: row 0〜16、away: row 17〜33）。ハーフライン = row 16
- **ハーフタイム後**: 両チーム初期フォーメーションにリセット。awayがキックオフ（前半はhome）

### 判定式（ランク帯システム）
```
(effectiveDiff(x, y) + 3) × Ω + ポジション修正 + ZOC隣接修正
```
- **生のコスト差（x - y）ではなく有効差（effectiveDiff）を使用**
- 結果は 0〜100 にクランプ
- **全ポジション修正は必ず重ねて適用**（守備修正 + 攻撃/パサー修正の両方）
- 例: VO守備(+10) vs MF パサー(-10) → 修正合計 0

### ランク帯システム（effectiveDiff）
- **低ランク帯**: コスト 1, 1.5
- **中ランク帯**: コスト 2, 2.5
- **高ランク帯**: コスト 3
- **有効差ルール**:
  - 同コスト（1vs1, 2vs2, 3vs3, 1.5vs1.5, 2.5vs2.5）→ 0
  - 異ランク帯（1vs2, 1vs3, 1.5vs2, 2vs3 等）→ ±1
  - 同ランク帯の0.5差（1vs1.5, 2vs2.5）→ ±2（最大）
- **設計意図**: 0.5の課金が同ランク帯ミラーマッチで最大効果。異ランク帯差は一律1でポジション修正等で覆せる

### フェーズ処理（processTurn）
- **フェーズ0**: スナップショット取得（移動前位置を記録）
- **フェーズ1**: 移動（ZOCマップで停止判定→競合→タックル→ファウル）
- **フェーズ2**: ボール処理（シュート判定チェーン→パス配送→パスカット1・2）
- **フェーズ3**: オフサイド判定（**スナップショット位置**で判定）
- **COM対戦ではBattle.tsxから直接processTurnを呼び出し**、全判定が実行される

### オフサイド
- 受け手のスナップショット(移動前)位置で判定
- **オフサイドライン = max(ハーフライン, max(守備側GK除外最後方FP, ボール位置))**（攻撃方向がrow増加の場合）
- GKを除外して最も自陣ゴールに近いFPの位置が基準
- ハーフライン制約: 自陣ではオフサイドにならない
- ボール制約: ボールより後ろではオフサイドにならない
- diff ≥ 2: 確定オフサイド
- diff = 1: グレーゾーン（50%判定）
- diff ≤ 0: オンサイド

### ファウル優先
- タックル成功後にファウルが成立した場合、**タックルを無効化してFK/PKを与える**
- イベント順: `TACKLE` → `BALL_ACQUIRED(tackler)` → `FOUL`（ボールはドリブラーに戻る）

### COM AI構造（§1-1）
- **安全層**: 合法手生成（数学的に正確）+ 盤面評価 → 50ms以内
- **判断層**: Gemma推論（Workers AI）→ 300ms目標、500msタイムアウト
- **検証層**: 出力パース + 合法性チェック → 10ms以内
- フォールバック: Gemma障害時は自動でルールベース最善手に切替（プレイヤー影響ゼロ）
- モデルID: 環境変数 `AI_MODEL_ID` から取得（コード変更なしにモデル入替可能）

### ブートストラップ（§3-1）
- `npm run bootstrap`: ルールベースAI同士で10,000試合を自動実行
- 出力: `training_data/` にJSONL形式（1試合180レコード ≈ 合計180万レコード）
- 性能: 53ms/試合（直列12.5時間、`--offset` で複数プロセス並列可）
- バランス検証済: Home 24.8% / Away 24.0% / Draw 51.2%, 平均3.52点/試合（※ランク帯システム導入前のデータ。再検証が必要）

### ターン構成
- **1ターン = 60秒**
- **前半**: ターン1〜15 + AT（1〜3ターン、ランダム）
- **ハーフタイム**: 前半AT終了後（3秒演出→初期配置リセット→awayキックオフで後半開始）
- **後半**: ターン16〜30 + AT（1〜3ターン、ランダム）
- **合計**: 30〜36ターン
- **試合時間表示**: 90分制サッカー風（1ターン=3分刻み）。前半: 0:00〜42:00、AT: 45+1/45+2/45+3。後半: 45:00〜87:00、AT: 90+1/90+2/90+3。残り持ち時間は小さく(M:SS)で併記
- AT中は表示が赤色

### 対戦画面の演出
- **KICK OFF**: 試合開始時、下からスライドイン + 「1st Half」
- **HALF TIME**: 前半終了時、スケールイン + スコア表示（金色）
- **SECOND HALF**: ハーフタイム後、スケールアウト→初期配置リセット→awayキックオフ→後半開始
- **FULL TIME**: 試合終了時、スケールイン + 振動 + スコア + 「結果を見る」ボタン
- **GOAL!**: ゴール時、金色テキスト + スコア表示（2秒）→両チーム初期配置リスタート→失点チームキックオフ
- **Turn X**: 通常ターン切替のフラッシュ（1.2秒）
- **実行**: ターン確定後→「実行」バナー表示（2.5秒）→次ターン。resolving中はタイマー停止+確定ボタン無効。8秒安全タイムアウト

### COM対戦フロー
- モード選択で`com`を選択 → App.tsxの`gameMode` stateに保存
- Matching.tsxでCOM時は1秒後に`onMatchFound(comMatchId)`で即座にBattle画面へ遷移
- Battle.tsxでCOM時は`INIT_MATCH` dispatchでゲーム状態をクライアント側で初期化（サーバー不要）
- **COM AIターン処理の流れ**:
  1. `handleConfirm` → プレイヤー命令を `clientOrderToEngine` でエンジン形式に変換
  2. `generateRuleBasedOrders` でaway命令生成（エンジンOrder互換）
  3. `EngineBoard` 構築（フィールドコマのみ）
  4. **`processTurn(board, homeOrders, awayOrders, boardContext)` 実行** — Phase0〜3で全判定
  5. `hasGoal()` でゴール判定 → スコア加算
  6. `enginePiecesToClient()` でクライアント形式に戻す
  7. `APPLY_ENGINE_RESULT` dispatch → resolving状態
  8. 2.5秒後: ゴール時は`GOAL!`演出(2秒) → `createGoalRestartPieces` で初期配置リスタート → `NEXT_TURN`、ゴールなしは直接 `NEXT_TURN`
- **React.StrictModeの注意**: useEffectにrefガードを入れるとStrictModeで2回目のmount時にeffectが実行されない。タイマー系のuseEffectではrefガードを使わないこと

### ボール操作UI
- **ボール非保持者タップ → 移動先HEXタップ → 移動命令**
- **ボール保持者タップ → HEXタップで自動判定**:
  - 味方コマがいる → パス
  - シュートゾーン（home: row≥22, away: row≤11）→ シュート
  - それ以外 → ドリブル
- **明示モード**: ドリブル(D), パス(Q), シュート(W) キー/ボタンで切替
- アクションガイドテキストが画面下部に表示

### フォーメーション → バトル引継ぎ
- Formation.tsx → `onFormationConfirm(FormationData)` → App.tsxのstate → Battle.tsxのprop
- `FormationData = { starters: FormationPiece[], bench: FormationPiece[] }`
- Battle.tsx: `createInitialPieces(formationData)` でhomeチーム配置、awayはデフォルト4-4-2

### PieceIcon（コマアイコン ui_spec v1.2 §6-1）
- パス: `src/client/components/board/PieceIcon.tsx`
- 使い方: `<PieceIcon cost={2} position="DF" side="ally" selected hasBall />`
- 味方=青(#2563EB)、敵=赤(#DC2626)。中央にランク表記（1/1+/2/2+/SS）
- 枠装飾: コスト1=なし, 1.5=銅, 2=銀, 2.5=金, 3=金+大型(72px)
- 選択時は黄色枠点滅。ボール保持はSVGサッカーボール
- **全コマ表示をPieceIconに統一**（Piece.tsx, HexBoard.tsx, Formation.tsx）

### コマ・チーム編成
- 全ポジション共通でコスト5段階（1/1.5/2/2.5/3）。8ポジション×5コスト＝40種類/時代、7時代×40＝全280枚
- **スタメン11枚**（GK1+FP10）、コスト上限16、ベンチ9枚（コスト制限なし）、合計20枚
- **選手交代**: 3回の機会（1回に複数人OK）、合計5人まで。交代後もコスト16以内
- **初期チーム**: コスト1のみ11枚（GK×1, DF×4, MF×4, FW×2）。ベンチなし。SB/VO/OM/WGは未所持

### 編成画面（Formation.tsx v2）
- 手持ちコマから選んでスタメン・サブに配置する方式
- フォーメーションプリセット6種: 4-4-2 / 3-5-2 / 3-6-1 / 4-3-3 / 4-2-3-1 / 3-4-3
- カードグリッド: ポジション8種フィルター、使用中=半透明、コスト超過=グレーアウト
- セーブスロット: 1〜10番号固定、`isPremium` フラグで課金切替（デフォルトtrue）
- ミニピッチ上にコマを視覚配置、タップでHEXスナップ移動（`percentToHex` 逆変換）
- 「マッチング開始」で `onFormationConfirm` 経由でApp.tsxへデータ引継ぎ

### オンライン対戦（クライアント側実装済、E2Eテスト未実施）
- **Matching.tsx**: ranked/casual時に `/match/ws` へWebSocket接続、`JOIN_QUEUE` 送信、`MATCH_FOUND` で遷移
- **Battle.tsx**: `/match/:matchId/ws` へWebSocket接続、`TURN_INPUT` 送信、`TURN_RESULT`/`INPUT_ACCEPTED`/`RECONNECT` 等を処理
- サーバー側は全て実装済み（Matchmaking DO / GameSession DO / API）
- `wrangler dev --local` + `npm run dev` の並列起動でオンライン対戦テスト可能

---

## テスト

```bash
npm test              # vitest run（全228テスト）
npm run test:watch
npm run dev           # Vite dev server（localhost:5173）
npm run bootstrap:small  # AI自動対戦テスト（10試合）
```

### テスト上の注意点
- モック: `vi.mock('../dice', async () => ({...actual, judge: vi.fn()}))`
- テストデータの列順: `[positionA, costA, positionB, costB, expected]`（位置と cost は交互）
- ポジション修正テストの expected 値は**全修正を適用した結果**であること
- オフサイド統合テストの守備コマは **pass コース・FW移動経路と別の列に配置**（ZOC干渉を避けるため）

### COM対戦の動作確認
1. `npm run dev` でフロントエンド起動
2. ブラウザで `http://localhost:5173` にアクセス
3. 対戦する → COM対戦 → チーム選択 → フォーメーション → マッチング開始
4. 1秒後にバトル画面に遷移、「KICK OFF」演出 → HEXボード上にコマ22枚が表示
5. コマをタップして命令を出す → 「✓ ターン確定」→「実行」2.5秒 → 次ターン
6. ゴール時: 「GOAL!」演出 → 初期配置リスタート → 失点チームキックオフ
7. 前半15ターン+AT → 「HALF TIME」演出 → 「SECOND HALF」→ 後半15ターン+AT → 「FULL TIME」→ 結果画面
8. Consoleログ: `[Battle] COM init` → `[Battle] processTurn: N events` → `[Battle] GOAL! home scores` 等

---

## 設定ファイル

- `package.json`: `"type": "module"`, vitest ^2.1.0, TypeScript ^5.5.0
- `tsconfig.json`: target ES2022, module ESNext, moduleResolution bundler, jsx react-jsx, strict
- `vitest.config.ts`: globals: false, environment: node
- `vite.config.ts`: root=src/client, React plugin, 出力=dist/
