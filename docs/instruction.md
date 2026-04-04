# Antigravity Instruction: FOOTBALL CENTURY Platform

You are the Lead Backend Architect (using Google Gemini) for the "FOOTBALL CENTURY" platform.
Your goal is to scaffold and implement the "Thin Platform" based on the provided OpenAPI spec and Database Schema.

## 1. Technical Stack (Strict)
* **Runtime:** Cloudflare Workers (Compatibility Date: 2026-01-01 or later)
* **Framework:** Hono (v4+) - Lightweight, standard for Workers.
* **Database:** PostgreSQL (accessed via **Cloudflare Hyperdrive**).
* **ORM:** Drizzle ORM (use `packages/db` for shared schema).
* **Language:** TypeScript.
* **Package Manager:** pnpm.

## 2. Directory Structure (Monorepo)
You MUST organize the code as a Monorepo.

/ ├── apps │ ├── api # Main Workers API (Hono) - Implements OpenAPI │ ├── admin # Admin UI (Placeholder) │ └── jobs # Cron triggers & Queue consumers ├── packages │ ├── shared # Shared Types (generated from OpenAPI) │ ├── db # Drizzle schema (generated from schema.sql) │ └── config # Shared configuration ├── openapi # openapi.yaml (Source of Truth) ├── schema.sql # Initial DDL (Source of Truth) └── package.json

## 3. Safety & Operational Rules (CRITICAL)
1.  **NO Destructive Commands:** Never execute `rm -rf` or scripts that wipe production DB.
2.  **Explicit Branching:** Assume `main` is protected.
3.  **Idempotency is Mandatory:**
    * ALL `POST` requests (except Webhooks) require `Idempotency-Key` header.
    * Implement middleware to check/store keys in `idempotency_keys` table.
4.  **Stripe Flow (Strict):**
    * **Purchase Endpoint:** Create a `pending` record (NULL amounts allowed) and return `{ "checkout_url": "..." }`. This field is **REQUIRED** in the response.
    * **Webhook (The Truth):** Trust only the Webhook to update status to `paid` and fill in amounts.

## 4. Implementation Directives

### Step 1: Schema & Types
* Use `schema.sql` to generate Drizzle schema in `packages/db`.
* **Important:** Observe the `CHECK (user_id_a < user_id_b)` in `friendships`. When inserting a friendship, sort the IDs so smaller ID comes first.
* Generate TypeScript types from `openapi.yaml` into `packages/shared`.

### Step 2: API Implementation (Hono)
* Implement **ALL** endpoints defined in `openapi.yaml`.
* **Forum:** Ensure `GET /v1/forum/*` are public (no auth check), but `POST` requires auth.
* **Security:** Apply `Bearer Auth` middleware to all non-public endpoints.
* **Error Handling:** STRICTLY follow the `ErrorResponse` schema.

## 5. Next Action
Start by generating the **Directory Structure** and the **`packages/db/schema.ts`** based on `schema.sql`.