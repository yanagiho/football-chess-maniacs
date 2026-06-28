# Football Chess ManiacS (FCMS) — Claude Code ガイド

## プロジェクト概要

HEXグリッド上で行うサッカー×チェス型ボードゲーム（TypeScript）。
仕様書: `docs/fcms_spec_v3.md`(v12) / コスト帯シミュレーション表: `docs/piece_allocation.md` / UI仕様: `docs/ui_spec.md`(v3.1) / COM AI設計: `docs/com_ai_spec.md` / 編成画面仕様: `docs/formation-spec.md`

---

## ディレクトリ構成

```
src/
├── data/
│   └── hex_map.json          # 22×34 flat-top HEX グリッド（748 エントリ）
├── migrations/
│   └── 0001_initial.sql      # D1初期スキーマ（matches/teams/user_pieces/user_ratings）
├── engine/                   # ゲームエンジン（判定式・ターン処理）
│   ├── types.ts              # 全型定義（Piece, Order, GameEvent, TurnResult …）
│   ├── hex_utils.ts          # HEXマップ共通ユーティリティ（hexLookup/ゾーン/BoardContext）
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
│   ├── ai_context.ts         # AI共有コンテキスト型（AiContext, DiffConfig）
│   ├── evaluator.ts          # §4 局面評価（盤面スコアリング）
│   ├── legal_moves.ts        # §5 合法手生成（全コマの合法手列挙）
│   ├── rule_based.ts         # ルールベースAI オーケストレーター（AiContext作成→各AI呼出）
│   ├── ball_holder_ai.ts     # ボール保持コマAI（シュート→パス→中継→ドリブル優先度）
│   ├── formation_ai.ts       # フォーメーション制御AI（3ライン・プレス・攻守移動）
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
│   ├── game_session_helpers.ts # DO型定義・定数・純粋関数（GameState, WsAttachment等）
│   ├── com_ai_integration.ts # COM AI統合（Gemma 5sタイムアウト + ルールベースフォールバック）
│   └── matchmaking.ts        # マッチメイキングDO（リージョンシャード）
├── api/
│   ├── auth.ts               # プラットフォーム認証・Webhook
│   ├── team.ts               # チーム編成CRUD（D1）
│   ├── match.ts              # マッチング・セッション接続・COM対戦DO作成
│   ├── ai.ts                 # AI APIエンドポイント（/api/ai/test, /api/ai/turn）
│   └── replay.ts             # リプレイ取得（R2）
├── middleware/
│   ├── jwt_verify.ts         # JWT検証（JWKS）
│   ├── crypto_utils.ts       # timingSafeEqual + MATCH_ID_PATTERN（共通セキュリティユーティリティ）
│   ├── rate_limit.ts         # レート制限（KV）
│   └── validation.ts         # 入力バリデーション（§7-3 全14項目）
└── client/                   # React フロントエンド（Cloudflare Pages）
    ├── App.tsx               # ルート（ページ遷移 + gameMode + formationData + authToken管理）
    ├── main.tsx              # エントリポイント（React.StrictMode）
    ├── index.html            # HTMLテンプレート
    ├── types.ts              # クライアント型定義（GameMode, FormationData, WsMessage, MAX_ROW等）
    ├── pages/
    │   ├── Title.tsx          # タイトル画面
    │   ├── ModeSelect.tsx     # モード選択（ranked/casual/com/comVsCom → onSelectMode）
    │   ├── TeamSelect.tsx     # チーム選択
    │   ├── Formation.tsx      # 編成画面v2（→onFormationConfirmでApp.tsxへデータ引継ぎ）
    │   ├── Matching.tsx       # マッチング待機（COM: クライアント即遷移 or サーバーDO作成 / Online: WS接続+キュー参加）
    │   ├── Battle.tsx         # 対戦画面（processTurn接続済・演出・ゴールリスタート・flipY）
    │   ├── Battle/
    │   │   ├── battleUtils.ts # Battle用純粋関数・定数・型（createInitialPieces等）
    │   │   ├── CeremonyLayer.tsx # 試合演出オーバーレイ（KICK OFF/HALF TIME/FULL TIME、GOAL!はGoalCeremonyに委譲）
    │   │   └── GoalCeremony.tsx # リッチGOAL演出（チームカラー別カットイン: 集中線/カラーバンド/GOOAL!スラム/フラッシュ/紙吹雪canvas/スコアバウンド）
    │   ├── HalfTime.tsx       # ハーフタイム
    │   ├── Result.tsx         # 結果画面
    │   └── Replay.tsx         # リプレイ画面
    ├── components/
    │   ├── board/
    │   │   ├── HexBoard.tsx   # HEXボード（背景画像+Canvas+DOM §6-1、flipY座標反転対応）
    │   │   ├── PieceIcon.tsx  # コマアイコン（PNGトークン画像 + SVGオーバーレイ: 選択リング/バッジ/ボール）
    │   │   ├── Piece.tsx      # コマ表示ラッパー（PieceIcon + PA外警告/交代マーク）
    │   │   ├── Overlay.tsx    # Canvas: 移動矢印(白)/ドリブル矢印(緑)/パスライン/シュート線/ZOC/ゾーン境界
    │   │   ├── overlay_renderers.ts # Canvas描画レイヤー関数（ボール軌跡・フェーズエフェクト）
    │   │   └── Controls.tsx   # ズーム/パン（ピンチ/ホイール/中クリック）
    │   ├── ui/
    │   │   ├── Timer.tsx      # ターンタイマー（60秒カウントダウン、プログレスバー、(M:SS)形式）
    │   │   ├── ActionBar.tsx  # スマホ: アクションバー（ドリブル/パス/シュート/交代/確定）+ベンチスライドアップ
    │   │   └── SidePanel.tsx  # PC: 左パネル(§3-4)+右パネル(§3-5)
    │   └── minigame/
    │       ├── FKGame.tsx     # FKミニゲーム（§4-1）
    │       ├── CKGame.tsx     # CKミニゲーム（§4-2）
    │       └── PKGame.tsx     # PKミニゲーム（§4-3）
    ├── hooks/
    │   ├── useWebSocket.ts    # WebSocket通信（§7-2 upgrade認証、自動再接続）
    │   ├── useGameState.ts    # ゲーム状態管理（useReducer + APPLY_ENGINE_RESULT + NEXT_TURN + AT）
    │   └── useDeviceType.ts   # スマホ/PC判定
    ├── utils/
    │   └── pieceAssetPath.ts  # コマPNG画像パス導出（getPieceAssetPath: position/cost/side → /assets/pieces/*.png）
    ├── i18n/                  # 多言語化基盤（ShootOutDiceプレイブック移植・7言語対応）
    │   ├── index.ts           # i18n器本体（t / tn / setLocale / detectInitialLocale / lookupPlural / SUPPORTED_LOCALES / LOCALE_NATIVE_NAMES / 永続化）
    │   ├── ja.ts              # 日本語辞書（正本・401キー）
    │   ├── en.ts en/ko/es/pt/de/zh-CN.ts # 各言語辞書（機械訳ドラフト・ja完全パリティ401キー）
    │   ├── _new_locale.ts     # 言語追加用テンプレ（コピー元）
    │   ├── useLocale.ts       # React結線フック（setLocaleで再レンダ）
    │   ├── LanguageSelect.tsx # 言語切替プルダウン（SUPPORTED_LOCALESから自動生成・即反映）
    │   └── __tests__/i18n.test.ts # 全7言語キーパリティ + tn()複数形 + ko/zh-CN tn検証 + 教訓1フォールバック
    └── data/
        └── hex_map.json       # HEX座標マップ（コピー）
scripts/
├── generate_seed.ts           # CSV → piece_master_seed.sql 生成
├── piece_master_seed.sql      # 200人INSERT文（生成済み）
└── extract_all_tokens.py      # トークン画像抽出スクリプト
public/
└── assets/pieces/             # コマトークンPNG 80枚（{ally|enemy}_{pos}_{rank}.png）
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
| ユニットテスト | 判定式全体・統合・E2E・AIモジュール・フロントエンド・i18n | ✅ 608 tests passing |
| worker.ts + api/* | Hono REST API + WebSocket | ✅ |
| durable/game_session.ts | §4-3 DO Hibernation + §7-2 WS認証 + processTurn統合 + ハーフタイム/AT/ゴールリスタート | ✅ |
| durable/matchmaking.ts | §4-2 シャード構成マッチメイキング | ✅ |
| middleware/* | §7-2 JWT + §7-3 バリデーション14項目 + §7-4 レート制限 | ✅ |
| wrangler.toml | DO/D1/KV/R2/Queues バインディング | ✅ |
| client/pages/* | 全9画面（タイトル〜リプレイ） | ✅ |
| client/components/board/* | HEXボード + PieceIcon PNGトークン画像（§6-1）+ SVGオーバーレイ + flipY座標反転 | ✅ |
| client/components/ui/* | タイマー(60秒)・アクションバー(ドリブル/パス/シュート/交代)・パネル | ✅ |
| client/components/minigame/* | FK/CK/PK ミニゲーム（§4-1〜§4-3） | ✅ |
| client/hooks/* | WebSocket(マッチメイキング+ゲームセッション)・状態管理・デバイス判定 | ✅ |
| ai/evaluator.ts | §4 局面評価（ボール位置+配置+ZOC支配+得点差） | ✅ |
| ai/legal_moves.ts | §5 合法手生成（移動/ドリブル/パス/シュート/交代） | ✅ |
| ai/rule_based.ts | フォーメーション維持型AI（3ライン制御・2手パスルート・プレス守備） | ✅ |
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
| FK/PKミニゲーム結果判定 | ゾーン対決ロジック実装、ゴール時スコア加算+リスタート、失敗時GKボール獲得 | ✅ |
| CKミニゲーム結果判定 | 3ゾーン攻守コスト対決、2ゾーン以上勝利で攻撃側ボール獲得 | ✅ |
| GKシュートコース判定 | isOnShootCourse: GK自身+ZOCがshootPathと交差する場合のみセーブ判定 | ✅ |
| 後半キックオフ演出 | kickoff2nd演出フェーズ追加、「KICK OFF / 2nd Half」表示後に後半開始 | ✅ |
| キックオフランダム化 | 1st Halfのキックオフ側を50/50ランダム決定、2nd Halfは逆チーム | ✅ |
| タイマー視認性改善 | フォント18-20px+bold、半透明黒背景、残15秒で赤、残10秒でパルスアニメ | ✅ |
| 操作不能時暗転 | INPUTフェーズ以外でピッチにrgba(0,0,0,0.45)オーバーレイ（ミニゲーム/終了時除外） | ✅ |
| オフサイド即時表示 | パス飛行直後にOFFSIDE!を表示（Phase4から Phase3に移動、1ターン遅延感を解消） | ✅ |
| リプレイ安全タイマー修正 | 正常完了時にclearReplayTimers()で安全タイマー解除（二重NEXT_TURN防止） | ✅ |
| ボール軌跡改善 | ドリブル軌跡をPhase0後に段階表示、Phase3でパス/シュート軌跡を段階追加 | ✅ |
| COM AI書き直し | フォーメーション維持型（3ライン制御・2手パスルート・プレス守備） | ✅ |
| バグ修正（全26件） | エンジン(4件)+AI(6件)+クライアント(5件)+サーバー(4件)+Medium(7件) | ✅ `22efcb4` |
| GameSession DOエンジン統合 | processTurn呼び出し、PieceInfo変換、ゴール検出、ファウル通知 | ✅ |
| GameSession DOゲームロジック | 初期盤面生成(4-4-2)、ハーフタイム遷移、AT(1-3)、ゴールリスタート、試合終了 | ✅ |
| ブートストラップ30-36ターン対応 | auto_play.tsをMAX_TURNS=90→30-36に修正、ハーフタイム位置修正 | ✅ |
| バランス検証（1000試合） | Home 24.0% / Away 26.2% / Draw 49.8%, 2.68点/試合 | ✅ |
| away側統合テスト | awayファウル(FK/PK)、awayシュート、awayパス配送 | ✅ |
| オンラインE2Eエンジンテスト | RawOrder変換→processTurn→ボード更新→複数ターン連続の完全フロー | ✅ |
| AI難易度システム | rule_based.tsにdifficulty対応（beginner/regular/maniac）、App→Battle→AI伝播 | ✅ |
| ミニゲームCOM AI | FK/PK GKゾーン選択を学習型AIに変更（プレイヤー傾向分析+難易度別精度） | ✅ |
| ミニゲーム結果フィードバック | FK/PK: キッカーvsGKゾーン対比表示、CK: 3ゾーン勝敗詳細表示 | ✅ |
| CenterOverlay改行対応 | whiteSpace:pre-lineでsubTextの\n改行をサポート | ✅ |
| Workers AI統合 | wrangler.toml AI binding + AI_MODEL_ID env var + wrapAiBinding adapter | ✅ |
| AI APIエンドポイント | POST /api/ai/test (サービスキー必須デバッグ) + POST /api/ai/turn (COM対戦) | ✅ |
| AIモジュールユニットテスト | output_parser(20) + fallback(15) + prompt_builder(24) + com_ai(11) + evaluator(16) + rule_based(11) + legal_moves(7) = 104テスト | ✅ |
| Gemmaプロンプトトークン計測 | 初期盤面4,854chars / 実合法手7,500-7,800chars（Gemma 12B 8192トークン上限内） | ✅ |
| サーバーサイドCOM対戦フロー | POST /match/com → GameSession DO /init → WS接続 → COM AI生成（Gemma+フォールバック） | ✅ |
| COM対戦セッション認証 | comSessionToken(crypto.randomUUID) でWS認証、レート制限付き | ✅ |
| output_parser shoot target補完 | zone のみ出力時に合法手の targetHex でゴール座標を補完 | ✅ |
| generateComOrders 外側タイムアウト | 5秒 Promise.race ガード（Workers AIハング時のDOブロック防止） | ✅ |
| fallback 空orders対応 | validCount=0 で全面フォールバック（partial_fillにならない） | ✅ |
| COM観戦モード（COM vs COM） | モード選択→即マッチング→両チームAI自動操作→演出付き自動進行→結果画面 | ✅ |
| コードレビュー修正（2026-04-20） | エンジン4件+AI3件+クライアント4件+サーバー6件 = 計17件修正（下記「2026-04-20修正」参照） | ✅ |
| リファクタリング（2026-04-21） | Phase1: Battle.tsx/rule_based/game_session/Overlay分割、Phase2: hex_utils共通化・コード品質改善、Phase3: テスト追加(152件新規、350→502) | ✅ |
| セキュリティ・堅牢性修正（2026-04-22） | timingSafeEqual抽出・DO transaction化・matchIdバリデーション・レート制限改善・WS二重接続防止 等24件（下記「2026-04-22修正」参照） | ✅ |
| テスト追加（2026-04-22） | crypto_utils(14)+rate_limit(5)+ball throughPass(2) = 21件新規（502→523） | ✅ |
| フロントエンドテスト（2026-04-22） | battleUtils純粋関数37件（clampToOwnHalf/passRange/shootZone/matchTime/formation/stats/mvp）（523→560） | ✅ |
| WebSocket upgradeバグ修正（2026-04-22） | secureHeaders/CORSがWS 101レスポンスのimmutableヘッダーに書き込み500エラー → upgradeリクエストでスキップ | ✅ |
| WebSocket E2Eライブテスト（2026-04-22） | wrangler dev接続テスト8件: COM対戦フロー/3ターン連続/PING/不正トークン/不正JSON/nonce重複/sequence検証（`LIVE_E2E=1`で実行） | ✅ |
| E2Eテスト拡充（2026-04-22） | フルマッチ完走テスト（`FULL_MATCH=1`）+ 切断→再接続RECONNECTテスト（8→10件） | ✅ |
| .gitignore作成（2026-04-22） | node_modules/dist/training_data/src/.wrangler/.dev.vars/.env/.env.local/*.log | ✅ |
| D1マイグレーション（2026-04-22） | 0001_initial.sql: matches/teams/user_pieces/user_ratings テーブル + インデックス | ✅ |
| Cloudflareデプロイ（2026-04-22） | Workers/DO(new_sqlite_classes)/D1/KV/R2/Queue/AI 本番反映（football-chess-maniacs.yanagiho.workers.dev） | ✅ |
| コマPNG画像差し替え（2026-04-24） | PieceIcon.tsxをSVGプレースホルダーからPNGトークン画像に差し替え。getPieceAssetPath()ヘルパー追加、SVGオーバーレイ（選択リング/バッジ/ボール）維持、style幅サイズ上書き対応 | ✅ |
| ショップ インゴット制（2026-06-04） | コマはインゴット（ゲーム内通貨）で購入。インゴットはプラットフォーム決済で購入→Webhookでウォレット加算。価格はコスト帯別1〜3インゴット（pieceCostToIngots）。下記「ショップ/インゴット」参照 | ✅ |
| createGoalKickPieces テスト（2026-06-04） | ゴールキック後処理の純粋関数テスト5件追加（22枚生成/守備GKがボール保持/away守備GK/座標重複なし/守備コマ自陣） | ✅ |
| インゲーム操作改善（2026-06-04） | パスモード時の盤面ハイライト追加（味方=青リング/スルーパス空きHEX=シアン/シュートゾーン=赤）、パス/シュート中は移動範囲を抑制、ボール保持コマのパス/ドリブルメニュー大型化+対象コマ黄リング強調。下記「インゲーム操作（v3.2）」参照 | ✅ |
| 初回3ターンチュートリアル（2026-06-04, issue #3） | COM対戦の初回プレイのみ Turn 1=移動 / 2=パス / 3=シュート のガイドを順に表示。localStorage `fcms_tutorial_done` で既読管理し2回目以降スキップ。comVsCom非表示 | ✅ |
| リッチGOAL演出（2026-06-11） | `GoalCeremony.tsx` 新規。得点チームカラー別カットイン（集中線/カラーバンド/GOOAL!スラム/フラッシュ/紙吹雪canvas/スコアバウンド）。`SoundManager.playGoalCelebration()` 歓声スウェル追加。`GOAL_CEREMONY_MS` 2000→2600ms。下記「対戦画面の演出」参照 | ✅ |
| GOAL演出スコア表示修正+タメ/退場（2026-06-11） | 演出中に加点前スコアが表示される回帰を修正（`goalCelebration` state でスナップショット伝播、型は `GoalCelebrationInfo`）。タメ（暗転320ms→着弾、歓声スウェルも同期）と退場アニメ（終了220ms前に文字フレームアウト）を追加 | ✅ |
| タックル着弾バースト（2026-06-11） | `board/ImpactBurst.tsx` 新規（中イベント層）。タックル成功=白リング+金スパーク(impact)、競合=灰の土煙(dust)。`phaseEffects` に `burst?: 'impact'\|'dust'` を追加し、HexBoardがOverlay(Canvas)とは別にDOMで該当HEX位置に約0.6秒再生。flipY対応はdisplayPhaseEffects経由で自動。`prefers-reduced-motion` 時は非表示 | ✅ |
| 多言語化i18n基盤 フェーズ1/3/4（2026-06-18） | ShootOutDiceプレイブック移植。`src/client/i18n/`設置（`STORAGE_KEY='fcms.locale'`）。クライアント全画面のベタ書き日本語 約400文字列を`t()`/`tn()`でキー化（表示は日本語で不変）。en辞書を完全パリティ(401キー)で作成、複数形14キーを`tn()`の`.one/.other`対応。回帰テスト10件追加。詳細は下記「多言語化（i18n）」参照 | ✅ |
| 多言語化i18n フェーズ6/7（2026-06-19） | フェーズ6: `LanguageSelect.tsx`新規（`SUPPORTED_LOCALES`から自動生成、`setLocale`即反映、`SettingsScreen`の言語選択置換、`SettingsContext.language`削除でlocale一元化）。フェーズ7: ko→es/pt/de/zh-CNの順で残り5言語追加（計7言語）、全辞書ja完全パリティ401キー（機械訳ドラフト注記付き）、複数形なし言語(ko/zh-CN)は`.one/.other`同一文字列。`LOCALE_NATIVE_NAMES`追加。テスト+2（ko/zh-CN tn検証）+全言語プレースホルダ照合。詳細は下記「多言語化（i18n）」参照 | ✅ |
| Unity版3ルール移植（2026-06-28, `3481b1a`） | `BATTLE_DELAY`(自陣3ターン保持→相手GKへ強制移譲) / `PASSIVE_TACTICS`(自陣深部9枚以上→翌ターンのpass/tackleに+10) / freeBall offside(スルーパス由来フリーボールのOS追跡)。エンジン〜クライアント〜i18n結線。ペナルティ"効果"テスト3件追加。**閾値(9/3)・補正(+10)は出典欠如の暫定値**。`docs/unity_football_chess_rules.md`は参照資料 | ✅ |
| 対人対戦3ブロッカー修正（2026-06-28, `f2e11c8`/`e5f55ef`） | ①Hibernationで手消失: `turnInputs`をインメモリMap→`GameState`永続化。②編成未反映: `createBoardFromFormation`新設、`handleInit`がD1 `teams.field_pieces`をロードしコスト/座標を盤面反映(awayミラー)、得点/HT再生成にも使用、未指定は4-4-2フォールバック。③レーティング未永続: 孤立していた`server/rating.ts`を結線、queueで`persistRatings`(Elo+W/L/D UPSERT)、matchmakingはD1の`getRating`(サーバー権威)。テスト計19件追加 | ✅ |
| ShopScreen価格ロジック統一（2026-06-28, `3481b1a`） | `pieceCostToIngots`/`costToDisplay`をローカル再定義から正本(`types/piece.ts`)importに統一（サーバー`api/shop.ts`とのドリフト防止） | ✅ |
| オンライン最後の1マイル（2026-06-28, `8fc5c94`） | Matching: JOIN_QUEUEで実teamId送信(resolveActiveTeamId)→編成反映が完結。rating申告は0(サーバーD1値で上書き)。game_session: player_idを`attachment.userId`で上書き(なりすまし防止+空player_id解消) | ✅ |
| 選手交代の実装（2026-06-28, `d4becd7`） | `substitute`を型のみ→実処理化。エンジンに`Order.benchPieceId`/`Board.bench`/`SubstitutionEvent`/`applySubstitutions`(フェーズ-1,座標・ボール継承)追加(テスト4件)。クライアントCOMで機能(bench配線/isBench再構築/回数ガード`MAX_SUBSTITUTIONS`/SidePanelログ7言語)。DO経路はbench読込が残課題 | ✅ |

---

## 重要な実装ルール

### HEX グリッド（flat-top odd-q offset）
- 22 列（col 0-21）× 34 行（row 0-33）
- 奇数列は偶数列より下にオフセット
- ZOC = 隣接6HEX、ZOC2 = 外周12HEX

## ドキュメント構成
- `docs/fcms_spec_v3.md` — コアゲーム仕様(v12)
- `docs/platform_integration_spec.md` — プラットフォーム連携実装仕様(§10)
- `docs/com_ai_spec.md` — COM AI設計仕様
- `docs/formation-spec.md` — 編成画面仕様
- `docs/ui_spec.md` — UI仕様(v3.1)
- `docs/piece_allocation.md` — コスト帯シミュレーション表
- `docs/lore/` — 世界観・ナラティブ資産:
  - `the_archive.md` — The Archive 世界観設定書
  - `characters_200.csv` / `characters_200.md` — 200人マスター名簿(全Era統合)
  - `naming_guidelines.md` — 命名ガイドライン(File No.規則、ISO国コード)
  - `piece_image_prompts.md` — キャラ画像生成プロンプト集

### ショップ/インゴット（2026-06-04）
- **2通貨モデル**: コマはインゴット（ゲーム内通貨）で購入。インゴット自体はプラットフォーム決済で購入。
- **コマ価格**: コスト帯別 1〜3 インゴット（`pieceCostToIngots`: 低=1 / 中=2 / 高=3。`src/types/piece.ts`）
- **インゴット購入**: `POST /api/shop/ingots` → プラットフォーム `/v1/commerce/purchase` を呼び `checkout_url` を返す。SKU は `fcms_ingots_standard/plus/mega`（`INGOT_SKU_AMOUNTS` = 5/12/30、要プラットフォームカタログ整合）
- **加算経路**: Platform決済完了 → `entitlement.created` Webhook（`POST /webhook/purchase`、HMAC検証+冪等化）→ `user_wallets.ingots` に加算（インゴットは consumable のため revoke 無視）
- **コマ購入**: `POST /api/shop/purchase`（サーバー権威）— `user_wallets` をガード付き減算（`ingots >= price`）→ `user_pieces_v2` に付与。付与失敗時はインゴット返金。残高不足は 402、所持済みは 409
- **残高管理は FCMS の D1**: マイグレーション `0003_ingot_wallet.sql`（`user_wallets` テーブル）。本番反映には `wrangler d1 migrations apply` が必要
- **クライアント**: `ShopScreen.tsx`（`authToken` prop）— `/api/shop/wallet` で残高、`/api/shop/catalog` でカタログ取得。コマ購入ボタン `◆N`、「+ インゴットを購入」で checkout_url へ遷移
- **未検証（ユーザー指示で課金検証は後回し）**: 実プラットフォーム接続/JWT付きE2E、インゴットパック数量・SKU名のプラットフォームカタログ整合

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

### ZOC隣接修正（全判定共通ルール）
- **全判定で統一**: 味方（守備側）が多い → 有利（+）、敵（攻撃側）が多い → 不利（-）
- `getZocAdjacency(coord, attackTeam, pieces)` で算出。`attackCount`=攻撃チーム数、`defenseCount`=守備チーム数
- **タックル**: 攻撃側-10 / 守備側+5（Ω=18）
- **パスカット1**: 攻撃側-5 / 守備側+10（Ω=15）
- **パスカット2**: 攻撃側-5 / 守備側+20（Ω=10）
- **シュートブロック**: 攻撃側-5 / 守備側+10
- **GKセーブ**: 攻撃側-5 / 守備側+10
- **シュート成功**: 攻撃側+5 / 守備側-10（シューター視点のため逆）

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

### シュート判定チェーン（§7-2）
- **シュートコース**: `hexLinePath(shooter.coord, goalCoord)` — shooter→ゴール中央(col=10)のHEX直線。**`hexLinePath`はfromを含まない**ため`.slice(1)`は不要（以前のバグを修正済み）
- **② ブロック**: `findBlockerOnPath(shootPath)` — shootPath上のHEXが守備コマのZOC内にあるか（最初の1体のみ）
- **③ GKセーブ**: `isOnShootCourse(gk, shootPath)` — **GK自身のHEXまたはGKのZOC(隣接6HEX)がshootPathと交差する場合のみ**セーブ判定。コース外GKはnull扱い
- **③ 距離修正**: `(distanceToGk - 2) × 5` — 遠距離ほどGKに反応時間があるためセーブ容易（至近=最難、遠距離=容易）
- **① コース修正**: `calcShootCourseModifier(defenderCountInShooterZoc)` — シューターZOC内の守備コマ1体につき-15%
- **④ シュート成功**: `shooter.cost × 5 + 70 + 距離修正 + ZOC修正 + コース修正` — ゴール距離が遠いほど成功率低下
- **6ゾーンはエンジンに存在しない** — ミニゲームUIのみの概念

### FK/PK/CKミニゲーム
- **FK**: 6ゾーン選択+直接/ロブ。同ゾーン=GKセーブ（キッカーコスト依存でパワー突破可能）
- **PK**: 6ゾーン選択。FKと同様のゾーン対決。PK成功率はFKより高め
- **COM GK AI**: プレイヤーの過去ゾーン選択を`comGkHistory`に蓄積し、頻出ゾーンに重みをかけて抽選。難易度でsharpness（読み精度）が変化（beginner=0.3/regular=1.0/maniac=1.5）。最初の2回は中央寄りバイアス
- **結果フィードバック**: FK/PK結果時にキッカーvsGKのゾーン対比を表示（「GK読み的中!」/「GKは逆方向!」）。CK結果時に3ゾーンの攻守コスト対決詳細を表示
- **CK**: 3枚選択→ニア/中央/ファーに1枚ずつ配置。各ゾーンで攻守コスト対決。2ゾーン以上勝利で攻撃側ボール獲得
- **共通**: タイムアウト時はデフォルト補完して自動送信（FK/PK: 中央下、CK: 高コスト順+ニア→中央→ファー）。ミニゲーム遷移時にreplaySafetyTimerをクリア
- **FK/PK isAttacker/isKicker**: ファウルされた側(`tacklerId`から逆算)が攻撃側

### COM AI構造（§1-1）
- **安全層**: 合法手生成（数学的に正確）+ 盤面評価 → 50ms以内
- **判断層**: Gemma推論（Workers AI）→ 300ms目標、500msタイムアウト
- **検証層**: 出力パース + 合法性チェック → 10ms以内
- フォールバック: Gemma障害時は自動でルールベース最善手に切替（プレイヤー影響ゼロ）
- モデルID: 環境変数 `AI_MODEL_ID` から取得（コード変更なしにモデル入替可能）

### ルールベースAI（rule_based.ts）— フォーメーション維持型
- **3ライン制御**: GK / DFライン(DF,SB) / MFライン(VO,MF,OM) / FWライン(FW,WG) の行動範囲を定義。攻撃時・守備時でシフト
- **ライン行動範囲（attackDepth: 0=自陣ゴール, 33=敵陣ゴール）**:
  - GK: 0-3（常時）
  - DF/SB: 攻撃3-18 / 守備3-13
  - VO/MF: 攻撃12-24 / 守備8-18
  - OM: 攻撃14-28 / 守備10-20
  - FW/WG: 攻撃16-32 / 守備14-22
- **攻撃モード**（味方がボール保持）:
  - ボール保持コマ: シュート→前方パス→**中継パス(2手ルート)**→ドリブル(ライン範囲内・ZOC外優先)→横パス→待機
  - 非保持コマ: ポジション別ステップ数で前進 + 横に広がってパスコース作成（固まらないスコアリング）
- **守備モード**（敵がボール保持）:
  - プレス役(FW/WG/OMから最大2体)が敵ボールに向かう
  - DF/SBは自陣ゴール前で横一列のラインを形成（均等配置スコアリング）
  - MF/VO/OMは自陣方向に1-2HEX後退、横に広がる
  - FW/WGはセンターライン付近に留まりカウンターに備える
- **2手パスルート**: A→B→C の中継パスを事前計算。直接パスが通らない時に横の味方を経由（B→C距離はdifficultyで変化）
- **難易度パラメータ（diffConfig）**: `RuleBasedInput.difficulty` で動作を分岐
  - **beginner**: シュート距離5HEX、プレス1体、25%でstay、上位3手からランダム選択、中継パス距離6HEX
  - **regular**: シュート距離7HEX、プレス2体、最善手選択、中継パス距離8HEX（デフォルト）
  - **maniac**: シュート距離9HEX、プレス3体、ZOC考慮パスブロック、中継パス距離12HEX、横パス優先（テンポ維持）
- App.tsx → Battle.tsx（`comDifficulty` prop）→ `generateRuleBasedOrders({ difficulty })` の経路で伝播
- **移動先重複防止**: `usedTargets` セットで2体が同じHEXに移動指示しない
- **selectBallHolderOrder/selectFormationOrdersは別ファイル**（ball_holder_ai.ts/formation_ai.tsに分離、AiContextで状態を共有）
- COM対戦ではBattle.tsxの`handleConfirm`内で`generateRuleBasedOrders`を呼び出し、プレイヤーの命令と同時にprocessTurnで処理

### ブートストラップ（§3-1）
- `npm run bootstrap`: ルールベースAI同士で10,000試合を自動実行
- 出力: `training_data/` にJSONL形式（1試合180レコード ≈ 合計180万レコード）
- 性能: 38ms/試合（直列6.3時間、`--offset` で複数プロセス並列可）
- バランス検証済（2026-04-12 大規模検証）: Home 24.0% / Away 26.2% / Draw 49.8%, 平均2.68点/試合（1000試合、34ms/試合）

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
- **GOAL!**（`GoalCeremony.tsx`）: ゴール時、得点チームカラー別のリッチカットイン（回転集中線 + スキューしたカラーバンド + `GOOAL!`スラム文字 + チームカラーのフラッシュ + canvas紙吹雪3箇所バースト + スコアバウンド）。`ceremony === 'goal'` で `CeremonyLayer` が早期returnして委譲。`soundManager.playGoalCelebration()` 歓声スウェル付き（2.6秒）→両チーム初期配置リスタート→失点チームキックオフ
  - シーケンス: タメ（暗転フェードインのみ `TAME_MS=320ms`）→着弾（フラッシュ/バンド/スラム/歓声爆発。歓声は `playGoalCelebration` の `delaySec=0.32` で同期）→紙吹雪→退場（終了 `EXIT_MS=220ms` 前から文字が右へ抜け帯が収縮）
  - スコアは `goalCelebration` state（`GoalCelebrationInfo`: team + 加点後スコアのスナップショット）で伝播。stateの加点（`SET_BOARD`）は演出後のため、演出中も正しい新スコアを表示する。通常ゴール（`goalScoredRef.scorerTeam`）とCKゴール（`attackTeam`）の2経路。FK/PK（プレイヤー操作/COM vs COM）ゴールは従来通り `showOverlay('GOAL!!')` のまま（ceremony非経由）
  - `prefers-reduced-motion` 対応（アニメ抑制）。カメラズーム/シェイクはHexBoard側未対応のため未実装
- **Turn X**: 通常ターン切替のフラッシュ（1.2秒）
- **実行**: ターン確定後→「実行」バナー表示（2.5秒）→次ターン。resolving中はタイマー停止+確定ボタン無効。8秒安全タイムアウト

### COM対戦フロー（2パス構成）

#### パス1: クライアントサイドCOM（デフォルト）
- matchIdが `com_` で始まる。サーバー不要、全処理がブラウザ内で完結
- Matching.tsxで1秒後に`onMatchFound(comMatchId)`で即座にBattle画面へ遷移
- Battle.tsxで`INIT_MATCH` dispatchでゲーム状態をクライアント側で初期化
- `VITE_USE_GEMMA=true` の場合は `POST /api/ai/turn` でGemma AIを呼び出し、失敗時はルールベースにフォールバック
- **COM AIターン処理の流れ**:
  1. `handleConfirm` → プレイヤー命令を `clientOrderToEngine` でエンジン形式に変換
  2. Gemma有効時: `fetchGemmaOrders()` → 失敗時 `generateRuleBasedOrders({ difficulty: comDifficulty })` にフォールバック
  3. Gemma無効時: `generateRuleBasedOrders({ difficulty: comDifficulty })` でaway命令生成
  4. **`processTurn(board, homeOrders, awayOrders, boardContext)` 実行** — Phase0〜3で全判定
  5. `hasGoal()` でゴール判定 → スコア加算
  6. `APPLY_ENGINE_RESULT` dispatch → resolving状態

#### パス2: サーバーサイドCOM（`VITE_USE_GEMMA=true` 時）
- matchIdが `gemma_com_` で始まる。GameSession DOが全処理を管理
- **フロー**: Matching.tsx → `POST /match/com` → GameSession DO `/init`（isComMatch=true）→ WS接続 → `TURN_INPUT` 送信 → DO内で `generateComOrders`（Gemma AI + ルールベースフォールバック）→ `TURN_RESULT` 配信
- **認証**: `crypto.randomUUID()` でセッショントークン生成、`comSessionToken` でWS認証（推測不能）
- **トークン伝搬**: `/match/com` → `{token}` → `onMatchFound(matchId, team, token)` → `App.tsx comAuthToken` → `Battle.tsx authToken` → WS `?token=`
- **外側タイムアウト**: `generateComOrders` に5秒の `Promise.race` ガード（Workers AIハング時のDOブロック防止）
- サーバー接続失敗時はクライアントサイドCOMにフォールバック

- **React.StrictModeの注意**: useEffectにrefガードを入れるとStrictModeで2回目のmount時にeffectが実行されない。タイマー系のuseEffectではrefガードを使わないこと

#### COM観戦モード（COM vs COM）
- `GameMode = 'comVsCom'`。モード選択画面に「COM観戦」ボタン
- `isComVsCom = gameMode === 'comVsCom'`、`isCom` も true になる
- **フロー**: ModeSelect → 難易度選択 → Matching（即マッチ）→ Battle（両チーム自動操作）→ Result
- **自動ターン進行**: INPUTフェーズに入ると300ms後に `handleConfirm()` を自動呼び出し
- **両チームAI**: home側も `generateRuleBasedOrders({ myTeam: 'home' })` で命令生成
- **ミニゲーム自動解決**: FK/PK/CK発生時、UIを表示せず即座にランダムゾーン対決で解決
- **オーバーレイ蓄積防止**: Turn X 表示をスキップ、TURN_START遅延を500msに短縮
- **ハーフタイム自動スキップ**: 交代パネルを即スキップ（`setHalftimeReady(true)` を即実行）
- **comGkHistory保護**: COM vs COM 時はランダム選択を学習履歴に記録しない
- **Gemma無効**: comVsComでは`VITE_USE_GEMMA`設定に関わらず常にクライアントサイドCOM
- **結果画面**: 「もう一度」ボタンは`matching`画面に直接遷移（編成をスキップ）

### ボール操作UI
- **ボール非保持者タップ → 移動先HEXタップ → 移動命令**
- **ボール保持者タップ → HEXタップで自動判定**:
  - 味方コマがいる → パス
  - シュートゾーン（home: row≥22, away: row≤11）→ シュート
  - それ以外 → ドリブル
- **明示モード**: ドリブル(D), パス(Q), シュート(W) キー/ボタンで切替
- アクションガイドテキストが画面下部に表示

### インゲーム操作（v3.2 — 2026-06-04 ハイライト強化）
- **パスモード時の盤面ハイライト**（`Battle.tsx` で算出 → `HexBoard.tsx`/`Overlay.tsx` で描画）:
  - `passTargetHexes`（青リング+薄青）: パス可能な味方コマ（`getAccuratePassRange` 以内）
  - `throughPassHexes`（シアン）: スルーパス可能な空きHEX（pass range内、シュートゾーン除外）
  - `shootRangeHexes`（赤）: シューターがシュートゾーンにいる場合のゴール周辺。パスモード中も表示
  - パス/シュートモード中は移動範囲（緑 `highlightHexes`）を抑制して情報を絞る
  - 全ハイライトは `flipY`（home視点反転）対応（HexBoard内で `displayXxxHexes` に変換）
- **ボール保持コマのパス/ドリブルメニュー**（`HexBoard.tsx` ballActionMenu）:
  - [⚽パス][🏃ドリブル] 大型ボタン（116×58px, 19px, 2行）、対象コマに黄色グローリングを表示してメニューの所属を明示
  - メニュー位置はコマ上 -96px（上端はみ出し時は下 +64px）、HexBoard transform内・z-index 200
- **初回3ターンチュートリアル**（`Battle.tsx` `TUTORIAL_STEPS`）:
  - COM対戦の初回プレイのみ。Turn 1=コマ移動 / Turn 2=パス（青リング誘導）/ Turn 3=シュート のガイドを CenterOverlay で順に表示
  - `tutorialActiveRef`（mount時に `isCom && !isComVsCom && localStorage 'fcms_tutorial_done' !== '1'` で判定）。3ターン目表示で既読フラグ書込み→以降スキップ
  - チュートリアルターンは INPUT 遷移を 2800ms に延長（読む猶予）。comVsCom では非表示

### フォーメーション → バトル引継ぎ
- Formation.tsx → `onFormationConfirm(FormationData)` → App.tsxのstate → Battle.tsxのprop
- `FormationData = { starters: FormationPiece[], bench: FormationPiece[] }`
- Battle.tsx: `createInitialPieces(formationData)` でhomeチーム配置、awayはデフォルト4-4-2

### PieceIcon（コマアイコン — PNGトークン画像）
- パス: `src/client/components/board/PieceIcon.tsx`
- 使い方: `<PieceIcon cost={2} position="DF" side="ally" selected hasBall />`
- **PNG画像トークン**: `public/assets/pieces/{side}_{pos}_{rank}.png` — 80枚（ally/enemy × 8ポジション × 5ランク）
- `getPieceAssetPath(position, cost, side)` でパス導出（`src/client/utils/pieceAssetPath.ts`）
- コスト→ランク: 1→cost1, 1.5→cost1plus, 2→cost2, 2.5→cost2plus, 3→ss
- SVGオーバーレイ: 選択時黄色リング点滅、未命令パルス、命令済みバッジ、ボールインジケーター
- `style={{ width, height }}` でサイズ上書き可能（img/SVGとも親divに追従）
- デフォルトサイズ: コスト1-2.5=64px、コスト3(SS)=72px
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
- **サーバーサイドCOM**: `POST /match/com` → GameSession DO作成 → WS接続（`gemma_com_` prefix で判別）
- サーバー側は全て実装済み（Matchmaking DO / GameSession DO / API）
- `wrangler dev --local` + `npm run dev` の並列起動でオンライン対戦テスト可能

### 多言語化（i18n）（2026-06-18 フェーズ1/3/4 → 2026-06-19 フェーズ6/7完了）
- **基盤**: `src/client/i18n/`（ShootOutDiceの「i18n移植プレイブック v1.0」を移植）。前提構成 React+TS。**Steam想定7言語（ja/en/ko/es/pt/de/zh-CN）対応済み**
- **i18n器**: `index.ts` — `t(key, params?)` / `tn(key, count, params?)`（複数形）/ `setLocale` / `getLocale` / `addLocaleListener` / `detectInitialLocale`（localStorage→ブラウザ言語→ja）/ `initLocale`（`main.tsx`で起動時呼出）。永続化キー `STORAGE_KEY='fcms.locale'`。`Dict = Record<string,string>`（フラットなキー→文字列）。`SUPPORTED_LOCALES` + `LOCALE_NATIVE_NAMES`（自称表記マップ: 日本語/English/한국어/Español/Português/Deutsch/简体中文）で言語を一元管理（言語追加時は import + `SUPPORTED_LOCALES` + `DICTS` + `LOCALE_NATIVE_NAMES` + `detectInitialLocale`のprefix分岐の5箇所追記）
- **教訓1（最重要）**: `lookupPlural()` は「同一ロケール内で `.variant → .other → root` まで試し切ってから初めて FALLBACK_LOCALE(ja) に落ちる」。これにより複数形なし言語(ko/zh-CN)への日本語混入を防ぐ。**この順序を崩さないこと**
- **キー命名**: 画面・機能でプレフィックス分割（`common.*` / `course.*`（ゴール方向ラベル共通化）/ `action.*` / `mode.*` / `difficulty.*` / `rank.*` / `title.*` / `battle.*` / `formation.*` / `fk.* pk.* ck.*` 等）。補間は `{var}` 形式
- **複数形**: countable名詞×数値は `tn('key', count, params)` を使用。辞書は `.one`/`.other` を持つ（ja は単複同形）。14キーが対象（例 `battle.opponent_disconnected` / `sub.remaining_players_post` / `*.countdown`）
- **原語固定（除外）**: 選手名・ポジション略称（ラテン文字でそもそも非対象）・`era: '現代'`（API送信値、Battle.tsx/Matching.tsx）。言語自称名は `LOCALE_NATIVE_NAMES` で管理（除外対象から外れた）
- **辞書**: `ja.ts`（正本・401キー、NATIVE-REVIEWED相当=原文）/ `en.ts` `ko.ts` `es.ts` `pt.ts` `de.ts` `zh-CN.ts`（いずれも**機械訳ドラフト**・ja完全パリティ401キー、各ファイル冒頭に `MACHINE-TRANSLATED DRAFT` 注記、公開前ネイティブレビュー必須）。`_new_locale.ts` が言語追加テンプレ。**複数形なし言語(ko/zh-CN)は `.one`/`.other` を同一文字列にしてキーパリティを維持**（教訓1の安全網はFAKEロケールでテスト）
- **言語切替UI（フェーズ6）**: `LanguageSelect.tsx`（`SUPPORTED_LOCALES`を`.map()`で自動生成するプルダウン、ラベルは`LOCALE_NATIVE_NAMES`）。`useLocale()`購読 → `onChange`で`setLocale()` → **リロード不要で全画面即反映** + localStorage永続化。`SettingsScreen.tsx`の言語選択を置換。**locale管理はi18nモジュールに一元化**（`SettingsContext`から`language`フィールドを削除。二重ソース解消）
- **React結線**: `useLocale.ts`（`useSyncExternalStore`でsetLocale購読→再レンダ）。`LanguageSelect`が使用
- **翻訳非依存ロジック**: バナー色等は翻訳文字列の `.includes()` 判定を禁止。Battle.tsxの切断バナー色は `disconnectBannerPositive` フラグで判定（`.includes('復帰')` から変更）
- **テスト**: `i18n/__tests__/i18n.test.ts`（12件）= ja/en キーパリティ / **全7 SUPPORTED_LOCALESのja基準パリティ（401キー）** / 複数形キーの`.one/.other`存在 / `tn()`単複選択 / **ko・zh-CN（複数形なし言語）の`tn()`で日本語混入しない実地検証** / 教訓1フォールバック（FAKEロケール模擬）。全7言語×全キーの`{var}`プレースホルダ照合もja基準でパス
- **未実施（今後）**: フェーズ5（shared層のerror code化、`error_codes_pattern.md`参照。shared層が薄いため優先度低）。全辞書のネイティブレビュー（機械訳ドラフト→公開前必須）

---

## テスト

```bash
npm test              # vitest run（全608テスト + 10 E2Eスキップ）
npm run test:watch
npm run dev           # Vite dev server（localhost:5173）
npm run bootstrap:small  # AI自動対戦テスト（10試合）

# WebSocket E2Eテスト（wrangler dev起動が必要）
cd src && npx wrangler dev --local  # Terminal 1
LIVE_E2E=1 npx vitest run src/online/__tests__/ws_e2e_live.test.ts  # Terminal 2
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

### COM観戦（COM vs COM）の動作確認
1. `npm run dev` でフロントエンド起動
2. モード選択 → **COM観戦** → 即座にマッチング → バトル画面
3. 両チームAIが自動操作。各ターン: Turn演出 → INPUT(500ms) → 自動確定 → 演出再生 → 次ターン
4. ハーフタイム: 交代パネル即スキップ → 後半自動開始
5. FULL TIME → 「結果を見る」ボタンクリック → 結果画面 → 「もう一度」で再マッチ
6. Consoleログ: `[Battle] COM vs COM home AI: strategy=...` + `[Battle] COM AI: strategy=...`

---

## 既知のバグ（2026-04-12 検出 → 2026-04-12 全修正済み）

全26件を `22efcb4` で修正。以下は修正内容の記録。

### Critical / High

#### エンジン
1. ~~ファウルゾーン判定が片側のみ~~ — ✅ `isAttackingThird`/`isInsidePA`に`attackingTeam`引数を追加、away攻撃方向に対応
2. ~~シュートコース修正が未使用~~ — ✅ `resolveShootChain`内で`calcShootCourseModifier`を呼び出し、④シュート成功チェックに`courseMod`を適用
3. ~~ルーズボール隣接判定が矩形8マス~~ — ✅ `hexDistance === 1`（HEX6マス）に修正
4. ~~スルーパス受け手検索がManhattan距離~~ — ✅ `hexDistance`に修正

#### AI
5. ~~`maxTurn=90`デフォルト値~~ — ✅ evaluator/rule_based/com_aiのデフォルトを36に修正
6. ~~リード/ビハインドで同一スコア~~ — ✅ ビハインド時を-20に変更（リード+20と区別）
7. ~~パスカット推定がoffset座標補間~~ — ✅ `hexLinePath`でパスコースを正確に生成
8. ~~ブロック確率がシューターZOCをチェック~~ — ✅ シュートコース上の守備ZOCをチェックする方式に修正
9. ~~Gemmaパス命令で`targetPieceId`未設定~~ — ✅ output_parser/rule_basedの両方で`targetPieceId`を設定
10. ~~PA範囲がエンジンと不一致~~ — ✅ col 4-17, row 0-5/28-33に修正

#### クライアント
11. ~~ゴールリスタートがハーフタイム交代を破棄~~ — ✅ `createGoalRestartPieces`が現在のコマ構成を保持して座標のみリセット
12. ~~CKミニゲームが常にhomeの駒を使用~~ — ✅ `ckAttackTeam`でフィルタするよう修正
13. ~~`onReady`が毎秒繰り返し発火~~ — ✅ firedフラグ+clearIntervalで1回のみ発火
14. ~~`onTimeout`が200msごとに繰り返し発火~~ — ✅ timeoutFiredフラグ+clearIntervalで1回のみ発火
15. ~~COM難易度選択スキップの可能性~~ — ✅ ModeSelectからモード引数を直接渡し、stale state依存を排除

#### サーバー
16. ~~GameSession DOに`/init`ルートなし~~ — ✅ `/init` POSTルートを追加（ゲーム状態初期化）
17. ~~DOアラーム上書き競合~~ — ✅ 既存アラームと比較して早い方を優先する方式に修正
18. ~~Webhookパス二重~~ — ✅ auth.tsのパスを`/webhook/purchase`→`/purchase`に修正
19. ~~チーム更新でコマ所持チェックなし~~ — ✅ PUT時にgetOwnedPiecesで検証を追加

### Medium

20. ~~matchRoutes認証なし公開~~ — ✅ `/match/*`の非WebSocketパスにJWT認証ミドルウェアを追加
21. ~~リプレイに参加者チェックなし~~ — ✅ replay.tsの全エンドポイントに参加者チェック追加
22. ~~`getOwnedPieces`フィルタバグ~~ — ✅ 200件チェックをfilter外に移動、超過時はエラースロー
23. ~~GKバリデーションなし~~ — ✅ POST/PUT時にGK1枚制約チェックを追加
24. ~~CKゾーン重複配置可能~~ — ✅ 同一ゾーンの既存コマを自動除去
25. ~~WebSocket onclose設定タイミング~~ — ✅ `onclose`を`onopen`外に移動、接続失敗時も再接続発火
26. ~~HMAC署名欠落時にバイパス~~ — ✅ 署名なしの場合はエラースローに変更

---

## コードレビュー修正（2026-04-20 全17件）

### エンジン（4件）
27. ~~`pickByHighestCost()` に空配列チェックなし~~ — ✅ `candidates.length === 0` で例外スロー
28. ~~`calcShootCourseModifier` の `|| 0` が冗長~~ — ✅ `=== 0 ? 0 :` で明示化（-0問題解消）
29. ~~パスカット1/2のZOC隣接修正符号がタックルと逆~~ — ✅ 攻撃側-5/守備側+10(cut1), -5/+20(cut2)に統一
30. ~~シュートチェーンのブロック/セーブZOC隣接で`defenseTeam`を渡していた~~ — ✅ `attackTeam`に修正（攻守カウント逆転バグ）

### AI（3件）
31. ~~`data_extract.ts` の `remaining_turns: 90 - turn.turn`~~ — ✅ `summary.totalTurns - turn.turn` に修正
32. ~~`prompt_builder.ts` の `has_ball: p.hasBall || undefined`~~ — ✅ 条件スプレッドに修正
33. ~~`validateAndFillGemmaOutput` + `GemmaOrder` が未使用~~ — ✅ デッドコード削除

### クライアント（4件）
34. ~~`HexBoard` に `isMobile={true}` がハードコード~~ — ✅ `isMobile={isMobile}` に修正
35. ~~`kickerPiece`/`gkPiece` の非null assertion~~ — ✅ `?? fieldPieces[0]` フォールバック追加
36. ~~COM vs COM でミニゲームUIが表示され自動進行停止~~ — ✅ FK/PK/CK即座自動解決実装
37. ~~COM vs COM でオーバーレイが蓄積~~ — ✅ Turn X オーバーレイをスキップ

### サーバー（6件）
38. ~~`hexToBytes()` が不正hex文字を0に変換~~ — ✅ 正規表現バリデーション追加
39. ~~`JSON.parse()` に try-catch なし（team.ts, replay.ts）~~ — ✅ エラーハンドリング追加
40. ~~`parseInt` に下限チェックなし（match.ts, replay.ts）~~ — ✅ `Math.max(0, ...)` 追加
41. ~~TURN_INPUT 型検証で `sequence`/`nonce`/`timestamp`/`client_hash` 未検証~~ — ✅ 全8フィールド検証追加
42. ~~`matchRoutes` が `/match` と `/api/matches` に二重マウント~~ — ✅ `/api/matches` を削除
43. ~~JWKS 並行フェッチ~~ — ✅ Promise再利用で防止

---

## セキュリティ・堅牢性修正（2026-04-22 全24件）

### セキュリティ（7件）
44. ~~timingSafeEqualが長さ差で早期returnしタイミングリーク~~ — ✅ XOR長さ比較+max長ループに修正、crypto_utils.tsに抽出
45. ~~matchIdバリデーションなし（match.ts, replay.ts）~~ — ✅ MATCH_ID_PATTERN（`/^[a-zA-Z0-9_\-]+$/`）でパストラバーサル防止
46. ~~レート制限anonymous共有バケット~~ — ✅ CF-Connecting-IP / X-Forwarded-For フォールバック追加
47. ~~WebSocket二重接続ガードにCONNECTING状態なし~~ — ✅ `WebSocket.CONNECTING` を追加
48. ~~Matching.tsxでonMatchFoundが二重発火~~ — ✅ matchedフラグで1回のみ発火
49. ~~auth.ts webhook JSON.parseがtry-catchなし~~ — ✅ エラーハンドリング+user_idバリデーション追加
50. ~~HMAC hexToBytes不正hex文字を0に変換~~ — ✅ 正規表現バリデーション追加（前回修正の再確認）

### DO堅牢性（4件）
51. ~~handleTurnInputにトランザクションなし~~ — ✅ `ctx.storage.transaction()`で原子的読み書き、resolveTurnはトランザクション外
52. ~~deserializeAttachmentのnullガードなし~~ — ✅ webSocketMessage/Close/Errorの3箇所にnullチェック追加
53. ~~DOアラーム上書き競合~~ — ✅ 既存アラーム比較で早い方を優先（前回修正の確認）
54. ~~COM sessionTokenの文字列比較がタイミング安全でない~~ — ✅ crypto_utils.tsのtimingSafeEqualを使用

### クライアント（5件）
55. ~~Timer onTimeoutのuseEffect依存配列にonTimeout~~ — ✅ useRefに格納してintervalリセット防止
56. ~~Timer振動が閾値超え後に毎秒発火~~ — ✅ refで1回のみ発火、閾値復帰時リセット
57. ~~useGameState throughPass距離計算がManhattan~~ — ✅ hexDistance（cube座標）に修正
58. ~~HexBoard hover flipRow変換~~ — ✅ 調査の結果不要と判断（hoverCoordは表示座標系で正しい）
59. ~~ball.ts スルーパスズレ先の敵取得がreduce~~ — ✅ Math.max+filter+random選択に修正

### コード品質（4件）
60. ~~team.ts ALLOWED_COLUMNS抽象化が過剰~~ — ✅ プレーンなコード+コメントに簡素化
61. ~~rate_limit.ts WebSocketRateLimiter capが到達不能~~ — ✅ filter前にcap(×5閾値)を配置
62. ~~relay passの候補ソートなし~~ — ✅ ball_holder_ai.tsで中継距離順ソート追加
63. ~~crypto_utils共通化~~ — ✅ timingSafeEqual+MATCH_ID_PATTERNをmiddleware/crypto_utils.tsに抽出、game_session/match/replayから参照

### テスト追加（4件）
64. timingSafeEqualテスト（14件）: 同一/空/UUID/異なる/長さ違い/日本語/prefix一致 + MATCH_ID_PATTERNバリデーション
65. WebSocketRateLimiterテスト（5件）: 10件許可/11件目拒否/3回連続超過warn/リセット/consecutiveExceedsリセット
66. スルーパス敵取得テスト（2件）: 最高コスト敵取得/LOOSE_BALL発生

### WebSocket upgrade修正（1件）
67. ~~secureHeaders/CORSがWS 101レスポンスのimmutableヘッダーに書き込み500エラー~~ — ✅ WebSocket upgradeリクエストでCORS/secureHeadersをスキップ

### WebSocket E2Eライブテスト（8件）
68. COM対戦フルフロー: セッション作成→WS接続→TURN_INPUT→INPUT_ACCEPTED→TURN_RESULT
69. 3ターン連続進行（COM AIルールベースフォールバック動作確認）
70. PING/PONG keepalive
71. 不正COMトークンで接続拒否
72. 不正JSON → ERRORレスポンス
73. 不明メッセージタイプ → ERRORレスポンス
74. nonce重複リプレイ攻撃 → INPUT_REJECTED
75. sequence非単調増加 → INPUT_REJECTED

---

## 設定ファイル

- `package.json`: `"type": "module"`, vitest ^2.1.0, TypeScript ^5.5.0
- `tsconfig.json`: target ES2022, module ESNext, moduleResolution bundler, jsx react-jsx, strict
- `vitest.config.ts`: globals: false, environment: node, jsdom for `src/client/**/__tests__/**`
- `vite.config.ts`: root=src/client, React plugin, 出力=dist/
- `wrangler.toml`: `[ai] binding = "AI"`, `AI_MODEL_ID = "@cf/google/gemma-3-12b-it"`, DO=`new_sqlite_classes`（Free plan必須）
- **本番URL**: `https://football-chess-maniacs.yanagiho.workers.dev`
- `VITE_USE_GEMMA=true`: クライアント側のGemma AI呼び出しを有効化（.env.localで設定）

---

## Platform認証の安全性メモ（2026-06-18 調査）

Platform認証はJWT（JWKS署名検証）+ サービスAPIキー + HMAC応答/Webhookで導入済み。実装箇所: `src/middleware/jwt_verify.ts` / `src/api/auth.ts` / `src/api/webhooks.ts` / `src/worker.ts`。

### 構成
- **JWT**: `Authorization: Bearer <token>` を `jwtMiddleware` で検証。`PLATFORM_JWKS_URL` から RSA 公開鍵をkid別キャッシュ（5分・並行フェッチ抑止）。`exp` 検証あり。WS は残2時間要求＋`expectedMatchPlayers` 一致確認
- **Platform API呼び出し**: `callPlatformApi` が `X-Service-API-Key` + レスポンス `X-HMAC-Signature` 必須検証。`hexToBytes` は不正hex拒否
- **Webhook**: `POST /webhook/purchase` で `X-Webhook-Signature: sha256=<hex>` の HMAC-SHA256 検証 + `X-Webhook-Delivery-Id` で冪等化（`webhook_deliveries_received` テーブル）

### 既知の改善余地（優先度付き）
> 注（2026-06-28 監査）: 旧🔴2件（`verifyJwt` の iss/aud/alg 検証 / Webhook冪等化のレースフリー化）は
> コミット `4367051` で**既に解消済み**（このメモ作成時点より新しい）。下記「良好な点」に移動した。

| 優先 | 項目 | 場所 |
|---|---|---|
| 🟠 | `callPlatformApi` に `AbortController` タイムアウト追加（Platformハング時のWorker詰まり防止） | `api/auth.ts:44-76` |
| 🟠 | `/match/com` POSTは非認証 + レート制限のみ → 匿名でのDO大量生成リスク。IP単位のDO生成キャップ強化 | `worker.ts:109-111` |
| 🟡 | Webhookにタイムスタンプ署名がある場合は5分窓のリプレイ防止を追加（現状 `delivery_id` 永続テーブル依存） | `api/webhooks.ts` |
| 🟡 | クライアントの `authToken` 取得・保管経路をドキュメント化（postMessage受領か localStorage 保管か未確認） | `App.tsx` / `ShopScreen.tsx` |
| 🟡 | インゴットは `entitlement.revoked` 無視（consumable仕様）→ 返金/チャージバック時に残高回収不可。運用許容か確認 | `api/webhooks.ts:82-95` |

### 良好な点
- **JWT iss/aud/alg(RS256) を明示検証**（`jwt_verify.ts:99,130,136-142`、kid必須・exp/nbf・clockSkew・WS用残2時間＋参加者照合、修正 `4367051`）
- **Webhook冪等化はレースフリー**（`webhooks.ts:77-97` の `INSERT OR IGNORE`→`changes=0`判定、修正 `4367051`）
- JWKS並行フェッチ抑止（`fetchingPromise` 再利用、修正 #43）
- `hexToBytes` の不正hex拒否（修正 #38, #50）
- Webhook HMAC欠落時に必ずエラー（修正 #26）
- `/match/*` の REST パスにJWT認証適用（修正 #20）
- WS upgrade時のCORS/secureHeadersスキップ（修正 #67）
- `timingSafeEqual` 共通化（修正 #44, #63）

---

## 全層監査と残課題（2026-06-28）

5並列エージェントで全層を深掘り調査。**COM対戦/COM観戦/COM AI/認証/ショップ/チームCRUDは本番品質で完成**。対人対戦の致命3件は本日修正済み（上記実装表参照）。詳細は memory `project_audit_2026_06_28`。

### 本日修正済み（対人対戦コア）
- ✅ Hibernationで手消失 / ✅ 編成未反映 / ✅ レーティング未永続（`f2e11c8`/`e5f55ef`）

### 残課題（優先度付き・主にオンライン経路。**E2E未検証**）
| 優先 | 項目 | 場所 |
|---|---|---|
| 🟠 | クライアントが `JOIN_QUEUE` で `teamId='default'` 固定送信。実teamIdを送れば編成反映が完結する（サーバー側は対応済み） | `client/pages/Matching.tsx:37-38` |
| 🟠 | オンライン対戦のWS送信が `player_id=''` / `client_hash=''`（盤面ハッシュ未実装）。サーバー統合とE2Eが未完 | `client/pages/Battle.tsx:1419-1423` |
| 🟠 | リプレイ視聴のデータ配線欠落（`setReplayTurns` 未呼出で常に空配列）。`/replays/:id/turn/:turn` は誰も書かず実質stub | `client/App.tsx:77` / `api/replay.ts` |
| ✅ | 選手交代: エンジン(applySubstitutions)+クライアントCOM経路で実装済み(`d4becd7`)。残: GameSession DOへの`teams.bench_pieces`読込 + remainingSubs減算 + 得点後リスタートの交代保持(DO/PvPはE2E未検証) | `game_session.ts` |
| 🟡 | Collection/Ranking/FriendMatch がモックデータ（API未接続） | `client/screens/*` |
| 🟡 | デッドコード整理: `pages/Result.tsx`・`pages/HalfTime.tsx`（到達不能）、`api/auth.ts` の `/purchase`（未マウント） | — |
| 🟡 | `public/assets/characters/`（PK/FKスプライト9枚）がgit未追跡・未参照。配線時に追加 | — |

### 構造的リスク
- `docs/fcms_spec_v3.md` は §7(判定式)/§8(数値) を「v9.2と同一のため省略」→ 判定式の実数値を検証できる権威ドキュメントが無く、**コードが唯一の真実源**。Unity移植の閾値/補正値も出典欠如の暫定値（`docs/unity_football_chess_rules.md` 自身が実値不明と明記）。spec未確定の値（foul forceFoul閾値等）は勝手に確定しない。

