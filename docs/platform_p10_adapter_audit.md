# Platform P10 Adapter Audit — Football Chess ManiacS

作成日: 2026-05-13
対象リポジトリ: `yanagiho/fcm/football-chess-maniacs`
ブランチ: `feat/preset-teams-v2.0-migration`
Platform 状態: P0〜P9 完了 (main=`7014f7d`)

---

## 1. 調査サマリ

FCM の現行 Platform 連携コードを P9 完了時点の Platform 仕様と突き合わせた。
**主要な乖離 7 件**を検出。いずれも段階的に修正可能で、既存機能を壊さず移行できる。

| # | カテゴリ | 深刻度 | 概要 |
|---|---|---|---|
| G-1 | 認証 | **HIGH** | `X-Service-API-Key` は P3 で廃止。`gfp_` token に移行必要 |
| G-2 | 認証 | MEDIUM | `callPlatformApi` がレスポンス HMAC 検証をしている（Platform は送信しない） |
| G-3 | 購入フロー | **HIGH** | v1 sku ベース。v2 product_id + price_id に移行必要 |
| G-4 | Webhook | LOW | `inventory.granted` / `inventory.revoked` 未対応（FCM は現状不使用） |
| G-5 | Match Result | **HIGH** | Platform match finish API 未呼び出し（ローカル D1 のみ） |
| G-6 | auth.ts endpoint | MEDIUM | `/purchase` が `purchase_complete` イベント処理（Platform は `entitlement.created` を送信） |
| G-7 | pieces.ts sync | LOW | `/v1/entitlements?user_id=...&tag=fcms_piece` — 非標準パス |

## 2. ファイル別詳細

### 2.1 src/api/auth.ts

#### callPlatformApi() — G-1, G-2

```typescript
// 現行（旧方式）
headers: { 'X-Service-API-Key': env.PLATFORM_SERVICE_API_KEY }
```

- **G-1**: `X-Service-API-Key` は Platform P3 で `gfp_` game server token に置換済み
- 修正: `Authorization: Bearer ${env.PLATFORM_GAME_SERVER_TOKEN}`

```typescript
// 現行（不要なレスポンス HMAC 検証）
const hmac = res.headers.get('X-HMAC-Signature');
// ... 検証ロジック
```

- **G-2**: Platform はレスポンスに HMAC 署名しない。現行は catch 内で warning ログのみなので実害なし
- 修正: レスポンス HMAC 検証ブロックを削除

#### getOwnedPieces() — G-7

```typescript
const entitlements = await callPlatformApi(env, `/users/${userId}/entitlements?game=fcms`);
```

- Platform の実パスは `/v1/entitlements?user_id=...&game_id=...` または user-scoped endpoint
- `game=fcms` → `game_id=football_chess_maniacs` に変更必要
- ただし `pieces.ts /sync` がより正確な実装。`getOwnedPieces` は使用箇所を確認してから判断

#### /purchase endpoint — G-6

```typescript
app.post('/purchase', async (c) => {
  // event_type === 'purchase_complete' を処理
});
```

- Platform は `purchase_complete` イベントを送信しない。実際の wire name は `entitlement.created`
- `webhooks.ts` が正しく `entitlement.created` を処理しているため、この endpoint は**実質 dead code**
- 修正: 削除するか、webhooks.ts に統合

### 2.2 src/api/shop.ts — G-3

```typescript
// 現行（v1 sku ベース）
const result = await callPlatformApi(env, '/v1/commerce/purchase', {
  method: 'POST',
  body: JSON.stringify({ sku, user_id: userId }),
});
```

- Platform P4 で v2 (product_id + price_id) に移行済み
- v1 sku ベースは互換 dual flow が残っているが非推奨
- 修正: カタログを Platform products API から取得し、`product_id` + `price_id` で購入

#### カタログ構造

- 現行: `piece_master` テーブル（D1 ローカル）がカタログ
- 移行後: Platform `GET /v1/commerce/catalog?game_id=football_chess_maniacs` でカタログ取得
- piece_master は FCM 内部データとして維持（ゲーム固有の position/cost/era 等）
- 商品表示用メタデータは Platform products から取得

### 2.3 src/api/webhooks.ts — 正常（一部追加必要）

```typescript
// entitlement.created → user_pieces_v2 INSERT ✅
// entitlement.revoked → user_pieces_v2 DELETE ✅
// X-Webhook-Signature 検証 ✅
// X-Webhook-Delivery-Id 冪等性 ✅
```

- Wire event name `entitlement.created` / `entitlement.revoked` は Platform と**完全一致**
- 署名検証フォーマット `sha256=<hex>` も一致
- `webhook_deliveries_received` テーブルによる冪等性も正しい設計

**追加必要 (G-4)**:
- `inventory.granted` / `inventory.revoked` ハンドラ（stub で可、FCM は現状 inventory 不使用）
- `match.finished` は Platform → FCM 方向なので通常不要（FCM → Platform が主）

### 2.4 src/api/match.ts — G-5

```typescript
// endMatch() → MATCH_RESULT_QUEUE.send() → D1 + R2 のみ
// Platform match finish API 呼び出しなし
```

- FCM の試合結果は D1 (`matches` テーブル) + R2 (リプレイ) にのみ保存
- Platform の `POST /v1/game/matches/finish` に送信していない
- 修正: `endMatch()` 内（または Queue consumer 内）で Platform API 呼び出し追加

#### 送信タイミングの選択肢

| 方式 | メリット | デメリット |
|---|---|---|
| A: GameSession DO の endMatch 内 | 即時性 | DO 内で外部 API 呼び出し（失敗時リトライ困難） |
| B: Queue consumer 内 | リトライ容易、DO 軽量 | 遅延（秒単位） |
| C: 専用 cron worker | 独立、バッチ処理可 | 複雑度増 |

**推奨: B (Queue consumer)**。既存の `MATCH_RESULT_QUEUE` consumer に Platform API 呼び出しを追加。失敗時は Queue retry で自動リトライ。

### 2.5 src/api/pieces.ts — 軽微

#### /sync endpoint

```typescript
const entitlements = await callPlatformApi(env, `/v1/entitlements?user_id=${userId}&tag=fcms_piece`);
```

- `tag=fcms_piece` は非標準。Platform の実 API パスを確認して修正
- 認証方式移行 (G-1) に伴い `callPlatformApi` 修正で自動的に解決
- sync は webhook 受信の補完用途（ユーザーログイン時に差分チェック）として有用

### 2.6 src/api/team.ts — 軽微

#### checkPremiumSlots()

```typescript
await callPlatformApi(env, '/v1/entitlements/check', {
  method: 'POST',
  body: JSON.stringify({ user_id: userId, sku: 'fcms_save_slots_9' }),
});
```

- `/v1/entitlements/check` は Platform の実 API に存在しない可能性
- 修正: Platform の entitlements API で `sku='fcms_save_slots_9'` のアクティブ entitlement を検索
- または FCM ローカルの `user_pieces_v2` で entitlement 存在チェック

### 2.7 src/durable/game_session.ts — Platform 連携なし

- JWT 検証は `PLATFORM_JWKS_URL` 経由で正常
- endMatch で `MATCH_RESULT_QUEUE.send()` は行っているが Platform API 呼び出しなし (G-5)
- COM 対戦はセッショントークン認証（Platform 依存なし）

### 2.8 src/worker.ts — 構造問題なし

- Env 型定義に `PLATFORM_GAME_SERVER_TOKEN` 追加が必要
- `PLATFORM_SERVICE_API_KEY` は削除候補
- Queue consumer は `matches` テーブル UPDATE + R2 リプレイ保存のみ（Platform 未連携）

### 2.9 src/wrangler.toml — 更新必要

```toml
# 現行
PLATFORM_API_BASE = "https://api.football-century.example.com"  # placeholder

# 移行後に必要な secrets
# PLATFORM_GAME_SERVER_TOKEN = "gfp_xxxx..." （新規追加）
# PLATFORM_HMAC_SECRET → PLATFORM_WEBHOOK_SECRET （名前変更推奨）
# PLATFORM_SERVICE_API_KEY （削除）
```

### 2.10 src/migrations/0002_platform_integration.sql — 追加マイグレーション不要

- `piece_master`, `user_pieces_v2`, `webhook_deliveries_received` は既に作成済み
- `user_pieces_v2.entitlement_id` カラムも存在
- 追加テーブル/カラムは不要（既存スキーマで P9 対応可能）

## 3. game_id 命名

| 箇所 | 現行値 | 推奨値 |
|---|---|---|
| Platform `games.id` | `fcm` (テストデータ) | `football_chess_maniacs` |
| Platform integration spec | `fcms` (SQL 例) | `football_chess_maniacs` |
| wrangler.toml D1 name | `fcms` | 変更不要（D1 内部名） |
| pieces.ts sync tag | `fcms_piece` | `football_chess_maniacs` |
| team.ts premium sku | `fcms_save_slots_9` | `fcms_save_slots_9`（SKU は変更不要） |

- Platform の `game_id` は `football_chess_maniacs` に統一
- FCM 内部の D1 database name (`fcms`) や SKU (`fcms_*`) は変更不要

## 4. 実装 TODO リスト

### 優先度 HIGH（P10 必須）

| # | ファイル | 変更内容 | 依存 |
|---|---|---|---|
| T-1 | `src/api/auth.ts` | `callPlatformApi` を `Authorization: Bearer gfp_...` に変更 | Platform 側トークン発行 |
| T-2 | `src/api/auth.ts` | レスポンス HMAC 検証ブロック削除 | なし |
| T-3 | `src/api/shop.ts` | v2 purchase flow (product_id + price_id) に移行 | Platform 側商品登録 |
| T-4 | `src/worker.ts` | Queue consumer に Platform match finish API 呼び出し追加 | T-1 |
| T-5 | `src/worker.ts` Env | `PLATFORM_GAME_SERVER_TOKEN` 追加、`PLATFORM_SERVICE_API_KEY` 削除 | Platform 側トークン発行 |
| T-6 | `wrangler.toml` | secrets 更新、`PLATFORM_API_BASE` 本番 URL | デプロイ時 |

### 優先度 MEDIUM（推奨）

| # | ファイル | 変更内容 | 依存 |
|---|---|---|---|
| T-7 | `src/api/auth.ts` | `/purchase` endpoint 削除（dead code） | なし |
| T-8 | `src/api/webhooks.ts` | `inventory.granted` / `inventory.revoked` stub 追加 | なし |
| T-9 | `src/api/pieces.ts` | sync パス修正 (`tag=fcms_piece` → Platform 実 API) | T-1 |
| T-10 | `src/api/team.ts` | `checkPremiumSlots` のパス修正 | T-1 |

### 優先度 LOW（将来）

| # | ファイル | 変更内容 | 依存 |
|---|---|---|---|
| T-11 | `src/api/shop.ts` | カタログを Platform products API から取得 | Platform 側商品登録 |
| T-12 | — | COM 対戦結果の Platform 送信要否判断 | 設計判断 |
| T-13 | `src/middleware/jwt_verify.ts` | JWKS キャッシュ最適化 | なし |

## 5. 既存 Web を壊さないための注意点

1. **webhooks.ts は正常**: `entitlement.created` / `entitlement.revoked` の wire name、署名フォーマット、冪等性処理はすべて Platform と一致。変更不要
2. **auth.ts の G-2 修正は安全**: レスポンス HMAC 検証は catch で warning ログのみ、実害なし。削除しても動作変わらず
3. **shop.ts v2 移行は段階的に**: 旧 v1 sku フローが動いている間は並行稼働可（Platform の dual flow 維持中）
4. **match result 送信は追加のみ**: 既存の D1 + R2 保存に Platform API 呼び出しを**追加**するだけ。既存処理は変更しない
5. **callPlatformApi の認証変更は一箇所**: `auth.ts` の 1 関数を修正すれば全 API 呼び出しが移行される
6. **D1 スキーマ変更なし**: 既存テーブル構造で P9 対応可能。マイグレーション不要
7. **untracked files に注意**: 現在のブランチに `scripts/`, `assets-source/`, `piece-tokens/` 等の untracked files あり。コミット前に `.gitignore` 確認

## 6. platform_integration_spec.md との差分

FCM の `docs/platform_integration_spec.md` は Platform v1.2 (pre-P3/P4) 時点で書かれている。主な乖離:

| 項目 | spec 記載 | P9 現状 |
|---|---|---|
| 認証 | `X-Service-API-Key` | `Authorization: Bearer gfp_...` |
| 購入 | `{ sku, price_id, provider }` | `{ product_id, price_id }` |
| Webhook endpoint | `/webhook/purchase` | `/webhook/platform-entitlement` (推奨) |
| game_id | `fcms` | `football_chess_maniacs` (推奨) |
| Match result | 未記載 | `POST /v1/game/matches/finish` |
| Inventory/Equipment | 未記載 | P5 で追加済み |
| Webhook outbox | 未記載 | P7 で追加（retry 保証） |
| Shop Admin | 未記載 | P9 で追加（product CRUD） |

**推奨**: `platform_integration_spec.md` を P9 対応版に改訂するか、本 audit 文書を正とする
