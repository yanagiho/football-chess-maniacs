# Football Chess ManiacS — ゲーム仕様書 v12
**作成日：2025年** | **制作：GADE Inc.**
**v11更新：ボール操作刷新、フリーボール、ロングパスズレ、ターンフェーズ管理、実行リプレイ演出。**
**v12更新：ボール13ケース全処理確認、validateBallState安全弁、パス/ドリブル選択UI(コマ近く表示)、入力ブロック(透明オーバーレイ)、ボール消失復帰強化を反映。**

---

## 1〜4. 基本情報・コンセプト・世界観・コマ仕様

（v10 と同一のため省略。§4-5 時代別特殊スキルは ※未実装）

---

## 5〜6. ボード仕様・ZOC仕様

（v9.2 と同一のため省略）

---

## 7. 判定システム

（v9.2 と同一。実装: dice.ts / shoot.ts / pass.ts / tackle.ts / foul.ts / collision.ts。228テスト通過済み）

---

## 8. 移動・パス・シュート数値

（v9.2 と同一のため省略）

---

## 9. ターン進行

### 9-1. ターン構造

| 項目 | 内容 |
|---|---|
| 入力方式 | **両プレイヤー同時入力** |
| 操作対象 | **フィールド上の全11枚に指示可能** |
| 制限時間 | 1ターンあたり**60秒** |
| 総ターン数 | **前半15ターン + AT(1〜3) + 後半15ターン + AT(1〜3) = 合計30〜36ターン** |
| 先攻後攻 | **コイントス（ランダム50%）で決定** |

### 9-1b. ターンフェーズ管理 【v11追加】

1ターンは6段階のフェーズで厳密に管理される。`turnPhase` stateで制御。

| フェーズ | 入力 | 内容 | 安全弁 |
|---|---|---|---|
| TURN_START | 不可 | 「Turn X」CenterOverlay演出（1秒）| 2秒 |
| INPUT | **可能** | コマ移動・ボール操作。60秒タイマー稼働 | 60秒タイマー |
| WAITING | 不可 | COM思考中 / 相手の入力待ち | 10秒 |
| EXECUTION | 不可 | processTurn結果のリプレイアニメーション再生 | 8秒 |
| EVENT | 不可 | ゴール/ファウル等の特殊演出 | — |
| TURN_END | 不可 | ターン終了（0.5秒）→ 次ターンへ | 自動 |

INPUTフェーズ以外では全てのタッチ/クリックを無視（handleSelectPiece / handleBallClick / handleHexClick の先頭でガード）。

Turn 1 のINPUT開始時にチュートリアルヒント（CenterOverlay 2.5秒）:
「コマタップ → 移動・ドリブル / ボールタップ → パス・シュート」

### 9-2. 同時解決の処理順序

（フェーズ0〜3 は v9.2 と同一。実装: turn_processor.ts の processTurn()）

### 9-2b. ボール操作（コマ/ボール分離タッチ） 【v11更新】

ボール保持者は「コマ本体」と「ボールアイコン」を別々にタッチできる。

| タッチ対象 | 動作 |
|---|---|
| **コマ本体** | ドリブルモード（コマ+ボールが一緒に移動、3HEX） |
| **ボールアイコン** | パス/スルーパス/シュートモード |
| **ボール非保持コマ** | 移動モード（4HEX） |

**ボール保持者タップ時の操作 【v12更新】:**
コマ本体タップでもボールアイコンタップでも、同じ「アクション選択メニュー」が表示される。

| ボタン | 動作 |
|---|---|
| ⚽ パス | パスモード（味方=パス / 空きHEX=スルーパス / ゴール方向=シュート） |
| 🏃 ドリブル | ドリブルモード（3HEX移動範囲ハイライト） |

メニューはコマの上側-70pxに表示（HexBoard transform内に配置、ズーム追従）。
画面端はみ出し時は下側に表示。z-index: 200。onPointerDownで即座に反応。

**パスモード後のタップ先判定（自動）:**
1. 味方コマ → **パス**（PASS_BALL: ボールが即座に味方に移動、パス元は命令済み）
2. 空きHEX → **スルーパス**（THROUGH_PASS: ボールがHEXに飛ぶ）
3. シュートゾーン → **シュート**

**チェーンパス:** パス成功後、受け手をタップ → アクション選択メニュー → 「パス」→ 次の味方へ。回数制限なし（止まる条件に該当するまで何回でも繋がる）。パスを出したコマはそのターン移動不可（命令済み）。

**ボールアイコンの表示:**
- コマ右上に配置、コマの60%サイズ（約40px）
- 白い丸 + 五角形パターン + drop-shadow
- 常時パルスアニメーション（2秒周期、scale 1→1.08）

**ガイドテキスト:**
- 未選択:「コマまたはボールを選んでください」
- ボール保持コマ:「コマ=ドリブル / ⚽=パス・シュート」
- パスモード:「味方=パス / 空きHEX=スルーパス / ゴール方向=シュート」
- パス済みコマ:「このコマはパス済みです」
- フリーボール時:「フリーボール！コマを移動させて拾いましょう」

### 9-2c. ロングパスのズレ 【v11更新】

正確パス距離（6HEX + コスト3:+1、OM:+1）を超えるパスはズレが発生する。
**throughPass（スルーパス）のみに適用。** 通常パス（ID指定）はズレなし。

| 超過距離 | ズレ確率 |
|----------|---------|
| 1HEX | 30% |
| 2HEX | 60% |
| 3HEX以上 | 90% |

ズレた場合、ターゲットHEXの隣接6HEXからランダムに1つが実際の到達先になる。
- ズレ先に味方コマ → パス成功扱い
- ズレ先に敵コマ → 敵ボール
- ズレ先に誰もいない → フリーボール
- ズレ先がフィールド外 → 相手GKのボール

実装: ball.ts の `resolvePassDeviation()`

### 9-2d. スルーパス（throughPass） 【v11更新】

| 項目 | 内容 |
|---|---|
| 入力 | ボールアイコンタッチ → 空きHEXをタップ |
| OrderType | `'throughPass'` |
| エンジン処理 | ボールがtargetHexに向かって飛ぶ（ズレ判定あり） |
| 受け取り判定 | targetHexから距離2以内に味方コマがいれば受け取り成功 |
| パスカット | 通常パスと同じ |
| ルーズボール | 距離2以内に味方なし → LOOSE_BALLイベント → freeBallHex設定 |

**クライアント側:** THROUGH_PASS dispatch → 命令登録 + ボール仮表示変更（freeBallHex=targetHex）。hasBallの変更はUI表示用のみ、エンジンにはturnStartSnapshotのhasBallを復元して渡す。

### 9-2e. フリーボール（ルーズボール） 【v11更新】

ボールが誰にも保持されていない状態。`Board.freeBallHex: HexCoord | null`。

**発生条件:**
- スルーパスで距離2以内に味方なし
- ロングパスのズレでズレ先に誰もいない

**争奪処理（フェーズ1.5、移動完了後）:**

| 状況 | 処理 |
|---|---|
| freeBallHexにコマが来た | コスト最高が取得（同コスト=乱数） |
| 両チーム来た | コスト比較で勝者 |
| 誰も来ない | 隣接HEX(距離1)のコスト最高が取得 |
| 隣接にもいない | フリーボール継続（次ターンも同じ位置） |

**表示:** ピッチ上に40pxボールアイコン、黄色光彩、バウンスアニメーション、「FREE」テキスト

実装: turn_processor.ts の `resolveLooseBall()` + `LooseBallEvent`型

### 9-3〜9-9.

（v9.2 と同一）

### 9-7. キックオフ・得点後の再開

| 状況 | 処理 |
|---|---|
| 試合開始 | **コイントスで決定された先攻チームのFWがボールを保持** |
| 得点後 | 両チーム初期フォーメーションに戻る。失点チームのキックオフで再開 |
| 後半開始 | 前半にキックオフしなかったチームのキックオフで再開 |
| キックオフ時配置制約 | home: row 0〜16、away: row 17〜33 |

### 9-10. 勝利条件・延長戦・PK戦

（v10 と同一）

---

## 10. ミニゲーム仕様

（v10 と同一）

---

## 11. チーム編成

（v10 と同一）

---

## 12. マネタイズ設計

（v10 と同一）

---

## 13. 画面構成

（v10 と同一。全18画面。）

---

## 14. COMチーム・対戦モード

（v10 と同一）

---

## 15. サウンドシステム

（v10 と同一）

---

## 16. 設定画面

（v10 と同一。アニメーション速度はEXECUTION再生のFlyingBall飛行時間とwait時間に適用。）

---

## 17. コイントス

（v10 と同一）

---

## 18. 切断・再接続

（v10 と同一）

---

## 19. リプレイビューア

（v10 と同一）

---

## 20. CenterOverlay統一演出 【v12更新】

全ての演出テキストをピッチ中央のCenterOverlayコンポーネントで統一表示。キュー方式。

| 演出 | テキスト | サブテキスト | 色 | サイズ | 表示時間 | サウンド |
|---|---|---|---|---|---|---|
| ターン開始 | Turn X | — | 白 | 36px | 0.8秒 | — |
| チュートリアル | コマタップ→移動... | ボールタップ→パス... | 白 | 24px | 2.5秒 | — |
| タックル成功 | TACKLE! | DF ★2 等 | 白 | 48px | 1.0秒 | tackle |
| タックル失敗 | BREAKTHROUGH! | — | シアン | 40px | 0.8秒 | — |
| ファウル | FOUL! | FK or PK | 黄 | 48px | 1.5秒 | foul |
| シュートブロック | BLOCKED! | — | 白 | 44px | 0.8秒 | — |
| GKセーブ | GREAT SAVE! | GK ★X | 緑 | 48px | 1.2秒 | — |
| GKキャッチ | GK CATCH! | — | 緑 | 40px | 0.8秒 | — |
| パスカット | BALL CUT! | VO ★2 等 | 白 | 48px | 1.2秒 | tackle |
| オフサイド | OFFSIDE! | — | 黄 | 48px | 1.2秒 | — |
| ゴール | GOAL!! | スコア表示 | 金 | 64px | 2.5秒 | goal |
| フリーボール | LOOSE BALL! | — | 白 | 40px | 1.0秒 | — |

実装: components/CenterOverlay.tsx

---

## 21. 実行フェーズ（EXECUTION）の再生 【v11追加】

ターン確定後、盤面をターン開始時の状態（turnStartSnapshot）に巻き戻してからリプレイ再生する。

**タイムライン:**
| 時間 | 内容 |
|---|---|
| 0ms | スナップショットに巻き戻し（SET_DISPLAY_PIECES） |
| 300ms | APPLY_ENGINE_RESULT → CSS transition で全コマ同時移動（0.8秒） |
| 1100ms | Phase1: 競合・タックルエフェクト |
| 1600ms | Phase2: ファウルエフェクト |
| 2100ms | Phase3: パス/シュートを順番にFlyingBallで再生 |
| ～ | Phase4: パスカット/オフサイドエフェクト |
| ～ | 軌跡0.8秒表示 → クリア → EVENT or TURN_END |

**FlyingBall（ボール飛行アニメーション）:**
- 24pxの白いサッカーボール（SVG五角形パターン）
- useRef+直接DOM操作でCSS transitionを確実にトリガー
- 距離に応じた飛行時間（200-500ms、アニメーション速度設定で除算）
- z-index: 200（コマより上）
- 移動中に回転（SVG animation: fcms-ball-spin 0.5s infinite）
- 光彩: パス=青、シュート=赤、スルーパス=シアン

**ボール軌跡（Overlay Canvas描画）:**
| 種類 | 線スタイル | 端点マーカー |
|---|---|---|
| パス成功 | 青点線 3px | 到達点に青丸6px |
| スルーパス | シアン点線 3px | 到達点にシアン丸6px |
| パスカット | オレンジ点線 3px | カット地点に赤×8px |
| ドリブル | 緑実線 4px | 中間点にボール小6px |
| シュート(ゴール) | 赤太実線 5px | 金色の星14px |
| シュート(ブロック/セーブ) | 赤太実線 5px | 赤×10px |

軌跡はFlyingBall発射と同時に描画。TURN_END後にクリア。

**同一HEX複数コマ表示:**
- 2個: 左右に12pxオフセット
- 3個以上: 円形配置（半径14px）

実装: Battle.tsx (async再生)、FlyingBall.tsx、Overlay.tsx (ballTrails)、HexBoard.tsx (hexPieceCount)

---

## 22. ボールロスト全13ケースの処理 【v12追加】

| # | ケース | ボール処理 | イベント |
|---|--------|-----------|---------|
| 1 | パスカット1（ZOC内の敵がカット） | passer→false, interceptor→true | PASS_CUT + BALL_ACQUIRED |
| 2 | パスカット2（ZOC2上の敵がカット） | passer→false, interceptor→true | PASS_CUT + BALL_ACQUIRED |
| 3 | パスカット3（受け手HEXの敵がカット） | passer→false, interceptor→true | PASS_CUT + BALL_ACQUIRED |
| 4 | GKキャッチ（セーブ成功+キャッチ） | shooter→false, GK→true | SHOOT(saved_catch) + BALL_ACQUIRED |
| 5 | タックル成功 | dribbler→false, tackler→true（ファウル時は反転） | TACKLE + BALL_ACQUIRED |
| 6 | ロングパスズレ→敵 | passer→false, enemy→true | BALL_ACQUIRED |
| 7 | スルーパス→空きHEX | passer→false, freeBallHex設定 | LOOSE_BALL |
| 8 | スルーパス→敵のいるHEX | passer→false, enemy→true | BALL_ACQUIRED |
| 9 | 競合でボール保持者が負ける | loser→resetToStart | COLLISION |
| 10 | ファウル後FK/PK | 攻撃側にボール復帰 | FOUL |
| 11 | オフサイド | 全コマhasBall=false → 守備側GK→true | OFFSIDE + BALL_ACQUIRED |
| 12 | ゴール後リセット | createGoalRestartPieces（キックオフ側FWがボール保持） | — |
| 13 | ハーフタイム後リセット | 同上（後半キックオフ側） | — |

### validateBallState 安全弁 【v12追加】

processTurn の最後に呼び出される整合性チェック+自動修正。

| チェック | 処理 |
|---------|------|
| hasBall=true が2人以上 | 最初の1人に絞る |
| hasBall=true が0人 + freeBallHex=null | スナップショットの保持者に復帰 → GK → 最初のFP |
| 保持者あり + freeBallHex共存 | freeBallHexをクリア |

クライアント側（Battle.tsx INPUT開始時）でも同様のチェック:
ボール消失時は味方GKまたは最初のFPに強制復帰。

実装: turn_processor.ts `validateBallState()` + ballManager.ts `setBallHolder()` + Battle.tsx useEffect

---

## 23. ターンフェーズ中の入力ブロック 【v12追加】

turnPhase !== 'INPUT' 時の全操作を3層でブロック:

| 層 | 仕組み |
|----|--------|
| 1. ハンドラガード | handleSelectPiece/handleHexClick/handleConfirm の先頭で `turnPhase !== 'INPUT'` return |
| 2. 透明オーバーレイ | ピッチ全体を覆うdiv (z-index:250) が onPointerDown/onClick で stopPropagation+preventDefault |
| 3. UI非表示 | BallActionMenu: turnPhase !== 'INPUT' → null渡し。確定ボタン: disabled |

実装: Battle.tsx 内の boardRef コンテナに透明div挿入

---

## 24. 未確認・要確認事項

### 残存する未確定/未実装事項

| 項目 | 状態 | 備考 |
|---|---|---|
| 時代スキル詳細 | 🔜後回し | コアルール確定後に設計 |
| キャラクター全リスト | 📄コンテンツ | 世界観ドキュメント参照要 |
| リアルマネー課金連携 | 💰未実装 | プラットフォーム連携が必要 |
| セーブ課金の形態 | 💰要設計 | 月額 or 買い切り |
| ファウル確率の数値調整 | 🔧バランス | 25%は暫定値 |
| PA内「多数守備」の閾値 | 🔧バランス | 何体以上で必ずファウルか |
| オフサイドグレーゾーンの確率 | 🔧バランス | 50%は暫定値 |
| ミニゲーム内判定処理 | 🔧未完全 | UI表示→NEXT_TURNの暫定動作 |
| オンライン対戦E2Eテスト | 🔧未実施 | クライアント側実装済み |
| BGM実装 | 🔜後回し | 効果音のみ実装済み |
| 多言語対応 | 🔜後回し | UIは日本語のみ |
| パスカットでのボールフリー | 🔜後回し | 現在はカット側が必ず取得 |
| 命令の取り消しUI | 🔧未完全 | 左パネルタップ取消は一部実装 |

---

## 変更履歴

| バージョン | 変更内容 |
|---|---|
| v2〜v9.2 | （従来と同一） |
| v10 | Phase A〜D実装同期。延長戦+PK戦、コイントス、Elo、ショップ、200枚コマ管理API、設定画面、サウンド、リプレイビューア、全18画面、演出タイミング統一 |
| v11 | ボール操作刷新: コマ/ボール分離タッチ、キープ廃止、パス成功後は通常INPUT状態に戻る統一モデル。PASS_BALL/THROUGH_PASSアクション。フリーボール状態(freeBallHex+LooseBallEvent+resolveLooseBall)。ロングパスズレ(resolvePassDeviation, throughPassのみ適用)。ターンフェーズ管理(TURN_START→INPUT→WAITING→EXECUTION→EVENT→TURN_END)。CenterOverlay統一演出(キュー方式)。EXECUTION再生リプレイ化(turnStartSnapshot巻き戻し+async順次再生)。FlyingBall(useRef+CSS transition, 24px, z-index:200)。ボール軌跡(ballTrails Canvas描画)。同一HEX複数コマオフセット表示。アニメーション速度設定適用。エンジンhasBall復元(snapshotBallMap)。** |

---

| **v12** | **ボール13ケース全処理確認・テーブル化。validateBallState安全弁(processTurn最後+CLIENT INPUT開始時)。パス/ドリブル選択UI変更(コマ近く表示、HexBoard transform内配置)。CenterOverlay演出テーブル拡充(TACKLE!48px/FOUL!+FK or PK/GREAT SAVE!+GK情報/BREAKTHROUGH!/LOOSE BALL!)。ターンフェーズ入力ブロック3層(ハンドラガード+透明オーバーレイz-index:250+UI非表示)。オフサイド時全コマhasBallリセート→GK保持。ロングパスズレ→敵取得の処理追加。setBallHolder安全弁強化(holder未発見時/ボール消失時フォールバック)。** |

---

*本仕様書はFCMS企画スライド、Football Chess企画書、GrassRoots世界観ドキュメント、GDD資料、およびオーナー指示をもとに作成。v12は実装コードとの完全同期版。*
