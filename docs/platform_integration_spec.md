# Football Chess ManiacS — プラットフォーム実装仕様書 v1.0

## 文書メタデータ
- **文書種別**: FCMS側の実装仕様書(Football-Platform連携込み)
- **対象スコープ**: コマ購入 / チーム編成 / 編成セーブ / NPCチーム対戦 / ランキング表示 / ランキングマッチング
- **上位正典**: FCMS ゲーム仕様書 v9 (fcms_spec_v3.md), The Archive 世界観設定書 v1.0
- **連携プラットフォーム**: Football-Platform v1.2
- **キャラクターマスタ**: FChess 200人名簿 全Era統合 v1.0
- **バージョン**: v1.0
- **作成日**: 2026-04-23

---

# §1. 背景と前提

## 1-1. 本書の目的

FCMS(Football Chess ManiacS)は、既にゲームエンジン・UI・AIを実装済みである(560テストpassing、Cloudflare本番デプロイ済み)。本書は、この既存FCMSに対して以下の**プラットフォーム連携機能**を追加実装するための仕様を定める。

1. **コマ購入** — ショップ機能とPlatformの課金連携
2. **チーム編成** — 所持コマから11〜20枚を選んでチーム構成
3. **編成セーブ** — 複数チーム(10スロット)の保存
4. **NPCチーム対戦** — 時代別プリセットチームとのCOM対戦
5. **ランキング表示** — Eloレーティング(Scribe Rating)の閲覧
6. **ランキングマッチング** — ランク近接プレイヤーとの対戦

これらは既存の `docs/fcms_spec_v3.md v9` と整合を取り、Football-Platformの既存実装(v1.2)と疎結合に連携する。

## 1-2. システム全体像

```
┌──────────────────────────────────────────────────────────────┐
│   Player (Browser / Mobile Web)                              │
└──────────────────┬──────────────────────┬────────────────────┘
                   │                      │
                   │ ①JWT/API            │ ②JWT/API
                   ▼                      ▼
┌─────────────────────────────┐  ┌────────────────────────────┐
│  Football-Platform          │  │  FCMS (既存実装)            │
│  (Cloudflare Workers + PG)  │  │  (Cloudflare Workers + D1)  │
│  ━━━━━━━━━━━━━━━━━━━━━━━    │  │  ━━━━━━━━━━━━━━━━━━━━━━━   │
│  - 認証 (Register/Login/JWT)│  │  - ゲームエンジン            │
│  - SKUカタログ               │  │  - マッチメイキングDO        │
│  - Stripe購入フロー         │  │  - ゲームセッションDO        │
│  - エンタイトルメント        │  │  - COM AI (Gemma)           │
│  - フォーラム                │  │  - D1: piece_master (新)    │
│  - フレンド/DM              │  │  - D1: user_pieces (既存)   │
│  - ゲームWebhook発信         │  │  - D1: teams (既存)         │
└──────────────┬──────────────┘  └─────────────┬──────────────┘
               │                                │
               │ ③entitlement.created Webhook  │
               └────────────────────────────────▶
                 (HMAC-SHA256署名付きPOST)
```

**① ②** プレイヤーはPlatformで登録/ログインしてJWTを取得。同じJWTでFCMSも認証する(FCMSは `GET /.well-known/jwks.json` で公開鍵を取得して検証)。

**③** 購入完了時、PlatformからFCMSへWebhookが飛び、FCMSがuser_piecesを更新する。

## 1-3. 責務分担

| 責務 | 管理主体 | 根拠 |
|---|---|---|
| ユーザーアカウント・認証 | **Platform** | 全ゲーム共通 |
| Stripe決済処理 | **Platform** | catalog_items / purchases / entitlements |
| SKU(商品)の基本情報 | **Platform** | catalog_items, catalog_prices |
| SKU → piece_id 変換 | **FCMS** | piece_masterで管理(FCMS固有) |
| コマの所持管理 | **FCMS** | user_pieces(既存、entitlementsから同期) |
| ゲーム内データ(ポジション/コスト/時代/国/家系/背景ストーリー) | **FCMS** | piece_master |
| 画像URL | **FCMS** | piece_master(Cloudflare R2) |
| 試合結果・レーティング | **FCMS** | matches / user_ratings(既存) |
| フレンド関係 | **Platform** | friendships |
| 対戦ルーム/マッチメイキング | **FCMS** | 既存の Matchmaking DO / GameSession DO |

---

# §2. システム構成

## 2-1. 認証フロー(FCMSがPlatform JWTを検証する流れ)

既存FCMS実装は `middleware/jwt_verify.ts` でJWKSベースの検証を持っているため、**PlatformのJWKSエンドポイントを参照するよう設定を向ける**だけで連携できる。

```
1. Player が Platform の /v1/auth/login でJWT取得
2. Player が FCMS の任意のAPIを Authorization: Bearer <JWT> で呼ぶ
3. FCMS が Platform の /.well-known/jwks.json を取得(キャッシュあり)
4. FCMS が JWT の署名を RS256 + JWKS で検証
5. sub(userId)をリクエストコンテキストに格納
```

### 2-1-1. FCMS側の設定変更

- `middleware/jwt_verify.ts` の JWKS URL を Platform の `/.well-known/jwks.json` に設定
  - 環境変数 `PLATFORM_JWKS_URL` で上書き可能にする
- JWKSはキャッシュ(TTL: 1時間程度)して、高頻度なPlatformへの問い合わせを避ける
- `JWT_ALGORITHM` は `RS256` 固定(Platform側と一致)

## 2-2. 購入完了 → コマ所持反映のシーケンス

```
Player                FCMS                   Platform              Stripe
  │                     │                       │                    │
  │ 1. ショップを見る   │                       │                    │
  │─────────────────────▶│                       │                    │
  │                     │ 2. GET /v1/commerce/catalog?tag=fcms        │
  │                     │──────────────────────▶│                    │
  │                     │◀──────────────────────│ items[]             │
  │ 3. カタログ表示      │                       │                    │
  │◀────────────────────│                       │                    │
  │                     │                       │                    │
  │ 4. 「購入」タップ    │                       │                    │
  │─────────────────────▶│                       │                    │
  │                     │ 5. POST /v1/commerce/purchase                │
  │                     │    {sku, price_id, provider: stripe}        │
  │                     │──────────────────────▶│                    │
  │                     │                       │ 6. pending作成      │
  │                     │◀──────────────────────│ checkout_url        │
  │ 7. checkout_urlへ    │                       │                    │
  │    リダイレクト      │                       │                    │
  │─────────────────────────────────────────────│───────────────────▶│
  │                     │                       │                    │
  │ 8. Stripeで決済     │                       │                    │
  │◀─────────────────────────────────────────────────────────────────│
  │                     │                       │                    │
  │                     │                       │ 9. Webhook (chkout.session.completed)
  │                     │                       │◀───────────────────│
  │                     │                       │ 10. paid更新 +     │
  │                     │                       │     entitlement作成 │
  │                     │                       │                    │
  │                     │ 11. Platform→FCMS Webhook                   │
  │                     │     POST /webhook/platform-entitlement     │
  │                     │     event_type: entitlement.created         │
  │                     │◀──────────────────────│                    │
  │                     │ 12. user_pieces にINSERT                    │
  │                     │                       │                    │
  │ 13. Playerが戻る    │                       │                    │
  │─────────────────────▶│ 14. GET /api/pieces                        │
  │                     │   (内部: user_pieces JOIN piece_master)    │
  │◀────────────────────│ 購入したコマが含まれる                      │
```

## 2-3. 既存Football-Platformの実装差分

Platform側は実装済みなので、本書では**変更不要**。ただし以下を前提とする:

- `catalog_items` に200コマ分のSKUを投入する必要がある → **運用作業**
- `catalog_prices` に各SKUの価格を投入する必要がある → **運用作業**
- `game_webhook_endpoints` にFCMSのWebhook URLを登録する → **管理画面 or SQL投入**
- FCMS本番URL: `https://football-chess-maniacs.yanagiho.workers.dev/webhook/platform-entitlement`

---

# §3. データモデル

## 3-1. piece_master テーブル(新設、FCMS側)

200人の**原本ファイル**を管理する正典テーブル。SKUとpiece_idの橋渡しを担う。

```sql
CREATE TABLE piece_master (
    piece_id        INTEGER PRIMARY KEY,       -- 200人名簿の001-200
    sku             TEXT UNIQUE NOT NULL,      -- "fcms_piece_003" 形式
    name_en         TEXT NOT NULL,             -- "Hamish MacFarlane"
    name_ja         TEXT NOT NULL,             -- "ハミッシュ・マクファーレン"
    position        TEXT NOT NULL,             -- GK/DF/SB/MF/VO/OM/FW/WG
    cost            REAL NOT NULL,             -- 1.0/1.5/2.0/2.5/3.0
    era_detailed    INTEGER NOT NULL,          -- 1-13 (GrassRoots 13 Era)
    era_shelf       INTEGER NOT NULL,          -- 1-7 (FCMS 7時代)
    family          TEXT,                      -- "macfarlane" | NULL
    nationality     TEXT NOT NULL,             -- ISO風コード "GB-SCO" 等
    is_founding     INTEGER NOT NULL DEFAULT 0, -- FC Grassroots 11人なら1
    is_purchasable  INTEGER NOT NULL DEFAULT 1, -- 0=非売品(Founding Eleven等)
    summary_ja      TEXT,                      -- 一行要約(日本語)
    summary_en      TEXT,                      -- 一行要約(英語)
    image_url       TEXT,                      -- R2 ("/images/pieces/003.png")
    image_status    TEXT DEFAULT 'ready',      -- 'ready' | 'provisional' | 'missing'
    created_at      INTEGER NOT NULL,          -- Unix timestamp
    updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_piece_master_sku ON piece_master(sku);
CREATE INDEX idx_piece_master_cost ON piece_master(cost);
CREATE INDEX idx_piece_master_position ON piece_master(position);
CREATE INDEX idx_piece_master_shelf ON piece_master(era_shelf);
CREATE INDEX idx_piece_master_family ON piece_master(family);
```

### 3-1-1. SKU命名規約

```
fcms_piece_{piece_id 3桁ゼロ埋め}

例:
  fcms_piece_003  → #003 Hamish MacFarlane
  fcms_piece_008  → #008 Tom Harding (Founding Eleven)
  fcms_piece_038  → #038 Dorothy Blackwood (SS)
  fcms_piece_200  → #200 Pietro De Sanctis
```

### 3-1-2. nationality の表記

ISO 3166-1 alpha-2 ベース。サブリージョンがある場合は ISO 3166-2 を付ける。国が存在しない時代の選手は "歴史的呼称 + 現在ISO" を採用:

```
GB-ENG   イングランド
GB-SCO   スコットランド
GB-NIR   北アイルランド
GB-WLS   ウェールズ
IE       アイルランド
DE       ドイツ(戦後) / Era 4-5のナチス期ドイツも同コード
AT       オーストリア(戦間期)
YU       ユーゴスラビア(Era 4-8、歴史的)
RS       セルビア
HR       クロアチア
BA       ボスニア
ME       モンテネグロ
BR       ブラジル
AR       アルゼンチン
FR       フランス
IT       イタリア
ES       スペイン
PT       ポルトガル
NL       オランダ
SE       スウェーデン
NO       ノルウェー
DK       デンマーク
FI       フィンランド
CZ       チェコ
HU       ハンガリー
PL       ポーランド
RU       ロシア
NG       ナイジェリア
CM       カメルーン
SN       セネガル
EG       エジプト
ML       マリ
TZ       タンザニア
JP       日本
KR       韓国
CN       中国
IN       インド
CL       チリ
UY       ウルグアイ
JM       ジャマイカ
```

### 3-1-3. image_url の運用

- 本番: `image_url = "/images/pieces/{piece_id:03d}.png"` をCloudflare R2で配信
- R2バケット: `fcms-piece-images` (予定)
- `image_status` で品質管理:
  - `ready`: 本画像完成
  - `provisional`: 仮画像(黒シルエット+TBD)
  - `missing`: 画像なし(開発環境でのみ許容、本番では非公開)

## 3-2. user_pieces テーブル(既存、拡張なし)

既存スキーマ `0001_initial.sql` に存在。今回はそのまま使う。

```sql
-- 既存スキーマ
CREATE TABLE user_pieces (
    user_id      TEXT NOT NULL,
    piece_id     INTEGER NOT NULL,
    acquired_at  INTEGER NOT NULL,
    source       TEXT NOT NULL,   -- 'founding' | 'purchase' | 'gift' | 'reward'
    entitlement_id TEXT,          -- Platform entitlement_id (purchase由来の場合)
    PRIMARY KEY (user_id, piece_id)
);
```

**source 値の用途:**
- `founding`: 新規登録時のFounding Eleven 11人
- `purchase`: Platform経由の課金購入
- `gift`: 運営キャンペーン配布
- `reward`: 将来のランキング報酬など

同じpiece_idを2回持てない(同一コマ非所持の原則、PK制約で保証)。

## 3-3. teams テーブル(既存、最小拡張)

既存スキーマに対して、UI側との整合性のため以下を確認・補足:

```sql
-- 既存 + 推奨カラム
CREATE TABLE teams (
    team_id        TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    slot_number    INTEGER NOT NULL,            -- 1-10のスロット番号
    name           TEXT,                        -- "我が4-4-2" 等の命名(任意)
    formation_data TEXT NOT NULL,               -- JSON: {starters: [...], bench: [...]}
    is_active      INTEGER DEFAULT 0,           -- 最後に使った編成=1
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    UNIQUE(user_id, slot_number)
);
```

**slot_number** の意味:
- `1` = 常時利用可能(無料プレイヤーでも使える)
- `2-10` = 有料(Platform entitlement `fcms_save_slots_9` が必要)

**formation_data** のJSONスキーマ:

```json
{
  "starters": [
    {"piece_id": 71, "hex_col": 10, "hex_row": 3},
    {"piece_id": 155, "hex_col": 8, "hex_row": 8},
    ...
  ],
  "bench": [
    {"piece_id": 38},
    {"piece_id": 135},
    ...
  ],
  "formation_preset": "4-4-2"
}
```

## 3-4. user_ratings テーブル(既存、拡張なし)

```sql
CREATE TABLE user_ratings (
    user_id     TEXT PRIMARY KEY,
    rating      INTEGER NOT NULL DEFAULT 1000, -- Scribe Rating (Elo式)
    games       INTEGER NOT NULL DEFAULT 0,
    wins        INTEGER NOT NULL DEFAULT 0,
    losses      INTEGER NOT NULL DEFAULT 0,
    draws       INTEGER NOT NULL DEFAULT 0,
    peak_rating INTEGER NOT NULL DEFAULT 1000,
    season_id   TEXT,                          -- "2026-S1" 等
    updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_user_ratings_rating ON user_ratings(rating DESC);
CREATE INDEX idx_user_ratings_season ON user_ratings(season_id, rating DESC);
```

## 3-5. NPCチーム定義(新設、データのみ)

NPC 7チームは**時代別プリセットチーム**(The Archive世界観では「Shelf別の代表編成」)。D1に入れる必要はなく、**TypeScriptの定数として `src/data/npc_teams.ts` に定義**すれば十分。

```typescript
// src/data/npc_teams.ts (新設)
export const NPC_TEAMS: NpcTeam[] = [
  {
    id: "npc_dawn",
    shelf: 1,
    name_ja: "草創期オールスター",
    name_en: "Dawn All-Stars",
    formation: "4-4-2",
    piece_ids: [/* 11 piece_ids from Shelf 1 */],
    difficulty_profile: {
      easy: 0.6, medium: 1.0, hard: 1.5
    }
  },
  // ... 7時代分
];
```

### 3-5-1. NPCチーム編成の制約

- 各チームはコスト上限16を**超えてもよい**(NPCは特例)
- ただし表示上の自然さのため、**合計コスト14〜20の範囲**で組む
- 各時代のFC Grassrootsメンバーがいる場合は優先投入(草創期など)

## 3-6. Founding Eleven の扱い

FC Grassroots 11人は**全プレイヤーに初期付与**される。piece_id は名簿から固定:

| FCG# | piece_id | 名前 | ポジション |
|:---:|:---:|---|:---:|
| 1 | 008 | Tom Harding | GK |
| 2 | 009 | Elijah McKay | DF |
| 3 | 010 | Samuel Reid | MF |
| 4 | 023 | Lucas Ashcroft | WG |
| 5 | 035 | Lucy Bryce | VO |
| 6 | 036 | Frank MacKenzie | FW |
| 7 | 037 | Josef Hartmann | SB |
| 8 | 055 | Marius Beckmann | DF |
| 9 | 070 | Ernesto Rivera | SB |
| 10 | 082 | Kevin Mahoney | MF |
| 11 | 104 | Sam Williams | FW |

piece_masterでは `is_founding=1`, `is_purchasable=0` を設定。

---

# §4. 機能仕様

## 4-1. コマ購入

### 4-1-1. 概要

プレイヤーはFCMS内のショップ画面から200人のコマを購入する。決済は**Platform経由**で行い、所持反映はWebhook経由で自動的に完了する。

### 4-1-2. 画面遷移

```
[タイトル] ─▶ [ショップ] ─▶ [カテゴリ選択] ─▶ [コマ詳細] ─▶ [購入確認]
                                                              │
                                                              ▼
                                                  [Platform Stripe画面]
                                                              │
                                                              ▼
                                          [決済完了 → FCMSに戻る]
                                                              │
                                                              ▼
                                             [所持コマリストで確認]
```

### 4-1-3. ショップ画面の仕様

**カテゴリ選択** (画面上部のタブ or スクロールセクション):

| カテゴリ | フィルタ条件 | 目安表示数 |
|---|---|---|
| **新着** | `created_at` が最新のもの10件 | 10 |
| **SS(Sovereign Scribe's Seal)** | `cost=3` | 17 |
| **ポジション別** | GK/DF/SB/MF/VO/OM/FW/WG | 各時代ごと |
| **時代別 (Shelf)** | Dawn / Interwar / Post-War / Expansion / Modernization / Global / Present | 各時代 |
| **家系別** | Blackwood / Weisshaupt / Montefiore / ... | 各家系 |

**コマカード表示**(スマホは縦スワイプ、PCはグリッド):
- 大きい肖像画像(1024×1536マスターから縮小)
- 名前(和英)
- 時代ラベル
- ポジション
- コスト表示(SS、2+、2、1+、1)
- 国籍フラグ
- 所持済みの場合は「所持済み」バッジ + 半透明化
- 価格(catalog_prices から取得)

### 4-1-4. 購入確認ダイアログ

```
┌────────────────────────────────┐
│ 購入確認                         │
├────────────────────────────────┤
│ [画像] Hamish MacFarlane        │
│         SS / OM / Dawn / 蘇    │
│                                │
│ 価格: ¥980                      │
│                                │
│ アーカイブから原本ファイルを       │
│ 複写する手数料として ¥980 を      │
│ お支払いください。                │
│                                │
│ [ キャンセル ]  [ 購入する ]      │
└────────────────────────────────┘
```

### 4-1-5. 所持済みチェック

「購入する」ボタン押下時、サーバー側で以下を確認してから Platform に購入リクエストを送る:

1. FCMS側で `user_pieces` にすでに `piece_id` があるか確認
   - ある場合: 400 ALREADY_OWNED を返す(フロントでエラー表示)
2. Platform側で `entitlements` にすでに active の entitlement があるか確認
   - ある場合: **user_pieces への同期が取れていない状態** → 同期処理を実行してから所持済み通知

### 4-1-6. API仕様

#### フロント → FCMS: ショップカタログ取得

```
GET /api/shop/catalog?category=ss|position=OM|shelf=1|family=macfarlane
Authorization: Bearer <JWT>

Response 200:
{
  "items": [
    {
      "piece_id": 3,
      "sku": "fcms_piece_003",
      "name_ja": "ハミッシュ・マクファーレン",
      "name_en": "Hamish MacFarlane",
      "position": "OM",
      "cost": 3,
      "cost_display": "SS",
      "era_shelf": 1,
      "era_shelf_name": "Dawn",
      "nationality": "GB-SCO",
      "family": "macfarlane",
      "summary_ja": "盤を作った老人、時代を超えた夢の設計者",
      "image_url": "/images/pieces/003.png",
      "is_owned": false,
      "price": {
        "price_id": "price_fcms_ss_980",
        "amount_cents": 98000,
        "currency": "JPY"
      }
    }
    // ...
  ],
  "next_page_token": "..."
}
```

内部実装:
1. FCMS の `piece_master` から条件に合う `is_purchasable=1` のレコードを取得
2. Platform の `/v1/commerce/catalog?tag=fcms_piece` を呼び出し、価格情報を取得
3. SKUで結合してレスポンス構築
4. 自分の `user_pieces` と照合して `is_owned` フラグ付与

#### フロント → FCMS → Platform: 購入開始

```
POST /api/shop/purchase
Authorization: Bearer <JWT>
Idempotency-Key: <UUID>
Content-Type: application/json

{
  "piece_id": 3,
  "price_id": "price_fcms_ss_980"
}

Response 201:
{
  "purchase_id": "<Platform purchase_id>",
  "checkout_url": "https://checkout.stripe.com/...",
  "status": "pending"
}
```

内部実装:
1. `user_pieces` で所持済みチェック → 重複なら 409 ALREADY_OWNED
2. `piece_master` で `is_purchasable=1` を確認 → そうでなければ 400 NOT_PURCHASABLE
3. Platform の `POST /v1/commerce/purchase` を呼び出し
   - `sku = fcms_piece_{piece_id:03d}`
   - `price_id` はユーザーから受け取った値
   - `provider = "stripe"`
4. Platform から返る `checkout_url` をそのまま転送

### 4-1-7. Webhook受信(Platform → FCMS)

```
POST /webhook/platform-entitlement
X-Webhook-Signature: sha256=<HMAC>
X-Webhook-Event: entitlement.created | entitlement.revoked
X-Webhook-Delivery-Id: <UUID>
Content-Type: application/json

{
  "event_type": "entitlement.created",
  "event_id": "evt_...",
  "timestamp": "2026-04-23T10:00:00Z",
  "data": {
    "user_id": "<Platform user_id>",
    "sku": "fcms_piece_003",
    "entitlement_id": "<Platform entitlement_id>",
    "state": "active"
  }
}
```

**処理フロー:**

1. `X-Webhook-Signature` を HMAC-SHA256 で検証
   - Secret は `PLATFORM_WEBHOOK_SECRET` (Workers Secret)
   - 署名不一致: 401 を返す(即時)
2. `X-Webhook-Delivery-Id` で冪等性確保
   - 既に処理済みの delivery_id なら 200 OK を即返す(冪等)
3. `sku` から `piece_id` を抽出
   - パターン: `/^fcms_piece_(\d{3})$/`
   - マッチしない: 400 INVALID_SKU
4. `piece_master` に存在するか確認 → ない: 400 UNKNOWN_PIECE
5. イベント別処理:
   - **entitlement.created**: `user_pieces` に INSERT
     - 既に存在する場合は UPDATE で entitlement_id を最新化(冪等)
   - **entitlement.revoked**: `user_pieces` から DELETE
     - ただし `source='purchase'` のレコードのみ削除(founding/giftは保護)
6. 処理ログを `webhook_deliveries_received` テーブルに記録(新設、後述)

### 4-1-8. 既存Webhook実装との整合性

CLAUDE.md(FCMS側)に「購入Webhook(HMAC署名)」実装済みとあるが、**既存は `/webhook/purchase` に実装されている可能性**がある。本書では正式に `/webhook/platform-entitlement` に統一することを推奨する。

既存実装と衝突する場合は、以下のいずれかを選択:
- **A**: 両エンドポイント併存(既存を段階的にデプレケート)
- **B**: 既存を改名(`/webhook/purchase` → `/webhook/platform-entitlement`)
- **C**: 既存を流用(内部ロジックだけ本書の仕様に書き直す)

**推奨: C** 。既存エンドポイント `/webhook/purchase` を残し、内部ロジックを本書仕様に合わせる。

### 4-1-9. Platform側のWebhook登録(運用作業)

初回だけ以下を実行する必要がある。Platform管理画面 or SQL:

```sql
-- Platform側PostgreSQL
INSERT INTO game_webhook_endpoints (
  game_id, url, events, secret_encrypted, is_active
) VALUES (
  'fcms',
  'https://football-chess-maniacs.yanagiho.workers.dev/webhook/purchase',
  ARRAY['entitlement.created', 'entitlement.revoked'],
  '<AES-256-GCM encrypted secret>',
  true
);
```

もしくは Platform API:
```
POST /v1/webhooks/game-notify
Authorization: Bearer <admin JWT>
{
  "game_id": "fcms",
  "url": "https://football-chess-maniacs.yanagiho.workers.dev/webhook/purchase",
  "events": ["entitlement.created", "entitlement.revoked"],
  "secret": "<生成したHMACシークレット>"
}
```

### 4-1-10. 障害時の同期(ユーザー主導)

万一Webhookが失敗し続けた場合に備え、**ユーザーが手動で同期を起こせる導線**を用意する:

```
POST /api/pieces/sync
Authorization: Bearer <JWT>

Response 200:
{
  "synced": 2,
  "added_pieces": [3, 38]
}
```

内部実装:
1. Platform `GET /v1/entitlements?tag=fcms_piece` を呼び出し、active entitlements を全取得
2. FCMS の `user_pieces` と差分を取って、足りないものを INSERT
3. 反映結果を返す

ショップ画面のヘッダーに小さく「⟳ 同期」ボタンを置く。

### 4-1-11. 価格設計(参考)

仕様書 `docs/fcms_spec_v3.md` §12 に「価格体系はサービスイン直前に決定」とある。参考値:

| コスト | 推奨価格 (JPY) | 理由 |
|:---:|:---:|---|
| 1 (基礎) | ¥120 | 量産したいので低価格 |
| 1+ | ¥240 | |
| 2 | ¥480 | |
| 2+ | ¥780 | |
| SS | ¥980 | レジェンド感の価格 |

運用で調整。価格は `catalog_prices` テーブルで動的変更可能。

---

## 4-2. チーム編成

### 4-2-1. 概要

既存の `Formation.tsx v2` がすでに実装済み(手持ちコマ制・プリセット6種・セーブスロット10枠・ミニピッチ配置)。本節は**既存実装の確認**と**ピースマスタ連携部分のみ**を規定する。

### 4-2-2. 画面仕様(既存確認)

**手持ちコマ表示エリア:**
- フィルタ: ポジション8種、コスト5段階、時代7種(Shelf)、家系8種
- 使用中のコマは半透明
- コスト超過はグレーアウト
- ソート: コスト降順 / 獲得日順 / 名前順

**フォーメーションプリセット6種:**
```
4-4-2 / 3-5-2 / 3-6-1 / 4-3-3 / 4-2-3-1 / 3-4-3
```

**ミニピッチ配置:**
- タップでコマ選択 → タップでHEXスナップ移動
- 総コスト16を超える配置は赤枠警告、確定ブロック

### 4-2-3. 既存 Formation.tsx への修正点

現状のFormation.tsxは**UIのみ**で、サーバー連携は `onFormationConfirm` callback 経由でApp.tsxに委ねられている。本書で以下を追加する:

1. **所持コマ取得APIの呼び出し**: マウント時に `GET /api/pieces`
2. **所持コマ詳細の取得**: `GET /api/pieces` で piece_master との JOIN 結果を受け取る
3. **画像表示**: piece_master の `image_url` を使って肖像を表示(小サムネイル64px程度)

### 4-2-4. API仕様

#### フロント → FCMS: 所持コマ取得

```
GET /api/pieces
Authorization: Bearer <JWT>

Response 200:
{
  "items": [
    {
      "piece_id": 3,
      "sku": "fcms_piece_003",
      "name_ja": "ハミッシュ・マクファーレン",
      "name_en": "Hamish MacFarlane",
      "position": "OM",
      "cost": 3,
      "cost_display": "SS",
      "era_shelf": 1,
      "era_shelf_name": "Dawn",
      "nationality": "GB-SCO",
      "family": "macfarlane",
      "summary_ja": "盤を作った老人、時代を超えた夢の設計者",
      "image_url": "/images/pieces/003.png",
      "acquired_at": 1714000000,
      "source": "purchase"
    },
    // ...
  ],
  "total": 12,
  "max_allowed": 200
}
```

内部実装:
- `SELECT` with `user_pieces JOIN piece_master ON piece_id`
- 200件超過チェック(既存仕様の所持上限)

### 4-2-5. バリデーションルール

既存 `api/team.ts` に実装済みの以下を維持:

- **GK 1枚制約**: スタメン11枚の中にGKが**ちょうど1枚**
- **コスト16制約**: スタメン11枚の合計コストが16以下
- **コマ所持チェック**: 指定した piece_id を全て所持している
- **同一コマの複数使用禁止**: starters と bench に同じ piece_id がない

---

## 4-3. 編成セーブ

### 4-3-1. 概要

プレイヤーは最大10スロットまで編成を保存できる。

- **無料プレイヤー**: スロット1のみ使用可能
- **課金プレイヤー**: スロット2-10を解放するエンタイトルメント `fcms_save_slots_9` が必要

### 4-3-2. Platform側のSKU定義

```
SKU: fcms_save_slots_9
type: subscription | consumable (要判断)
名前: プレミアム書棚(編成スロット9枠)
```

**subscription vs 買い切り** の判断が必要:

**推奨: subscription** (月額 or 年額)。理由:
- Platform側で自然に扱える
- 継続課金で安定した収益
- セーブ権がないと残る編成は1つだけなので、解約時の挙動が明確

仮に**買い切り**にする場合:
- `entitlement.end_at = NULL` で永続有効
- 価格は¥1,980等のワンショット
- セーブ権はアーカイブの「永久書棚」という世界観で表現

**最終判断はビジネス側でお願いします**。仕様書は subscription 前提で書く。

### 4-3-3. 画面仕様

**セーブスロット一覧UI**(編成画面の右側 or ヘッダー):

```
┌─ 書棚 (Bookshelf) ──────────┐
│ [1] 標準 4-4-2          ★   │ ← アクティブ(★マーク)
│ [2] 対Dawn用 4-3-3          │
│ [3] 攻撃重視 3-4-3          │
│ [4] (空きスロット)   🔒     │ ← プレミアム未購入なら鍵アイコン
│ [5] (空きスロット)   🔒     │
│ ...                         │
└─────────────────────────────┘
```

鍵アイコンをタップ → Platform の `fcms_save_slots_9` 購入フローへ誘導。

### 4-3-4. API仕様

#### フロント → FCMS: 編成一覧取得

```
GET /api/teams
Authorization: Bearer <JWT>

Response 200:
{
  "teams": [
    {
      "team_id": "uuid",
      "slot_number": 1,
      "name": "標準 4-4-2",
      "formation_preset": "4-4-2",
      "is_active": true,
      "total_cost": 15.5,
      "created_at": 1714000000,
      "updated_at": 1714100000
    }
  ],
  "max_slots": 10,
  "available_slots": 1,  // entitlement確認済み
  "is_premium": false
}
```

内部実装:
- `SELECT * FROM teams WHERE user_id = ? ORDER BY slot_number`
- Platform `POST /v1/entitlements/check { sku: "fcms_save_slots_9" }` で `is_premium` 判定
- `available_slots` = is_premium ? 10 : 1

#### フロント → FCMS: 編成詳細取得

```
GET /api/teams/:team_id
Authorization: Bearer <JWT>

Response 200:
{
  "team_id": "uuid",
  "slot_number": 1,
  "name": "標準 4-4-2",
  "formation_preset": "4-4-2",
  "formation_data": {
    "starters": [
      {"piece_id": 71, "hex_col": 10, "hex_row": 3},
      // ...
    ],
    "bench": [
      {"piece_id": 38},
      // ...
    ]
  },
  "pieces_detail": [
    // piece_masterからのJOIN結果を併記、UIで追加の取得不要に
  ],
  "total_cost": 15.5,
  "is_active": true
}
```

#### フロント → FCMS: 編成保存(新規 or 更新)

```
PUT /api/teams/:slot_number
Authorization: Bearer <JWT>
Idempotency-Key: <UUID>
Content-Type: application/json

{
  "name": "標準 4-4-2",
  "formation_preset": "4-4-2",
  "formation_data": {
    "starters": [...],
    "bench": [...]
  }
}

Response 200:
{
  "team_id": "uuid",
  "slot_number": 1,
  "updated_at": 1714100000
}
```

内部実装:
1. `slot_number` が 1-10 の範囲か検証
2. `slot_number >= 2` の場合、Platform `/v1/entitlements/check fcms_save_slots_9` で確認
   - active でない: 403 PREMIUM_REQUIRED
3. `formation_data` のバリデーション(§4-2-5参照)
4. UPSERT 実行

#### フロント → FCMS: アクティブ編成切替

```
PUT /api/teams/:slot_number/activate
Authorization: Bearer <JWT>

Response 200:
{ "active_team_id": "uuid" }
```

内部実装:
- トランザクション内で全teamsの `is_active=0` にしてから指定slotを `is_active=1`

### 4-3-5. 編成保存のフローチャート

```
[編成画面で「保存」タップ]
     │
     ▼
[スロット選択ダイアログ表示]
     │
     ├── [スロット1]──────────▶ PUT /api/teams/1 (常時可能)
     │
     └── [スロット2-10]
           │
           ├── is_premium=true ─▶ PUT /api/teams/n
           │
           └── is_premium=false
                 │
                 ▼
           [プレミアム購入誘導ダイアログ]
                 │
                 └── Platform /v1/commerce/purchase へ
```

---

## 4-4. NPCチーム対戦

### 4-4-1. 概要

既存のCOM対戦フローに加えて、**時代別プリセットNPCチーム7つ**から対戦相手を選べる機能を追加する。

既存実装: `ModeSelect.tsx → COM対戦選択 → ランダムCOM AI対戦`
本書追加: `ModeSelect.tsx → COM対戦 → NPCチーム選択画面 → 対戦開始`

### 4-4-2. 画面遷移

```
[モード選択]
  │
  ├─ オンライン対戦(既存)
  ├─ フレンド対戦(既存)
  ├─ COM対戦 ─┐
  │           │
  │           ▼
  │    [COM対戦サブメニュー](新設)
  │           ├─ ランダムCOM(既存)
  │           └─ NPCチーム選択(新設)
  │                   │
  │                   ▼
  │           [NPCチーム一覧画面](新設)
  │           Shelf 1: Dawn All-Stars
  │           Shelf 2: Interwar All-Stars
  │           ...
  │           Shelf 7: Present All-Stars
  │                   │
  │                   ▼
  │           [難易度選択]
  │                   │
  │                   ▼
  │           [自分のチーム選択](既存)
  │                   │
  │                   ▼
  │           [マッチング→バトル]
```

### 4-4-3. NPCチーム一覧画面

```
┌─ NPCチーム選択 ─────────────────┐
│                                 │
│ Shelf 1: Dawn All-Stars         │
│ (草創期 1863-1909)               │
│ [代表コマ小サムネイル11個]         │
│                                 │
│ Shelf 2: Interwar All-Stars     │
│ (戦間期 1910-1939)               │
│ ...                             │
│                                 │
└─────────────────────────────────┘
```

各カードには:
- 時代名(ja / en)
- 年代
- 代表コマ(コスト順でスタメン11人のサムネイル表示)
- 平均コスト
- 戦術イメージ(例: "守備重視のカテナチオ" 等)

### 4-4-4. 既存のCOM対戦フローへの接続

ModeSelect.tsxで、既存の「COM対戦」を選択した後にサブメニューを表示:

```typescript
// 新設: NpcTeamSelect.tsx
interface NpcTeamSelectProps {
  onSelectTeam: (npcTeam: NpcTeam) => void;
  onBack: () => void;
}
```

選択後のフローは既存のCOM対戦と同じ:
- 自分のアクティブチーム(editable前) or 編成画面へ
- 難易度選択(beginner/regular/maniac)
- マッチング演出 → Battle.tsx
- Battle.tsxで相手チームデータ(NPCTeam)を受け取る

### 4-4-5. Battle.tsxへのNPCチームデータ引き渡し

App.tsx の状態に既存の `comDifficulty` に加えて、新規に `npcTeamId?: string` を持たせる。

Battle.tsx の初期化時:

```typescript
// 既存の初期盤面生成を、NPC指定時は置き換える
if (npcTeamId) {
  const npcTeam = NPC_TEAMS.find(t => t.id === npcTeamId);
  awayPieces = createPiecesFromNpcTeam(npcTeam);
} else {
  // 既存のデフォルトawayチーム
}
```

### 4-4-6. NPCチームデータのシード

200人名簿から7時代それぞれ11人×αを選定して `src/data/npc_teams.ts` に投入。**Founding Elevenは含めない**(プレイヤーと被るため)。

選定方針:
- 時代のShelf内で、なるべく多様なポジションを揃える
- SS1〜2人 + 中堅複数で総コスト18〜22程度
- 合計コスト18超の場合はCOM特例として許容(仕様§11)

### 4-4-7. 勝敗結果の扱い

NPC対戦の勝敗は **Scribe Ratingに反映しない**(ランクマッチではないため)。
既存のAIランダムCOMも同様に非レーティング試合として扱う。

試合結果の保存は行う(リプレイ用途):
- `matches` テーブルに `mode='npc_vs_com'` で記録
- 将来的に「NPC対戦の連勝記録」「時代別達成状況」等の拡張余地を残す

---

## 4-5. ランキング表示

### 4-5-1. 概要

- **Scribe Rating**(Elo式)を表示する画面を新設
- グローバルランキング、自分の順位、フレンドランキング(任意)

The Archive世界観では「**Archivist Rankings**」と呼ぶ。UI上の名称は「アーキビスト・ランキング」。

### 4-5-2. 画面仕様

```
┌─ アーキビスト・ランキング ────────┐
│                                  │
│ [ 全体 ] [ フレンド ]             │ ← タブ切替
│                                  │
│ シーズン: 2026-S1 (残り12日)      │
│                                  │
│ あなた: 1,234 (Rank #1,847)      │ ← ユーザー自身
│ ─────────────────────────        │
│                                  │
│ #1  Alice              1,842     │
│ #2  Bob                1,821     │
│ #3  Charlie            1,798     │
│ ...                              │
│ #1,845 Previous User   1,235     │ ← 自分の上下
│ #1,846 Previous User   1,234     │
│ #1,847 YOU             1,234     │
│ #1,848 Next User       1,233     │
│ #1,849 Next User       1,232     │
│ ...                              │
│                                  │
│ [ 上位100人を見る ]              │
└──────────────────────────────────┘
```

### 4-5-3. API仕様

#### フロント → FCMS: グローバルランキング取得

```
GET /api/rankings/global?season=2026-S1&limit=100&offset=0
Authorization: Bearer <JWT>

Response 200:
{
  "season_id": "2026-S1",
  "season_end_at": 1715000000,
  "items": [
    {
      "rank": 1,
      "user_id": "uuid",
      "display_name": "Alice",    // Platformからjoin
      "rating": 1842,
      "games": 120,
      "wins": 88,
      "losses": 28,
      "draws": 4
    },
    // ...
  ],
  "total_players": 5432,
  "my_rank": 1847,
  "my_rating": 1234,
  "my_stats": {
    "games": 45, "wins": 18, "losses": 22, "draws": 5
  }
}
```

内部実装:
1. `user_ratings` から `ORDER BY rating DESC LIMIT ? OFFSET ?`
2. 各ユーザーの `display_name` を Platform から取得(キャッシュ活用、詳細は§4-5-5)
3. 自分の順位はウィンドウ関数 or サブクエリで取得

#### フロント → FCMS: 自分周辺ランキング取得

```
GET /api/rankings/around-me?season=2026-S1&range=5
Authorization: Bearer <JWT>

Response 200:
{
  "items": [
    // 自分の上位5人 + 自分 + 下位5人
  ]
}
```

#### フロント → FCMS: フレンドランキング取得

```
GET /api/rankings/friends?season=2026-S1
Authorization: Bearer <JWT>

Response 200:
{
  "items": [
    // Platformの/v1/social/friends から取得したフレンドのみ
    // + 自分
  ]
}
```

内部実装:
1. Platform `GET /v1/social/friends` で自分のフレンドuser_id一覧を取得
2. `user_ratings` から `WHERE user_id IN (...)` で取得
3. レーティング降順でソート

### 4-5-4. display_name の取得戦略

`user_ratings` には user_id しか無い。display_name は Platform側の `profiles` にあるため、毎回Platformを叩くのは非効率。対策:

**オプション A: display_name キャッシュテーブル(推奨)**

FCMS側に以下のキャッシュテーブルを新設:

```sql
CREATE TABLE user_display_name_cache (
    user_id       TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    cached_at     INTEGER NOT NULL
);
```

- 試合結果を記録するタイミングで `display_name` も取得して UPDATE
- TTL: 24時間。古ければ Platform を叩く
- プレイヤーがプロフィール変更してもFCMS内表示は最大1日遅れる(許容)

**オプション B: Platform にバッチ取得APIを追加**

`POST /v1/users/batch { user_ids: [...] }` を新設してもらう。これは Platform 側の実装変更が必要なため**推奨しない**(疎結合原則違反)。

**推奨: オプション A**。

### 4-5-5. シーズン管理

- シーズン期間: **月次**(例: 2026-S1 = 2026-01-01〜01-31)
- シーズン終了時:
  - `user_ratings.season_id` を新シーズンに更新
  - 全員の `rating` を「2/3重み + 1/3を1000に引き戻し」でリセット(Elo伝統)
    - 例: 1842 → 1000 + (1842-1000) × 2/3 = 1561
  - 新シーズン初戦は必ず実力近い相手とマッチ(仕様§4-6)

季節毎のリセット処理は Cloudflare Cron で深夜に実行:

```typescript
// apps/api/src/jobs/season_reset.ts (新設)
// Cron: 0 0 1 * * (毎月1日 00:00)
```

---

## 4-6. ランキングマッチング

### 4-6-1. 概要

既存の `Matchmaking DO`(シャード構成)を拡張して、**ランクマッチ**を実装する。

FCMS仕様書 §14-3 準拠:
- Elo式
- 初期レート: 1000
- 変動幅: 勝敗で ±15〜30
- **マッチング条件**: レーティング差±200以内を優先。待ち時間で段階拡大

### 4-6-2. 画面仕様

```
[モード選択]
  │
  └─ ランクマッチ(新設)
       │
       ▼
[自分のチーム選択](既存 Formation.tsx v2)
       │
       ▼
[マッチング演出画面](既存 Matching.tsx に拡張)
       │
       │ "あなたのレーティング: 1234 (Silver Scribe)"
       │ "対戦相手を検索中..."
       │ 経過時間: 00:12
       │
       ▼
[マッチ成立 → Battle.tsx]
```

### 4-6-3. Matchmaking DO の拡張

既存の `durable/matchmaking.ts` に**キュー種別**を追加する。

既存: `casual`(カジュアル)、`ranked`(レート未実装の仮置き)

拡張後:

```typescript
enum MatchmakingQueueType {
  Casual = "casual",
  Ranked = "ranked",
}

interface RankedQueueEntry {
  userId: string;
  rating: number;
  queuedAt: number;        // Unix ms
  targetTeamId: string;    // 自分のアクティブチーム
  connectionInfo: WsAttachment;
}
```

### 4-6-4. マッチング・アルゴリズム

仕様書準拠(§14-3):

```
t = 経過時間(秒)
対戦可能レーティング範囲 = rating ± (200 + 50 × floor(t / 10))

例:
  t=0-9秒:    ±200
  t=10-19秒:  ±250
  t=20-29秒:  ±300
  t=30-39秒:  ±350
  t=40-49秒:  ±400
  t=60秒以降: ±500 (上限)
```

この範囲内で、**最も近いレーティング**のプレイヤーとマッチング成立。

120秒(2分)経過してもマッチしない場合は **COM対戦へのフォールバック提案** を表示:

```
┌─────────────────────────────┐
│ 対戦相手が見つかりません      │
│ (2分経過)                   │
│                             │
│ このままの条件で待ち続けるか、 │
│ 練習としてCOMと対戦しますか?  │
│                             │
│ [ 待ち続ける ]  [ COM対戦 ]  │
└─────────────────────────────┘
```

### 4-6-5. Elo更新ロジック

```typescript
// src/engine/rating.ts (新設)
export function calcRatingDelta(
  myRating: number,
  opponentRating: number,
  result: "win" | "loss" | "draw",
  gamesPlayed: number
): number {
  const K = gamesPlayed < 30 ? 32 : 24; // 新人は変動大きく、ベテランは小さく
  const expected = 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
  const actual = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
  return Math.round(K * (actual - expected));
}
```

試合終了時、`GameSession DO` から以下のAPIを叩く:

```
POST /internal/match-result
(DO→API internal call, secret-based auth)

{
  "match_id": "uuid",
  "home_user_id": "uuid",
  "away_user_id": "uuid",
  "result": "home_win" | "away_win" | "draw",
  "mode": "ranked"
}
```

内部処理:
1. `mode='ranked'` のみレーティング更新
2. 両者の新レーティングを計算して `user_ratings` UPDATE
3. `matches` テーブルに結果INSERT

### 4-6-6. ランクティア表示

数値だけでは味気ないので、レーティングに応じた称号(ティア)を表示:

| ティア | レーティング範囲 | 日本語名 | 色 |
|---|---|---|---|
| Novice Scribe | 0-1199 | 見習いアーキビスト | 茶 |
| Silver Scribe | 1200-1399 | 銀の書記 | 銀 |
| Gold Scribe | 1400-1599 | 金の書記 | 金 |
| Master Archivist | 1600-1799 | マスター・アーキビスト | 青 |
| Council Member | 1800-1999 | 評議会員 | 赤 |
| Council Leader | 2000+ | 評議会長 | 紫 |

シーズン上位100人は**Council of Archivists**として特別バッジを付与(The Archive世界観§8-3)。

### 4-6-7. 不正対策

- 同一IPからの連続対戦: レート制限(既存 `middleware/rate_limit.ts` 流用)
- 意図的な敗北(サンドバッギング): 検出困難だが、大きなレーティング差で負け続ける場合は警告
- 試合途中離脱: `GameSession DO` が切断タイムアウト(既存、30秒)後に勝敗確定

### 4-6-8. API仕様

#### フロント → FCMS: ランクマッチキュー参加

既存の`/match/ws` WebSocketを流用:

```
ws://{host}/match/ws?token=<JWT>

Client→Server: JOIN_QUEUE
{
  "queue_type": "ranked",
  "team_id": "uuid"
}

Server→Client: QUEUE_JOINED
{
  "queue_type": "ranked",
  "current_rating": 1234,
  "target_range": [1034, 1434]
}

... (待機中)

Server→Client: RATING_RANGE_EXPANDED
{
  "target_range": [984, 1484]
}

... (マッチ成立)

Server→Client: MATCH_FOUND
{
  "match_id": "uuid",
  "opponent_rating": 1250,
  "opponent_display_name": "Bob",
  "ws_url": "ws://{host}/match/{match_id}/ws"
}
```

---

# §5. API仕様(まとめ)

## 5-1. FCMS新規API一覧

| Method | Path | 目的 | §参照 |
|---|---|---|---|
| GET | /api/shop/catalog | ショップカタログ取得 | §4-1-6 |
| POST | /api/shop/purchase | 購入開始 | §4-1-6 |
| POST | /webhook/purchase (既存) | Platform Webhook受信 | §4-1-7 |
| POST | /api/pieces/sync | 手動同期 | §4-1-10 |
| GET | /api/pieces | 所持コマ取得 | §4-2-4 |
| GET | /api/teams | 編成一覧 | §4-3-4 |
| GET | /api/teams/:team_id | 編成詳細 | §4-3-4 |
| PUT | /api/teams/:slot_number | 編成保存 | §4-3-4 |
| PUT | /api/teams/:slot_number/activate | アクティブ切替 | §4-3-4 |
| GET | /api/rankings/global | グローバルランキング | §4-5-3 |
| GET | /api/rankings/around-me | 自分周辺ランキング | §4-5-3 |
| GET | /api/rankings/friends | フレンドランキング | §4-5-3 |
| WS | /match/ws (既存拡張) | ランクキュー参加 | §4-6-8 |
| POST | /internal/match-result | 試合結果記録(内部) | §4-6-5 |

## 5-2. FCMS側から呼ぶPlatform API

| Method | Path | 目的 | 認証 |
|---|---|---|---|
| GET | /.well-known/jwks.json | JWKS取得(キャッシュ) | Public |
| GET | /v1/commerce/catalog?tag=fcms_piece | コマ価格取得 | Public |
| POST | /v1/commerce/purchase | 購入セッション作成 | Bearer |
| POST | /v1/entitlements/check | エンタイトル確認 | Bearer |
| GET | /v1/entitlements?tag=fcms_ | エンタイトル一覧 | Bearer |
| GET | /v1/social/friends | フレンド一覧 | Bearer |

---

# §6. Platform Webhook受信詳細

## 6-1. Webhook処理の冪等化

同じ `X-Webhook-Delivery-Id` が複数回届いても処理が1回に限定される必要がある。

```sql
CREATE TABLE webhook_deliveries_received (
    delivery_id  TEXT PRIMARY KEY,
    event_type   TEXT NOT NULL,
    received_at  INTEGER NOT NULL,
    processed    INTEGER DEFAULT 0,
    result       TEXT
);
```

処理フロー:
1. `INSERT OR IGNORE INTO webhook_deliveries_received ...`
2. 挿入された(新規)場合のみ実処理
3. 既存レコードの場合は即座に 200 OK を返す(冪等)

## 6-2. HMAC署名検証

```typescript
// src/api/webhooks.ts
async function verifyHMAC(body: string, signature: string, secret: string) {
  const expected = await hmacSHA256(secret, body);
  return timingSafeEqual(
    `sha256=${expected}`,
    signature
  );
}
```

## 6-3. エラー時の挙動

| 状況 | HTTPステータス | Platform側の挙動 |
|---|---|---|
| 署名不正 | 401 | 再送しない(即座に諦め) |
| 不明SKU | 400 | 再送しない |
| 冪等キー既処理 | 200 | 完了 |
| DB接続エラー | 500 | 再送(指数バックオフ) |
| タイムアウト | 504 | 再送(指数バックオフ) |

Platform側は失敗時に 10秒→60秒→300秒の3回リトライする(§5 WEBHOOK_RETRY_DELAYS_SEC)。

---

# §7. シーケンス図(購入〜所持反映の完全フロー)

```
Player         FCMS-Client    FCMS-API      Platform      Stripe
  │                │            │             │             │
  │ 1.ショップ表示 │            │             │             │
  │───────────────▶│            │             │             │
  │                │ 2.GET /api/shop/catalog   │             │
  │                │───────────▶│             │             │
  │                │            │ 3.GET /v1/commerce/catalog │
  │                │            │────────────▶│             │
  │                │            │◀────────────│prices[]     │
  │                │            │             │             │
  │                │            │ piece_master JOIN          │
  │                │◀───────────│ items[]     │             │
  │                │            │             │             │
  │ 4.タップ       │            │             │             │
  │───────────────▶│            │             │             │
  │                │ 5.POST /api/shop/purchase │             │
  │                │───────────▶│             │             │
  │                │            │ owned check │             │
  │                │            │ 6.POST /v1/commerce/purchase
  │                │            │────────────▶│             │
  │                │            │             │ pending作成  │
  │                │            │◀────────────│checkout_url │
  │                │◀───────────│checkout_url │             │
  │ 7.遷移         │            │             │             │
  │◀───────────────│            │             │             │
  │                                                          │
  │ 8.Stripeページで決済───────────────────────────────────▶│
  │                                                          │
  │                                          │9.Webhook     │
  │                                          │◀─────────────│
  │                                          │              │
  │                                          │ paid更新 +   │
  │                                          │ entitlement  │
  │                                          │              │
  │                            │10.POST /webhook/purchase    │
  │                            │◀─────────────│              │
  │                            │ HMAC検証     │              │
  │                            │ 冪等チェック  │              │
  │                            │ SKU → piece_id│             │
  │                            │ INSERT user_pieces          │
  │                            │─────────────▶│200 OK        │
  │                                           │              │
  │ 11.Stripe完了ページ→FCMSへリダイレクト                    │
  │◀──────────────────────────────────────────────────────── │
  │                │            │             │              │
  │ 12.マイコマ画面                                           │
  │───────────────▶│            │             │              │
  │                │ 13.GET /api/pieces        │             │
  │                │───────────▶│             │              │
  │                │◀───────────│所持コマ一覧 │              │
  │                │ 購入したコマが含まれる ✓                 │
```

---

# §8. エラー処理・再送

## 8-1. エラーコード一覧

| コード | HTTP | 説明 |
|---|---|---|
| VALIDATION_ERROR | 400 | リクエストボディ不正 |
| INVALID_PIECE_ID | 400 | piece_idが存在しない |
| INVALID_SKU | 400 | SKU形式不正 |
| NOT_PURCHASABLE | 400 | 非売品コマ(Founding Eleven等) |
| ALREADY_OWNED | 409 | 既に所持済み |
| PREMIUM_REQUIRED | 403 | 課金エンタイトル不足 |
| GK_REQUIRED | 400 | スタメンにGKがいない |
| COST_EXCEEDED | 400 | コスト上限16超過 |
| PIECE_NOT_OWNED | 400 | 指定コマが未所持 |
| DUPLICATE_PIECE | 400 | 同一コマの複数指定 |
| RATE_LIMITED | 429 | レート制限 |
| WEBHOOK_SIGNATURE_INVALID | 401 | Webhook署名不正 |
| INTERNAL_ERROR | 500 | サーバー内部エラー |

## 8-2. Platform API呼び出し失敗時のフォールバック

| 呼び出し | 失敗時の挙動 |
|---|---|
| GET /v1/commerce/catalog | 1時間キャッシュで代替。24時間キャッシュ切れたら 503 |
| POST /v1/commerce/purchase | 即座にユーザーエラー(決済開始失敗) |
| POST /v1/entitlements/check | タイムアウト時はキャッシュ利用(5分TTL) |
| GET /v1/entitlements | 60秒キャッシュ |
| GET /v1/social/friends | 5分キャッシュ |

## 8-3. 冪等性の保証

POSTリクエスト全て `Idempotency-Key` ヘッダー必須(Platform側の規約に準拠)。

```typescript
// middleware/idempotency.ts (既存 FCMS にあれば流用、なければ新設)
// キー: Idempotency-Key + path + userId
// TTL: 24時間
// ストレージ: D1 or KV
```

---

# §9. テスト観点

## 9-1. ユニットテスト

- `piece_master` CRUD
- SKU ↔ piece_id 変換
- HMAC署名検証
- Elo計算
- バリデーション(GK/コスト/所持/重複)

## 9-2. 統合テスト

- **購入フロー E2E**: カタログ取得 → 購入開始 → Webhook受信 → 所持反映
- **Webhook冪等性**: 同じdelivery_idを2回投げて1回しか処理されない
- **編成保存**: スロット1無料、スロット2有料、コスト超過拒否
- **ランクマッチ**: レート近接でマッチ、120秒でタイムアウト

## 9-3. 手動テスト

- Platform連携の完全フロー(Stripe実決済)
- NPCチーム対戦の全7時代
- シーズンリセット動作

---

# §10. 実装優先度・マイルストーン

## 10-1. フェーズ分け

### Phase 1: データ投入(画像制作完了後)

- [ ] `piece_master` テーブル作成 + 200件投入
- [ ] R2バケット作成、200画像アップロード
- [ ] Platform `catalog_items` に200 SKU投入
- [ ] Platform `catalog_prices` 投入
- [ ] NPC 7チーム定義作成

### Phase 2: バックエンド実装

- [ ] GET /api/shop/catalog
- [ ] POST /api/shop/purchase
- [ ] POST /webhook/purchase の完全実装
- [ ] GET /api/pieces
- [ ] POST /api/pieces/sync
- [ ] Founding Eleven の初回付与ロジック

### Phase 3: 編成・対戦

- [ ] teams系API全体
- [ ] NPCチーム対戦モード
- [ ] 既存Formation.tsx への画像連携

### Phase 4: ランキング

- [ ] user_ratings 拡張
- [ ] Elo計算
- [ ] /api/rankings/* 系
- [ ] ランクマッチ(Matchmaking DO拡張)

### Phase 5: 運用

- [ ] シーズンリセット Cron
- [ ] display_name キャッシュ
- [ ] ユーザー側「同期」ボタン
- [ ] エラーログ・監視

## 10-2. MVP判定

サービスインに必須:
- Phase 1, 2, 3(Phase 3のうちNPC対戦は優先度中)

サービスイン後の早期追加:
- Phase 4(ランキング)は仕様書§15 "サービスイン後の早期追加" に該当

## 10-3. 200画像完成前の開発進行

- **仮画像(§8-1 グラフィック仕様書)** で全APIと画面の動作を検証
- piece_master の `image_status='provisional'` で区別
- 本番リリース前に全画像を`ready`に切替え

---

# 付録A — 運用で必要な作業チェックリスト

## A-1. Platform側(運用作業)

- [ ] Platform 本番環境に200 SKUを `catalog_items` に投入
- [ ] 各SKUの `catalog_prices` 投入(JPYで設定)
- [ ] `fcms_save_slots_9` SKU追加(subscription)
- [ ] `game_webhook_endpoints` にFCMS URL登録
- [ ] Webhook secret を FCMS の `PLATFORM_WEBHOOK_SECRET` と同期

## A-2. FCMS側(環境変数)

追加する Workers Secrets:
- `PLATFORM_BASE_URL` (例: `https://platform.football-century.com`)
- `PLATFORM_JWKS_URL` (例: `${PLATFORM_BASE_URL}/.well-known/jwks.json`)
- `PLATFORM_WEBHOOK_SECRET` (HMAC共通鍵)
- `PLATFORM_API_KEY` (サーバー間通信用、もしあれば)

## A-3. R2バケット

- [ ] バケット `fcms-piece-images` 作成
- [ ] Cloudflare Workersから配信設定
- [ ] CDN Cache 設定(長期キャッシュ、画像不変前提)

## A-4. D1マイグレーション

新規マイグレーション `0002_platform_integration.sql` を作成:

```sql
-- piece_master
CREATE TABLE piece_master (...);

-- webhook_deliveries_received
CREATE TABLE webhook_deliveries_received (...);

-- user_display_name_cache
CREATE TABLE user_display_name_cache (...);

-- teams テーブルに is_active, name, formation_preset が無ければ追加
ALTER TABLE teams ADD COLUMN ...;

-- user_ratings テーブルに season_id が無ければ追加
ALTER TABLE user_ratings ADD COLUMN ...;

-- 初期データ投入
INSERT INTO piece_master VALUES (...) × 200;
```

---

# 付録B — 未決定事項(ビジネス判断が必要)

| 項目 | 状態 | 決定者 | 備考 |
|---|---|---|---|
| コマ価格体系の具体値 | 未決 | ビジネス | §4-1-11 参考値あり |
| 編成セーブ課金: subscription vs 買い切り | 未決 | ビジネス | §4-3-2 subscription推奨 |
| シーズン期間(月次 vs 四半期) | 未決 | ビジネス | 月次推奨(仕様§14-3) |
| ランキング報酬 | 未決 | ビジネス | 現時点では称号のみ |
| 初期登録ボーナス(Founding Eleven以外) | 未決 | ビジネス | コイン・クーポン等 |
| 広告表示の範囲 | 未決 | ビジネス | 仕様§12-2参照 |

---

# 改訂履歴

| バージョン | 日付 | 変更内容 |
|:-:|---|---|
| v1.0 | 2026-04-23 | 初版。Platform v1.2連携完全対応、200人piece_master + SKU命名規約確定、6機能全仕様 |

---

**作成者**: Claude  
**上位正典**: FCMS ゲーム仕様書 v9, The Archive 世界観設定書 v1.0, Football-Platform v1.2 実装  
**連携リポジトリ**: 
- FCMS: https://github.com/yanagiho/football-chess-maniacs
- Platform: https://github.com/yanagiho/Football-Platform (private)
