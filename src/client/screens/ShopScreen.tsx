// ============================================================
// ShopScreen.tsx — ショップ画面（B2）
// コマはインゴットで購入。インゴットはプラットフォーム決済で購入する。
// ============================================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { apiUrl, type Page, type Position, type Cost } from '../types';
import { pieceCostToIngots, costToDisplay } from '../../types/piece';
import PieceIcon from '../components/board/PieceIcon';
import BackButton from '../components/ui/BackButton';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n';

interface ShopScreenProps {
  onNavigate: (page: Page) => void;
  authToken?: string;
}

const ALL_POSITIONS: Position[] = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];

// 価格・表示変換は src/types/piece.ts の正本（pieceCostToIngots / costToDisplay）を使用する。
// クライアントで再定義するとサーバー（api/shop.ts）と乖離するため import する。

interface CatalogItem {
  pieceId: number;
  name: string;
  position: Position;
  cost: Cost;
  imageUrl?: string;
  owned: boolean;
  ingotPrice?: number | null;
  /** undefined=情報なし（フォールバック/デモ）/ false=Platform未設定で購入不可 */
  platformConfigured?: boolean;
}

interface RawCatalogItem {
  piece_id: number;
  name_ja?: string;
  name_en?: string;
  position: string;
  cost: number;
  image_url?: string | null;
  is_owned?: boolean;
  ingot_price?: number | null;
  platform_configured?: boolean;
}

interface IngotProduct {
  product_id: string;
  price_id: string;
  title: string;
  amount: number;
  currency: string;
  amount_cents: number;
  provider: string;
}

/** バックエンド未接続時のローカルカタログ（開発・デモ用） */
function buildFallbackCatalog(): CatalogItem[] {
  const costs: Cost[] = [1, 1.5, 2, 2.5, 3];
  const items: CatalogItem[] = [];
  let id = 1;
  for (const pos of ALL_POSITIONS) {
    for (const cost of costs) {
      items.push({
        pieceId: id++,
        name: `${pos} ${costToDisplay(cost)}`,
        position: pos,
        cost,
        owned: false,
      });
    }
  }
  return items;
}

export default function ShopScreen({ onNavigate, authToken }: ShopScreenProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [ingotProducts, setIngotProducts] = useState<IngotProduct[]>([]);
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [acquired, setAcquired] = useState<CatalogItem | null>(null);
  const [buyingIngots, setBuyingIngots] = useState(false);
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { requireLogin } = useAuth();

  const authHeaders = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {};
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  // 残高取得（プラットフォーム連携: D1ウォレット）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/shop/wallet'), { headers: authHeaders });
        if (!res.ok) throw new Error(`wallet ${res.status}`);
        const data = (await res.json()) as { ingots: number };
        if (!cancelled) setBalance(data.ingots);
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  // Platform INGOT商品取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/shop/ingot-products'), { headers: authHeaders });
        if (!res.ok) throw new Error(`ingot-products ${res.status}`);
        const data = (await res.json()) as { items: IngotProduct[] };
        if (!cancelled) setIngotProducts(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setIngotProducts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  // カタログ取得（API → 失敗時フォールバック）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/shop/catalog?limit=200'), { headers: authHeaders });
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        const data = (await res.json()) as { items: RawCatalogItem[] };
        if (cancelled) return;
        const mapped: CatalogItem[] = data.items.map((r) => ({
          pieceId: r.piece_id,
          name: r.name_ja || r.name_en || `${r.position} ${r.cost}`,
          position: r.position.toUpperCase() as Position,
          cost: r.cost as Cost,
          imageUrl: r.image_url ?? undefined,
          owned: Boolean(r.is_owned),
          ingotPrice: r.ingot_price ?? null,
          platformConfigured: r.platform_configured,
        }));
        setCatalog(mapped);
      } catch {
        if (!cancelled) setCatalog(buildFallbackCatalog());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const handleBuyPiece = useCallback(async (item: CatalogItem) => {
    if (item.owned || buyingId !== null) return;
    if (!authToken) {
      setToast(t('shop.login_required'));
      requireLogin(t('title.shop'));
      return;
    }
    const price = pieceCostToIngots(item.cost);
    if (balance !== null && balance < price) {
      setToast(t('shop.insufficient_ingots'));
      return;
    }
    setBuyingId(item.pieceId);
    try {
      const res = await fetch(apiUrl('/api/shop/purchase'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ piece_id: item.pieceId }),
      });
      const data = (await res.json().catch(() => ({}))) as { balance?: number; error?: string };
      if (res.status === 201) {
        if (typeof data.balance === 'number') setBalance(data.balance);
        setCatalog((prev) => prev.map((c) => (c.pieceId === item.pieceId ? { ...c, owned: true } : c)));
        setAcquired(item);
      } else if (res.status === 402) {
        if (typeof data.balance === 'number') setBalance(data.balance);
        setToast(t('shop.insufficient_ingots'));
      } else if (res.status === 409) {
        setCatalog((prev) => prev.map((c) => (c.pieceId === item.pieceId ? { ...c, owned: true } : c)));
        setToast(t('shop.already_owned_toast'));
      } else {
        setToast(t('shop.purchase_failed'));
      }
    } catch {
      setToast(t('shop.network_error'));
    } finally {
      setBuyingId(null);
    }
  }, [authToken, authHeaders, balance, buyingId, requireLogin]);

  const handleBuyIngots = useCallback(async () => {
    if (!authToken) {
      setToast(t('shop.login_required'));
      requireLogin(t('title.shop'));
      return;
    }
    const product = ingotProducts[0];
    if (!product) {
      setToast(t('shop.platform_connect_failed'));
      return;
    }
    setBuyingIngots(true);
    try {
      const res = await fetch(apiUrl('/api/shop/ingots'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          product_id: product.product_id,
          price_id: product.price_id,
          provider: product.provider,
        }),
      });
      if (!res.ok) throw new Error(`ingots ${res.status}`);
      const data = (await res.json()) as { checkout_url?: string };
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      throw new Error('no checkout_url');
    } catch {
      setToast(t('shop.platform_connect_failed'));
    } finally {
      setBuyingIngots(false);
    }
  }, [authHeaders, authToken, ingotProducts, requireLogin]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(
    () => (posFilter === 'ALL' ? catalog : catalog.filter((c) => c.position === posFilter)),
    [catalog, posFilter],
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100%', padding: '20px 16px', gap: 16, overflowY: 'auto',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      {/* ヘッダー: タイトル + インゴット残高 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 460, alignItems: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#fff' }}>SHOP</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(110,180,255,0.12)', border: '1px solid rgba(110,180,255,0.35)',
            borderRadius: 20, padding: '6px 14px', fontSize: 14, color: '#9ecbff', fontWeight: 'bold',
          }}>
            <span style={{ fontSize: 15 }}>◆</span>
            {balance === null ? '—' : balance.toLocaleString()}
          </div>
          <button onClick={handleBuyIngots} disabled={buyingIngots || ingotProducts.length === 0} style={{
            padding: '7px 14px', borderRadius: 20, border: 'none',
            background: buyingIngots || ingotProducts.length === 0 ? '#444' : 'linear-gradient(135deg, #4a9eff, #2563eb)',
            color: '#fff', fontSize: 13, fontWeight: 'bold',
            cursor: buyingIngots || ingotProducts.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap',
          }}>
            {buyingIngots ? t('shop.connecting') : t('shop.buy_ingots')}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#7a86a8', width: '100%', maxWidth: 460 }}>
        {t('shop.description')}
      </div>

      {/* ポジションフィルター */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%', maxWidth: 460 }}>
        {(['ALL', ...ALL_POSITIONS] as const).map((pos) => (
          <button key={pos} onClick={() => setPosFilter(pos)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: posFilter === pos ? '1px solid #4a9eff' : '1px solid rgba(255,255,255,0.1)',
            background: posFilter === pos ? 'rgba(74,158,255,0.2)' : 'transparent',
            color: posFilter === pos ? '#9ecbff' : '#888', fontWeight: posFilter === pos ? 'bold' : 'normal',
          }}>
            {pos === 'ALL' ? t('shop.filter_all') : pos}
          </button>
        ))}
      </div>

      {/* コマカタログ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10, width: '100%', maxWidth: 460,
      }}>
        {visible.map((item) => {
          const price = item.ingotPrice ?? pieceCostToIngots(item.cost);
          const isSS = item.cost >= 2.5;
          const isBuying = buyingId === item.pieceId;
          const affordable = balance === null || balance >= price;
          // undefined（フォールバック/デモ）は購入可。false のときだけ Platform 未設定で不可。
          const configured = item.platformConfigured !== false;
          const canBuy = !item.owned && affordable && configured && buyingId === null;
          return (
            <div key={item.pieceId} style={{
              background: isSS ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.04)',
              border: isSS ? '1px solid rgba(255,215,0,0.35)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: 12,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <PieceIcon cost={item.cost} position={item.position} side="ally" />
              <div style={{ fontSize: 12, color: '#ddd', fontWeight: 'bold', textAlign: 'center', lineHeight: 1.2 }}>
                {item.name}
              </div>
              <div style={{ fontSize: 11, color: isSS ? '#ffd700' : '#8aa', }}>
                {item.position} · {costToDisplay(item.cost)}
              </div>
              {item.owned ? (
                <div style={{
                  marginTop: 2, padding: '7px 0', width: '100%', textAlign: 'center',
                  borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: '#888',
                  fontSize: 12, fontWeight: 'bold',
                }}>
                  {t('shop.owned')}
                </div>
              ) : (
                <button onClick={() => handleBuyPiece(item)} disabled={!canBuy} style={{
                  marginTop: 2, padding: '7px 0', width: '100%',
                  borderRadius: 8, border: 'none',
                  background: canBuy ? (isSS ? '#cc9a00' : '#2563eb') : '#333',
                  color: canBuy ? '#fff' : '#666',
                  fontSize: 12, fontWeight: 'bold', cursor: canBuy ? 'pointer' : 'default',
                }}>
                  {isBuying ? t('shop.buying') : !configured ? t('shop.unavailable') : `◆ ${price}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div style={{ color: '#666', fontSize: 13, padding: 32 }}>{t('shop.loading')}</div>
      )}

      <BackButton onClick={() => onNavigate('title')} />

      {/* 獲得演出 */}
      {acquired && (
        <div onClick={() => setAcquired(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
          cursor: 'pointer',
        }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#ffd700', letterSpacing: 2 }}>GET!</div>
          <div style={{
            padding: 16, borderRadius: 16,
            background: acquired.cost >= 2.5 ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.06)',
            border: acquired.cost >= 2.5 ? '1px solid rgba(255,215,0,0.5)' : '1px solid rgba(255,255,255,0.12)',
            animation: 'fcms-shop-pop 0.4s ease-out',
          }}>
            <PieceIcon cost={acquired.cost} position={acquired.position} side="ally" />
          </div>
          <div style={{ fontSize: 15, color: '#fff', fontWeight: 'bold' }}>{acquired.name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{t('shop.tap_to_close')}</div>
          <style>{`@keyframes fcms-shop-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }`}</style>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 13, zIndex: 310, border: '1px solid rgba(255,255,255,0.15)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
