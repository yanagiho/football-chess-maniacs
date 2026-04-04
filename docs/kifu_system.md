# Football Chess ManiacS — 棋譜システム設計書 v1.1
**前提：ゲーム仕様書v8 / 技術要件書v2 / COM AI設計書v3 確定済み**

---

## 1. 概要

### 1-1. 棋譜とは

本ゲームにおける棋譜とは、1試合の全ターンの入力・判定結果・盤面状態を構造化して記録したデータ。チェスのPGN、将棋のKIF/CSAに相当する。

### 1-2. 棋譜の用途

| 用途 | 説明 |
|---|---|
| **Gemma学習データ** | 月次ファインチューニングの教師データ |
| **リプレイ再生** | プレイヤーが自分や他者の試合を見返す |
| **バランス分析** | 勝率・得点パターン・ポジション有効性等の統計解析 |
| **観戦・共有** | ランキング上位の名試合の公開・SNS共有 |
| **不正検知** | 異常な入力パターンの事後分析 |
| **チュートリアル素材** | 模範的な試合を教材として利用 |

---

## 2. 棋譜データ形式

### 2-1. 1試合の棋譜構造（FCMS Record Format）

```json
{
  "format": "fcms_v1",
  "match_id": "m_abc123",
  "timestamp": "2025-07-15T14:30:00Z",
  "mode": "ranked",
  "result": {
    "winner": "player_a",
    "score": [2, 1],
    "finish": "normal"
  },
  "players": {
    "a": {
      "id": "p_xyz789",
      "rating": 1250,
      "team": {
        "era": "mixed",
        "field": [
          {"piece_id": "p01", "position": "GK", "cost": 2, "era": "modern"},
          {"piece_id": "p02", "position": "DF", "cost": 1.5, "era": "interwar"}
        ],
        "bench": [...]
      }
    },
    "b": {
      "id": "com_maniac_modern",
      "rating": null,
      "team": {...}
    }
  },
  "turns": [
    {
      "turn": 1,
      "phase": "first_half",
      "orders": {
        "a": [
          {"piece_id": "p01", "action": "move", "target_hex": [11, 30], "source": "manual"},
          {"piece_id": "p03", "action": "move", "target_hex": [9, 28], "source": "preset_advance"},
          {"piece_id": "p04", "action": "move", "target_hex": [13, 28], "source": "preset_advance"}
        ],
        "b": [
          {"piece_id": "q05", "action": "pass", "target_piece": "q09", "source": "ai"}
        ]
      },
      "events": [
        {"type": "move", "piece": "p01", "from": [11, 32], "to": [11, 30]},
        {"type": "pass", "from_piece": "q05", "to_piece": "q09", "success": true},
        {"type": "passcut1", "interceptor": "p06", "success": false, "probability": 25}
      ],
      "board_after": {
        "pieces": [
          {"id": "p01", "hex": [11, 30], "has_ball": false},
          {"id": "q09", "hex": [8, 14], "has_ball": true}
        ]
      }
    }
  ],
  "substitutions": [
    {"turn": 55, "player": "a", "out": "p07", "in": "b02"}
  ],
  "mini_games": [
    {
      "turn": 38,
      "type": "fk",
      "attacker_choice": {"zone": "top_left", "style": "direct"},
      "defender_choice": {"wall": "high", "gk_dive": "top_right"},
      "result": "goal"
    },
    {
      "turn": 62,
      "type": "ck",
      "attack_pieces": ["p09", "p10", "p11"],
      "attack_zones": {"p09": "near", "p10": "center", "p11": "far"},
      "defense_pieces": ["q03", "q04", "q06"],
      "defense_zones": {"q03": "near", "q04": "center", "q06": "center"},
      "drop_zone": "center",
      "result": "cleared"
    }
  ],
  "stats": {
    "a": {
      "possession": 52.3,
      "shots": 8,
      "shots_on_target": 4,
      "pass_attempts": 45,
      "pass_success": 38,
      "tackles": 12,
      "tackles_won": 7,
      "fouls": 2,
      "offsides": 1,
      "pieces_moved_avg": 6.2
    },
    "b": {...}
  },
  "quality_rating": "gold",
  "tags": ["comeback", "high_scoring", "maniac_win"]
}
```

### 2-2. 指示のsourceフィールド

各orderに`source`フィールドを付与し、指示の生成元を記録する。

| source値 | 意味 |
|---|---|
| `manual` | プレイヤーが個別に入力した指示 |
| `preset_advance` | プリセット「全体前進」で生成 |
| `preset_retreat` | プリセット「全体後退」で生成 |
| `preset_defense` | プリセット「守備ブロック」で生成 |
| `preset_attack` | プリセット「攻撃展開」で生成 |
| `ai` | COM AIが生成 |

> バランス分析で「プレイヤーの実際の意思決定数」を正確に測定するために使用。プリセットで8枚動かして手動で3枚動かした場合、意思決定数は4（プリセット1回＋手動3回）として集計。

### 2-3. チーム構成のbench配列

benchフィールドは可変長配列。初期チーム（16枚）の場合はbenchが5枚（空きスロット4枠）となる。

```json
"team": {
  "field": [...],
  "bench": ["b01", "b02", "b03", "b04", "b05"],
  "bench_capacity": 9,
  "bench_empty_slots": 4
}
```

> リプレイUI・棋譜ビューアはbench配列の長さに基づいて表示。9枚未満の場合は空きスロットをグレーアウトで表示。

### 2-4. データサイズ

| 要素 | サイズ |
|---|---|
| 1ターン分（orders + events + board_after） | 約2〜4KB |
| 90ターン分 | 約180〜360KB |
| メタデータ（players, result, stats） | 約3KB |
| **1試合の棋譜（合計）** | **約200〜400KB** |
| **gzip圧縮後** | **約50〜100KB** |

---

## 3. 棋譜の品質分類

Gemma学習とリプレイ公開のために、棋譜に品質ランクを自動付与する。

### 3-1. 品質ランク

| ランク | 条件 | 用途 |
|---|---|---|
| **Diamond** | ランクマッチ上位5%同士の試合＋2ゴール以上＋90ターン完走 | Gemma学習の最優先データ、名試合として公開 |
| **Gold** | ランクマッチ上位20%同士の試合＋90ターン完走 | Gemma学習データ |
| **Silver** | ランクマッチ全般＋90ターン完走 | バランス分析 |
| **Bronze** | クイックマッチ＋90ターン完走 | バランス分析（参考） |
| **Unrated** | COM対戦、途中切断、不正フラグ付き | 学習データに使用しない |

### 3-2. 自動タグ付け

試合内容を自動分析し、特徴的なタグを付与する。

| タグ | 条件 |
|---|---|
| `comeback` | 2点差以上をひっくり返した |
| `shutout` | 無失点勝利 |
| `high_scoring` | 合計4ゴール以上 |
| `golden_goal` | 延長戦で決着 |
| `pk_drama` | PK戦で決着 |
| `giant_killing` | レーティング差200以上で下位側が勝利 |
| `speedrun` | 前半のみで3点差以上 |
| `tactical_battle` | 両者のZOC支配率が45〜55%の接戦 |
| `through_pass_goal` | スルーパスからの得点あり |
| `offside_trap` | オフサイドトラップ成功が2回以上 |

---

## 4. ストレージ設計

### 4-1. 保存先と書き込みパス

| データ | 保存先 | 書き込みパス |
|---|---|---|
| 棋譜本体（JSON） | **Cloudflare R2** | DO → **Queues経由** → R2（非同期。試合終了の同時集中を緩衝） |
| 棋譜インデックス | **Cloudflare D1** | DO → **Queues経由** → D1（非同期） |
| 品質ランク・タグ | **Cloudflare D1** | Queues Consumer内で計算・書き込み |
| Gemma学習用データセット | **Cloudflare R2**（別バケット） | 月次バッチ（Workers Cron） |

> 試合終了時にDurable Objectから直接R2/D1に書き込まない。Queuesを経由することで、複数試合が同時終了した場合のDOのアウトバウンド接続数上限を回避し、D1の書き込み並行性の問題も緩衝する。DOは棋譜JSONをQueueメッセージとして送信するのみ（軽量）。

### 4-2. D1インデックステーブル

```sql
CREATE TABLE match_records (
  match_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  mode TEXT NOT NULL,
  winner TEXT,
  score_a INTEGER,
  score_b INTEGER,
  finish TEXT NOT NULL,
  player_a_id TEXT,
  player_a_rating INTEGER,
  player_b_id TEXT,
  player_b_rating INTEGER,
  quality TEXT NOT NULL,
  tags TEXT,
  r2_key TEXT NOT NULL,
  file_size INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_quality ON match_records(quality);
CREATE INDEX idx_mode ON match_records(mode);
CREATE INDEX idx_player_a ON match_records(player_a_id);
CREATE INDEX idx_player_b ON match_records(player_b_id);
CREATE INDEX idx_timestamp ON match_records(timestamp);
```

### 4-3. R2のキー構造

```
棋譜本体:     records/{YYYY}/{MM}/{match_id}.json.gz
学習データ:   training/{YYYY}/{MM}/dataset_{batch}.jsonl.gz
統計レポート: analytics/{YYYY}/{MM}/monthly_report.json
```

### 4-4. データ量の見積もり

| 条件 | 月間データ量 |
|---|---|
| 1万DAU、1日5万試合 | 棋譜: 75〜150GB/月（圧縮後） |
| D1インデックス | 約50MB/月 |
| 学習データセット（Gold以上を抽出） | 約5〜15GB/月 |

### 4-5. データ保持ポリシー

| ランク | 保持期間 | 根拠 |
|---|---|---|
| Diamond | **永久保存** | 名試合アーカイブ。コミュニティ資産 |
| Gold | 1年 | Gemma学習に十分な期間 |
| Silver | 6ヶ月 | バランス分析の有効期間 |
| Bronze | 3ヶ月 | 参考データ |
| Unrated | 1ヶ月 | 不正調査の猶予期間 |

> 期限到来後、D1インデックスは削除、R2の棋譜本体は低頻度ストレージ（R2 Infrequent Access）へ移行 or 削除。

---

## 5. Gemma学習パイプラインとの連携

### 5-1. 学習データ抽出（月次バッチ）

```
[Cloudflare Workers Cron（月初実行）]
  │
  ├── D1からGold以上の棋譜IDを抽出
  │   WHERE quality IN ('diamond', 'gold')
  │   AND timestamp >= 先月1日
  │
  ├── R2から棋譜本体を取得
  │
  ├── 各ターンを「盤面状態→勝者側の指示」ペアに変換
  │   ※敗者側の指示は除外（良い手だけ学習させる）
  │
  ├── プロンプト形式に整形
  │   {system: 難易度プロンプト, user: 盤面+合法手, assistant: 指示JSON}
  │
  └── R2の training/ バケットにJSONL形式で保存
```

### 5-2. 学習データの偏り対策

| 問題 | 対策 |
|---|---|
| 特定のポジション構成に偏る | チーム構成の多様性でサンプリング。同じ構成は月100試合まで |
| 攻撃的な試合ばかり学習する | 守備的な勝利（1-0のshutout等）を意図的にオーバーサンプリング |
| 特定のレーティング帯に偏る | レーティング帯別に均等サンプリング |
| COMの手癖がつく | 上位プレイヤー同士の対人戦のみ抽出。COM対戦は除外 |

### 5-3. 学習効果の測定

ファインチューニング前後で以下を比較。

| 指標 | 旧モデル | 新モデル | 合格基準 |
|---|---|---|---|
| 旧 vs 新の勝率 | 50% | — | 新モデル55%以上 |
| 合法手出力率 | — | — | 95%以上 |
| 平均推論時間 | — | — | 300ms以内 |
| 難易度間の勝率差 | — | — | ビギナー<レギュラー<マニアックの順序維持 |

---

## 6. リプレイ機能

### 6-1. プレイヤー向けリプレイ

| 機能 | 内容 |
|---|---|
| 自分の試合 | 直近30試合をリプレイ可能 |
| ターン送り/戻し | 1ターンずつ進む/戻る。スライダーで任意ターンにジャンプ |
| 再生速度 | ×1 / ×2 / ×4 |
| 盤面情報 | 各ターンの全コマ位置、ZOC、パスライン、シュートコースを表示 |
| 判定詳細 | イベント（パスカット、タックル、シュート等）の確率・結果を表示 |
| ハイライト自動生成 | ゴールシーン・ファウル・PKの前後3ターンを自動抽出 |

### 6-2. 公開リプレイ

| 機能 | 内容 |
|---|---|
| 名試合アーカイブ | Diamond棋譜を公開リストに掲載 |
| タグ検索 | `comeback` `giant_killing` 等で検索可能 |
| 待機中の観戦 | マッチング待機中にDiamond棋譜をランダム再生 |
| SNS共有 | 試合のURL共有。リンクを開くとリプレイが再生される |

### 6-3. リプレイ再生の技術仕様

| 項目 | 仕様 |
|---|---|
| データ取得 | R2から棋譜JSONを取得（gzip圧縮配信） |
| 再生方式 | クライアント側で盤面を再構築。サーバー負荷なし |
| キャッシュ | 一度取得した棋譜はService Workerでローカルキャッシュ |
| 初回ロード | 50〜100KB（圧縮後）。3G回線でも1秒以内 |

---

## 7. バランス分析

### 7-1. 月次バランスレポート（自動生成）

棋譜データから自動的にバランス分析レポートを生成する。

| 分析項目 | 内容 | 問題検知基準 |
|---|---|---|
| 先攻/後攻の勝率 | キックオフ側の有利不利 | 55%以上で偏りあり |
| ポジション別の起用率 | 各ポジションがどれだけ使われているか | 10%未満のポジション＝弱すぎる |
| コスト帯別の起用率 | コスト3のスターがどれだけ使われるか | コスト3が90%以上の試合に出場＝必須すぎる |
| ゾーン別の得点源 | どのサード・レーンからの得点が多いか | 特定ゾーンが70%以上＝バランス崩壊 |
| シュート成功率 vs 距離 | 距離ごとのシュート成功率の実測 | 設計値と10%以上乖離＝数値調整要 |
| パスカット率 | パスカット1/2の実測成功率 | 設計値と10%以上乖離＝数値調整要 |
| タックル成功率 | ポジション別のタックル実測成功率 | 同上 |
| 平均試合時間 | 実際の試合所要時間 | 60分超＝長すぎる検討 |
| 平均得点数 | 1試合あたりの平均ゴール数 | 0.5未満＝得点しにくすぎる、5超＝しやすすぎる |
| ファウル発生率 | タックルあたりのファウル率 | 25%から大幅にずれていないか |

### 7-2. レポートの配信

| 配信先 | 形式 |
|---|---|
| 開発チーム | R2に保存されたJSONレポート＋可視化ダッシュボード |
| Workers Cronが月初に自動生成 | Slackまたはメールでアラート通知 |

---

## 8. 不正検知

### 8-1. 棋譜ベースの事後分析

| 不正パターン | 検知方法 |
|---|---|
| ウィンマッチング（自作自演） | 同一IP/類似デバイスの対戦記録が高頻度 |
| 意図的敗北（レーティング操作） | 毎ターン全コマ静止＋即投了のパターン |
| 共謀 | 2アカウント間で交互に勝敗が入れ替わる長期パターン |
| BOT利用 | 全ターンの入力パターンが機械的に均一（入力時間の分散が極端に小さい） |

### 8-2. アラートと対応

| 深刻度 | 対応 |
|---|---|
| 疑わしい | フラグ付与。該当試合のレーティング変動を保留 |
| 高確度 | プラットフォームに通報。アカウント制限の判断はプラットフォーム側 |

---

## 9. プライバシー対応

### 9-1. 棋譜と個人情報

| 要素 | 対応 |
|---|---|
| プレイヤーID | プラットフォームの匿名IDのみ使用。実名・メールは含まない |
| 棋譜の公開 | **全ランクでプレイヤーの明示的同意（オプトイン）が必要**。設定画面で「自分の試合を公開リプレイに掲載可」をON/OFFで選択 |
| 公開時の匿名化 | 公開棋譜ではプレイヤーIDを表示名（ニックネーム）に置換。IDからアカウントを逆引きできないようにする |
| データ削除権（GDPR） | プレイヤーが棋譜削除を要求 → D1インデックス削除＋R2本体削除。学習済みモデルからの除去は不可（技術的に困難）だが、次回ファインチューニング時に該当データを除外 |
| 学習データへの利用 | 利用規約に「試合データのAI学習利用」を明記。オプトアウト設定を提供（自分の試合を学習データから除外可能） |

---

## 10. 実装ロードマップ

### MVP（サービスイン時）
- 棋譜の自動記録・R2保存
- D1インデックス
- 品質ランク自動付与
- 自分の試合リプレイ（直近30試合）

### サービスイン後の早期追加
- Gemma学習パイプラインとの接続
- 自動タグ付け
- 公開リプレイ（Diamond棋譜）
- 待機中の観戦機能

### 運営フェーズ
- 月次バランスレポート自動生成
- 不正検知の自動化
- SNS共有機能
- 棋譜のエクスポート機能（プレイヤー向け）

---

## 変更履歴

| バージョン | 変更内容 |
|---|---|
| v1 | 初版。棋譜データ形式、品質分類、自動タグ、ストレージ設計、Gemma連携、リプレイ、バランス分析、不正検知、プライバシー対応 |
| v1.1 | CKミニゲームの参加コマ記録を追加。orderのsourceフィールド追加（手動/プリセット/AI区別）。bench可変長対応。Diamond自動公開を廃止→全ランクオプトイン。公開時の匿名化を追加。R2/D1書き込みをQueues経由に変更 |
