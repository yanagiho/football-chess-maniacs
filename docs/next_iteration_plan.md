# FCMS 次期実装計画（判定の可視化 / チーム名 / 試合演出強化）

> 3つの独立した改善を1本にまとめた計画書。着手順はA→B→Cで確定済み。
> いずれも既存インフラの上に乗せる作業で、新規の大規模設計は不要。

---

## Phase A: 判定の「成功率」「なぜその結果か」の可視化（最優先） — ✅ 完了（2026-07-01）

A1/A2/A3すべて実装済み。テスト711件全通過・型チェッククリーン。
- A1: `SidePanel.tsx` `formatEvent()` に TACKLE/SHOOT/PASS_CUT/COLLISION の決定的checkの `probability` を「(成功率62%)」形式で追加表示
- A2: `engine/ball.ts` に `previewShootChainProbability()` を追加（シュート判定チェーンと同じ入力構築を再利用し判定は実行しない純粋関数）。ボール保持コマ選択中は常にPC/モバイル両方のシュートボタンラベルに「シュート 62%」を表示。事前プレビューはシュートのみに絞った（タックルは移動先確定前のZOC停止予測ロジックがクライアントに存在せず、追加コストが見合わないため見送り）
- A3: `JudgmentResult` に `breakdown?: ProbabilityBreakdown`（コンポーネントの汎用リスト形式: base/position/zoc/distance/course/gk_zoc）を追加。`dice.ts` に `calcProbabilityBreakdown()` を新設し `calcProbability()` はその薄いラッパーに整理（挙動不変）。SidePanelのログをタップすると内訳を展開表示
- i18nキー追加、全7言語パリティ維持

### 設計意図
タックル・シュート・パスカット等の判定は確率制だが、プレイヤーには成功率も判定理由も見えていない。
調査の結果、**エンジン側は`probability`/`roll`をすでに全判定結果に持っている**ため、
これはエンジン改修不要・クライアント表示のみで実現できる。

- `src/engine/types.ts`の`JudgmentResult`（`TackleResult`/`CollisionResult`/`ShootChainResult`の各サブ結果）は
  すでに`{ success, probability, roll }`を保持
- `SidePanel.tsx`の`formatEvent()`は現在この値を一切表示していない（`SHOOT`の`outcome`のみ参照）

### タスク

**A1. 判定結果ログに成功率と乱数を表示**
- `SidePanel.tsx`の`formatEvent()`を拡張し、TACKLE/FOUL/SHOOT/COLLISION/PASS_CUTの各イベントで
  `event.result.probability`（例:「成功率62%」）を表示に追加
- 受け入れ条件: 試合中のイベントログを見れば、各判定の成功率が分かる

**A2. アクション選択時の事前成功率プレビュー**
- `src/engine/dice.ts`の`calcProbability`/`calcZocModifier`、`src/engine/shoot.ts`の各chek関数は
  すべて純粋関数でクライアントからimport可能
- タックル/シュート等のアクションを選択した時点（実行前）に、対象への成功率をバッジ表示
  （`ActionBar.tsx`または`Overlay.tsx`のホバー/選択状態に連動）
- 受け入れ条件: プレイヤーがアクションを選ぶ前に、成功率のおおよそが見える

**A3. 判定内訳の可視化（ZOC修正・コスト差等）**
- 現状`JudgmentResult`は最終`probability`のみで、内訳（コスト差による基礎値・ZOC修正分）は保持していない
- 型を拡張するか、クライアント側でA2と同じ純粋関数を使い再計算して内訳を組み立てる
- SidePanelのイベント詳細（タップで展開等）に「コスト差+10 / ZOC修正-5 / 合計62%」のような内訳を表示
- 受け入れ条件: 気になる判定をタップすると、なぜその確率だったかの内訳が見える

---

## Phase B: 自作編成へのチーム名入力UI — ✅ 完了（2026-07-01）

`Formation.tsx` の Header にテキスト入力（最大16文字）を追加。確定時 `teamName.trim() || undefined` で
`FormationData.teamName` へ反映（空白のみ・未入力は既存の `resolveTeamName()`/`team.default_name` フォールバックに委ねる）。
i18nキー追加、全7言語パリティ維持。テスト711件全通過・型チェッククリーン（Formation.tsx自体はページコンポーネントで
本プロジェクトの既存テスト境界に倣い直接のUIテストは追加せず、抽出済み純粋関数のみテスト対象という方針を踏襲）。

### 設計意図
T1（`outgame_plan_v2.md`）でチーム識別情報（`teamName`/`teamEmoji`/`origin`）の型は追加済みだが、
自作編成時は「マイチーム」固定のデフォルト名のみで、プレイヤーが自由に名付けられない。

### タスク

**B1. 編成画面にチーム名入力欄を追加**
- `Formation.tsx`にテキスト入力欄を追加し、確定時に`FormationData.teamName`へ反映
- 未入力時は既存通り「マイチーム」にフォールバック
- 文字数制限・簡易バリデーション（空白のみ拒否等）を入れる
- 受け入れ条件: 編成画面でチーム名を入力・保存でき、マイページの自チームカードに反映される

---

## Phase C: 試合中の演出強化（ボール軌跡など） — C1/C2完了（2026-07-01）、C3〜C5は未着手

ユーザー判断で「C1+C2のみ実装」を採用（C3〜C5はブラウザ目視確認なしでの実装リスクを踏まえ保留）。
`FlyingBall.tsx`に進行方向の光の尾（C1: シュート42px/5px・スルーパス30px/4px・パス22px/3px・
ドリブルは軌跡なし）と、スルーパス（ロブ系の代表アクション）向けの山なり弧（C2: 内側divに
`fcms-ball-arc`キーフレームで-22pxのtranslateYピークを追加し、既存の位置遷移transformとは
独立したレイヤーで合成）を追加。`prefers-reduced-motion`時は新規追加分のみ無効化。
テスト711件全通過・型チェッククリーン。**ブラウザでの目視確認は未実施**（本環境では検証不可）。

### 現状（監査済み・二重実装を避けるため必ず確認）
- `FlyingBall.tsx`: パス/シュート/ドリブル時にボールが実際に飛ぶCSSアニメーションは実装済み（回転付き）
- `overlay_renderers.ts`の`renderBallTrails`: Canvas上に静的な軌跡線（色分け・点線・着地マーク）を同時描画
- `GoalCeremony.tsx` / `ImpactBurst.tsx`: ゴール演出・タックル/競合の着弾バーストは実装済み

→ 「軌跡が飛ぶ」自体はすでにあるので、**動きの質感を足す**方向で強化する。

### タスク（案・優先度は相談して決める）

**C1. ボール軌跡にモーションブラー/光の尾を追加**
- `FlyingBall`の移動中に、進行方向の光の尾（トレイル）をCSSまたはCanvasで追加
- シュート（速い）とパス（普通）で尾の長さ/強さを変える

**C2. ロブパス/スルーパスに弧を描かせる**
- 現状`FlyingBall`は直線移動のみ。ロブ系のアクションには放物線（CSSのtransform経由でy軸に山を作る）を追加

**C3. シュートの威力感演出**
- 強いシュート（コスト高/至近距離）でカメラの微振動・着地時の衝撃波リングを追加
- 既存`ImpactBurst`のパターンを流用可能

**C4. ドリブル時の砂煙/芝の跳ね返り**
- ドリブル移動時、足元に小さい砂煙エフェクトを追加（`ImpactBurst`の`dust`パターン流用）

**C5. その他アイデア（洗い出し用、実装は取捨選択）**
- パスカット成功時の火花エフェクト
- オフサイド判定時のライン表示演出
- コーナーキック/フリーキックのカメラズーム演出

**進め方の提案**: C1・C2（ボール自体の動きの質感）を先に固めて全体の手触りを底上げしてから、
C3以降（個別シーンの派手さ）に広げるのが効率的。

---

## Phase D: 動きの物理的説得力（2026-07-01追加） — ✅ 完了（2026-07-02）

> ユーザー指定の優先順位: D1（ボール軌跡）→ D2（コマ移動）の順で確定。

D1/D2とも実装済み。テスト724件全通過・型チェッククリーン。
- D1（`46b238e`）: `BallTrail`に`flight?: { startedAt, durationMs }`を追加し、Battle.tsxがパス/シュート/パスカットの
  軌跡push時に`flightDurationMs`（FlyingBallと同一の距離比例式・animSpeed込み）で刻印。`renderBallTrails`は進捗に
  応じてfrom→ボール現在位置まで線を補間描画し、終端マーカーは飛行完了時のみ描画。Overlayは飛行中の軌跡がある間
  だけ`requestAnimationFrame`で再描画し、飛行が終わればループ停止（静的描画のままでパフォーマンス維持）。
  reduced-motion時とflightなし軌跡（ドリブル等）は従来通り完成線を即時描画。純粋関数テスト6件追加
- D2（`afc95ce`）: `battleUtils.ts`に`calcPieceMoveDurationMs`（300〜800msクランプ・3ms/px）を新設し、
  Piece.tsxのCSS transitionとBattle.tsxのPhase0待機の両方が同式を共有（片側だけの変更によるフェーズずれなし）。
  Piece側は前回表示位置からの移動ピクセル距離+animationSpeed設定で算出、Battle側は移動したコマの最長移動距離
  から待機時間を動的算出（移動なしターンは待機スキップ）。テスト4件追加
- Playwright回帰 `e2e/mobile_battle_failsafe.mjs` を iPhone13/WebKit・Pixel7/Chromium 両方で実行し全項目PASS
  （演出タイミング変更でフェイルセーフ非破壊を確認）。**実機ブラウザでの目視確認は未実施**

### 現状の再監査（Phase Cから踏み込んで確認）

- **ボール**: `Battle.tsx`の`launchFlyingBall`は距離比例の飛行時間（`Math.max(200, Math.min(500, dist * 0.8))`ms）を
  既に持っている。軌跡線の表示タイミングも「ボール飛行開始と同時」に意図的に同期済み（コード注記あり）
- **軌跡線の描画**（`overlay_renderers.ts`の`renderBallTrails`）: `from`→`to`の**完成済み静止線を一括描画**するだけで、
  ボールの飛行進捗（0〜100%）に連動して線が伸びていく表現にはなっていない
- **コマ本体**（`Piece.tsx`）: `transition: 'left 0.8s ease-out, top 0.8s ease-out, ...'`が**距離に関わらず常に0.8秒固定**。
  ボールは距離比例なのに、コマ本体だけ距離を無視している非対称な状態
- `Battle.tsx`側は`await wait(800)`でこの0.8秒を待ってから次のフェーズ演出に進む実装になっている
  （＝距離連動化する場合、この待ち時間も合わせて調整が必要。単純にCSS側だけ変えると次フェーズが早く/遅く始まってしまう）

### タスク

**D1. ボール軌跡線をボールの飛行進捗に連動させる（最優先）**
- `renderBallTrails`を、完成済み静止線ではなく**飛行進捗に応じて伸びる線**に変更
- 実現方法の一例: `FlyingBall`の経過時間比率をOverlay側に渡し、軌跡線の終点を`from`と`to`の間で補間しながら再描画
- シュート/パスで伸び方の質感（太さ・光り方）を変える（C1のトレイル強化と統合してよい）
- 受け入れ条件: ボールが飛んでいる間、軌跡線がボールの現在位置まで伸びた状態で見え、飛行完了と同時に線も完成する

**D2. コマ移動アニメーションを距離連動速度にする**
- `Piece.tsx`の固定`0.8s`を、`FlyingBall`と同様の距離比例ロジック（例: `Math.max(300, Math.min(800, dist * 係数))`ms）に変更
- `Battle.tsx`側の`await wait(800)`を、実際に移動したコマの中で最長の移動時間に合わせて動的化する
  （全コマ一括`dispatch`後、最大移動距離から待機時間を算出する / または`transitionend`イベントで待つ方式に切り替える）
- 受け入れ条件: 短距離移動はきびきび、長距離移動はワープせず自然な速度で見える。次フェーズ演出が早すぎ/遅すぎで始まらない

---

## Phase E: 演出の総点検（2026-07-02追加）

> 演出システムは CeremonyLayer.tsx（試合の節目・全画面暗転系）と CenterOverlay.tsx（TACKLE!等のイベント黒箱・showOverlayキュー）の2系統が併存しており、監査で以下の問題を特定済み。E1→E2→E3→E4 の順に実装する。

### 監査で特定済みの問題

1. KICKOFF の `fcms-slide-up` が %ベース縦移動(-40%→-50%)と pxベース縦移動(40px→0)を二重合成し、さらにアニメーション全体に ease-out が掛かってキーフレーム配分が歪み、「フラフラ浮遊する」締まりのない動きになっている
2. Turn 1 では KICKOFF ceremony と `showOverlay('Turn 1')`（Battle.tsx の TURN_START 効果、`state.turn > 0` で発火）が同時期に重なって表示される
3. 毎ターン `setCeremony('turn')`（35%暗転1.2秒 + Turn N 表示）が走り、1試合22ターンで22回画面が明滅する
4. CeremonyLayer の暗転背景(rgba 0.7/0.35)がフェードなしで1フレームで出現・消滅する（文字だけフェードし背景がブツ切り）
5. FULL TIME の `animation: 'fcms-whistle 0.5s, fcms-scale-in 0.6s forwards'` は同一 transform プロパティへの二重指定で後者が勝ち、ホイッスル振動が実際には表示されないデッドコード
6. TACKLE!/BLOCKED!等のイベントカットイン（CenterOverlay）が黒角丸トースト風で安っぽい。一方 goalkick 演出には斜め帯ワイプ（fcms-wipe / fcms-wipe-label）というよくできた視覚言語が既にある
7. タイミング定数がバラバラ（KICKOFF 2500ms / turn 1200ms / イベント800〜1200ms、in 200ms / out 300ms 等）で一元管理されていない
8. KICKOFF 前半/後半の JSX がほぼ完全重複

### タスク

**E1. システム統一とテンポ設計**
- 演出タイミング定数を battleUtils.ts に一元化（CEREMONY_BACKDROP_FADE_MS / CUTIN_IN_MS / CUTIN_HOLD_MS / CUTIN_OUT_MS / KICKOFF_CEREMONY_MS 等。既存の KICKOFF_CEREMONY_MS / HALFTIME_CEREMONY_MS / SECOND_HALF_DELAY_MS / TURN_FLASH_MS はこの体系に統合）
- 毎ターンの `setCeremony('turn')`（全画面暗転）を廃止。Turn 表示は画面上部の試合時間ラベル付近で小さくフェード切替する控えめな表示に格下げ（暗転なし・0.6秒程度）。`showOverlay('Turn N')` も廃止し新方式の1系統のみに
- CeremonyPhase から 'turn' を除去、fcms-turn-flash keyframe も削除
- ターンフェーズ進行のタイミング（TURN_START → INPUT の normalDelay 等）は現行値を維持

**E2. KICKOFF 演出の作り直し**
- fcms-slide-up を廃止し、キレのあるカットインに: 入り=左から高速スライドイン(0.25s, cubic-bezier(0.16,1,0.3,1))して中央で静止 / ホールド1.2s程度 / 抜け=右へスナップアウト(0.2s)。transform は translate(-50%,-50%) 基準に translateX のみ
- 暗転背景に CEREMONY_BACKDROP_FADE_MS のフェードイン/アウト（halftime / secondhalf / fulltime にも適用）
- `soundManager.play('whistle_start')` を文字が静止する瞬間に同期
- KICKOFF 前半/後半の重複 JSX を共通化（subText 差し替え）
- 演出全体の長さは現行 KICKOFF_CEREMONY_MS(2500ms) から大きく変えない

**E3. イベントカットインの質感向上**
- CenterOverlay の黒角丸トースト箱を廃止し、goalkick の斜め帯ワイプの視覚言語に統一（高さ80〜100px程度の帯が高速ワイプイン → テキストスライドイン → ホールド → 帯ごとワイプアウト）
- 帯の色はイベント種別で変える（showOverlay color 引数を帯グラデーションに反映: TACKLE!=オレンジ系 / GOAL!!=金 / GREAT SAVE!=緑 / OFFSIDE!・DELAY!=黄 / BLOCKED!=白系 等）
- キュー処理と duration 引数の互換維持、pointerEvents: none 維持
- in/out は CUTIN_IN_MS / CUTIN_OUT_MS に統一。reduced-motion 時はワイプせずシンプルなフェードにフォールバック

**E4. バグ修正・整理**
- FULL TIME のホイッスル振動: transform 二重指定を解消し振動を復活（内側に振動用 div を挟み、外側=配置transform / 内側=シェイクanimation に分離）
- 使われなくなった keyframes（fcms-slide-up, fcms-turn-flash 等）と関連スタイルを削除
- CeremonyLayer / CenterOverlay に残るマジックナンバーを E1 の定数に置換

### 品質ゲート（全タスク共通）

- 型チェック・既存テストスイート全通過
- 演出タイミング変更時はターン進行（TURN_START→INPUT、リプレイチェーン、8秒安全弁、`61085c0`のフェイルセーフ）との整合を確認
- `e2e/mobile_battle_failsafe.mjs` を両デバイスプロファイルで全項目 PASS
- reduced-motion 環境での動作維持、COM vs COM 観戦モードの演出スキップ挙動（isComVsCom 分岐）を壊さない

---

## 未決事項

- [x] Phase Aの事前プレビュー（A2）はシュートのみに絞った（2026-07-01決定・理由は上記Phase A完了メモ参照）
- [ ] Phase Cの優先順位（C3〜C5のどこまでを今回のスコープにするか、Phase D後に再検討）
