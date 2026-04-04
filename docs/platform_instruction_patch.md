# Antigravity Instruction 追加分: FOOTBALL CENTURY Platform v1.2

以下を既存の instruction.md に追記する。

---

## 6. 追加エンドポイント実装指示（v1.2）

### 6-1. JWT公開鍵配布 (`GET /.well-known/jwks.json`)
* セキュリティ: Public（認証不要）
* JWTの署名に使用するRSA公開鍵をJWKS形式で返す
* 各ゲームサーバー（Cloudflare Workers等）がこのエンドポイントをキャッシュして、ユーザーから受け取ったJWTの署名を検証する
* 鍵のローテーション: `kid`で鍵を識別。新しい鍵を追加してから古い鍵を削除するロールオーバー方式
* **重要**: JWTの署名アルゴリズムはRS256を使用する

### 6-2. トークンリフレッシュ (`POST /v1/auth/refresh`)
* セキュリティ: Public（リフレッシュトークン自体が認証の役割）
* リフレッシュトークンのハッシュを`sessions`テーブルで照合
* 有効な場合、新しいアクセストークン＋リフレッシュトークンを発行（リフレッシュトークンローテーション）
* 古いリフレッシュトークンは即座に無効化
* アクセストークンの有効期限: 15分
* リフレッシュトークンの有効期限: 7日
* **Idempotency-Key必須**

### 6-3. エンタイトルメント一覧 (`GET /v1/entitlements`)
* セキュリティ: Bearer Auth必須
* 自分のエンタイトルメントのみ返す（`user_id`はトークンから取得）
* `tag`パラメータ: SKUのプレフィクスでLIKE検索（`WHERE sku LIKE 'fcms_%'`）
* `state`パラメータ: エンタイトルメントの状態でフィルタ
* デフォルトは`state=active`のみ返す
* ページネーション: `page_token`対応。1ページ最大100件

### 6-4. カタログ一覧 (`GET /v1/commerce/catalog`)
* セキュリティ: Public（認証不要。誰でもショップの商品一覧を見られる）
* `is_active = true`のアイテムのみ返す
* `tag`パラメータ: `catalog_items.tags`配列に含まれるタグでフィルタ（GIN index使用）
* `type`パラメータ: `subscription`, `consumable`, `bundle`でフィルタ
* 各アイテムに紐づく`catalog_prices`（有効な価格リスト）も含めて返す
* ページネーション対応

### 6-5. フレンド一覧 (`GET /v1/social/friends`)
* セキュリティ: Bearer Auth必須
* `friendships`テーブルから自分が含まれるレコードを取得
* `user_id_a < user_id_b`の制約があるため、`WHERE user_id_a = me OR user_id_b = me`で検索
* 相手のuser_idとdisplay_name（`profiles`テーブルからJOIN）を返す
* ページネーション対応

### 6-6. ゲーム向けWebhook登録 (`POST /v1/webhooks/game-notify`)
* セキュリティ: Bearer Auth必須。**管理者権限が必要**（通常ユーザーは呼び出せない）
* ゲームサーバーが通知受信URLを登録する
* `secret`は暗号化して`game_webhook_endpoints`テーブルに保存
* 購入完了時（Stripe Webhook受信→status=paid更新後）に以下を実行:
  1. 対象SKUのタグからゲームIDを特定
  2. 該当ゲームの登録済みWebhookエンドポイントを取得
  3. HMAC-SHA256署名付きでPOST送信
  4. 配信結果を`game_webhook_deliveries`に記録
  5. 失敗時は最大3回リトライ（指数バックオフ: 10秒→60秒→300秒）

### 6-7. Webhook配信ペイロード形式

```json
{
  "event_type": "entitlement.created",
  "event_id": "evt_abc123",
  "timestamp": "2025-07-15T14:30:00Z",
  "data": {
    "user_id": "uuid",
    "sku": "fcms_om_cost3_modern",
    "entitlement_id": "uuid",
    "state": "active"
  }
}
```

ヘッダー:
```
X-Webhook-Signature: sha256=abcdef123456...
X-Webhook-Event: entitlement.created
X-Webhook-Delivery-Id: uuid
```

ゲーム側はX-Webhook-Signatureを共有シークレットで検証し、不一致なら400を返す。

---

## 7. 追加スキーマ注意事項

### 7-1. catalog_items の tags カラム
* PostgreSQLの`TEXT[]`型。GINインデックス付き
* タグの命名規約: `{game_id}` + `{category}` の形式
  - 例: `['fcms', 'piece', 'cost3', 'era_modern']`
  - 例: `['fcrpg', 'character', 'rare']`
* ゲーム固有のデータ（ポジション・コスト・能力値等）はタグに入れない。それはゲーム側のDBで管理する

### 7-2. catalog_prices テーブル
* 1つのSKUに複数の価格（通貨・プロバイダ別）を紐づけ可能
* `provider_price_id`: Stripeの場合はStripe Price IDを格納
* `PurchaseCreateRequest`の`price_id`はこのテーブルの`price_id`を参照する

### 7-3. game_webhook_endpoints テーブル
* `secret_encrypted`: Workers上で暗号化してから保存。平文では保存しない
* 暗号化方式: AES-256-GCM。暗号化キーはWorkers Secretsで管理
* `is_active`: 一時的に配信を停止する場合にfalseにする

---

## 8. 実装優先度

```
必須（v1.2 リリースに含める）:
1. GET /.well-known/jwks.json      — ゲームサーバーのJWT検証に必須
2. POST /v1/auth/refresh           — セッション維持に必須
3. GET /v1/entitlements            — ゲームの所持アイテム画面に必須
4. GET /v1/commerce/catalog        — ゲームのショップ画面に必須
5. GET /v1/social/friends          — フレンドマッチに必須

次フェーズ:
6. POST /v1/webhooks/game-notify   — キャッシュ即時無効化に必要だが、
                                     TTL自然失効でも動作するためMVPでは後回し可
```
