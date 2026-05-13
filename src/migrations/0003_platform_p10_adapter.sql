-- 0003_platform_p10_adapter.sql
-- P10 adapter: add Platform v2 product/price IDs to piece_master

ALTER TABLE piece_master ADD COLUMN platform_product_id TEXT DEFAULT NULL;
ALTER TABLE piece_master ADD COLUMN platform_price_id TEXT DEFAULT NULL;
