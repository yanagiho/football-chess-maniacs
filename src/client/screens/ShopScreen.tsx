// ============================================================
// ShopScreen.tsx — ショップ画面（piece_master カタログ）
// GET /api/shop/catalog に接続、仮画像SVG表示
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Page } from '../types';
import { apiFetch, pieceImageUrl } from '../lib/api';
import PieceIcon from '../components/board/PieceIcon';
import type { Cost, Position } from '../types';

interface ShopScreenProps {
  onNavigate: (page: Page) => void;
  authToken?: string;
}

/** API レスポンス型（ShopCatalogItem に対応） */
interface CatalogItem {
  piece_id: number;
  sku: string;
  name_ja: string;
  name_en: string;
  position: string;
  cost: number;
  cost_display: string;
  era: number;
  era_shelf: number;
  era_shelf_name: string;
  family: string | null;
  nationality: string;
  summary_ja: string | null;
  image_url: string | null;
  is_owned: boolean;
}

interface CatalogResponse {
  items: CatalogItem[];
  total: number;
  limit: number;
  offset: number;
}

const SHELF_COLORS: Record<number, string> = {
  1: '#D4C5A9', 2: '#C9B78E', 3: '#E8D9B5', 4: '#D8A878',
  5: '#B5C9D4', 6: '#D9D9D9', 7: '#F0F0F0',
};

export default function ShopScreen({ onNavigate, authToken }: ShopScreenProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const LIMIT = 50;

  const fetchCatalog = useCallback(async (newOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CatalogResponse>(
        `/api/shop/catalog?limit=${LIMIT}&offset=${newOffset}`,
        { token: authToken },
      );
      setItems(data.items);
      setTotal(data.total);
      setOffset(newOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchCatalog(0);
  }, [fetchCatalog]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100%', padding: '16px 12px', gap: 12, overflowY: 'auto',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', width: '100%',
        maxWidth: 800, alignItems: 'center', padding: '0 4px',
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', margin: 0 }}>SHOP</h2>
        <div style={{ fontSize: 13, color: '#888' }}>
          {total} pieces
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div style={{
          background: 'rgba(198,40,40,0.2)', border: '1px solid rgba(198,40,40,0.4)',
          borderRadius: 8, padding: '10px 16px', color: '#ef5350', fontSize: 13,
          maxWidth: 800, width: '100%',
        }}>
          {error}
          <button onClick={() => fetchCatalog(offset)} style={{
            marginLeft: 12, padding: '4px 12px', borderRadius: 4, border: '1px solid #ef5350',
            background: 'transparent', color: '#ef5350', fontSize: 12, cursor: 'pointer',
          }}>再読込</button>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ color: '#888', fontSize: 14, padding: 40 }}>Loading...</div>
      )}

      {/* カードグリッド */}
      {!loading && items.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 10, width: '100%', maxWidth: 800,
        }}>
          {items.map((item) => (
            <div
              key={item.piece_id}
              onClick={() => setSelectedItem(item)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: 8, cursor: 'pointer',
                transition: 'border-color 0.2s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              {/* 画像 */}
              <div style={{
                width: '100%', aspectRatio: '2/3', borderRadius: 6, overflow: 'hidden',
                background: SHELF_COLORS[item.era_shelf] ?? '#333',
              }}>
                <img
                  src={pieceImageUrl(item.piece_id)}
                  alt={item.name_en}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                />
              </div>

              {/* 情報 */}
              <div style={{ width: '100%', textAlign: 'center' }}>
                <div style={{
                  fontSize: 11, color: '#aaa', marginBottom: 2,
                }}>
                  No.{String(item.piece_id).padStart(3, '0')}
                </div>
                <div style={{
                  fontSize: 12, color: '#fff', fontWeight: 'bold',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.name_en}
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  gap: 6, marginTop: 4,
                }}>
                  <div style={{ transform: 'scale(0.44)', transformOrigin: 'center', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PieceIcon cost={item.cost as Cost} position={item.position as Position} side="ally" />
                  </div>
                  <span style={{ fontSize: 11, color: '#999' }}>
                    {item.position} · {item.era_shelf_name}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 空結果 */}
      {!loading && items.length === 0 && !error && (
        <div style={{ color: '#888', fontSize: 14, padding: 40 }}>No items found</div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => fetchCatalog(offset - LIMIT)}
            disabled={offset === 0}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: offset === 0 ? '#555' : '#ccc',
              fontSize: 13, cursor: offset === 0 ? 'default' : 'pointer',
            }}
          >
            &lt; Prev
          </button>
          <span style={{ fontSize: 13, color: '#888' }}>
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => fetchCatalog(offset + LIMIT)}
            disabled={offset + LIMIT >= total}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: offset + LIMIT >= total ? '#555' : '#ccc',
              fontSize: 13, cursor: offset + LIMIT >= total ? 'default' : 'pointer',
            }}
          >
            Next &gt;
          </button>
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedItem && (
        <div
          onClick={() => setSelectedItem(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a2e', borderRadius: 16, padding: 20,
              maxWidth: 360, width: '100%', maxHeight: '80vh', overflowY: 'auto',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {/* モーダル画像 */}
            <div style={{
              width: '100%', maxWidth: 240, margin: '0 auto', aspectRatio: '2/3',
              borderRadius: 8, overflow: 'hidden',
              background: SHELF_COLORS[selectedItem.era_shelf] ?? '#333',
            }}>
              <img
                src={pieceImageUrl(selectedItem.piece_id)}
                alt={selectedItem.name_en}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            {/* 詳細情報 */}
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#888' }}>
                File No. {String(selectedItem.piece_id).padStart(3, '0')}
              </div>
              <h3 style={{ fontSize: 18, color: '#fff', margin: '4px 0' }}>
                {selectedItem.name_en}
              </h3>
              <div style={{ fontSize: 14, color: '#ccc' }}>
                {selectedItem.name_ja}
              </div>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12,
              flexWrap: 'wrap',
            }}>
              <Tag label={selectedItem.position} />
              <Tag label={`Cost ${selectedItem.cost_display}`} />
              <Tag label={selectedItem.era_shelf_name} />
              <Tag label={selectedItem.nationality} />
              {selectedItem.family && <Tag label={selectedItem.family} />}
            </div>

            {selectedItem.summary_ja && (
              <p style={{
                fontSize: 13, color: '#aaa', marginTop: 12, lineHeight: 1.6,
                textAlign: 'center',
              }}>
                {selectedItem.summary_ja}
              </p>
            )}

            {/* 購入ボタン */}
            <button
              disabled={purchasing || selectedItem.is_owned}
              onClick={async () => {
                if (!authToken) {
                  showToast('ログインが必要です');
                  return;
                }
                if (!selectedItem) return;
                setPurchasing(true);
                try {
                  const idempotencyKey = crypto.randomUUID();
                  const data = await apiFetch<{
                    purchase_id: string;
                    checkout_url: string;
                    status: string;
                  }>('/api/shop/purchase', {
                    method: 'POST',
                    token: authToken,
                    headers: { 'Idempotency-Key': idempotencyKey },
                    body: JSON.stringify({ piece_id: selectedItem.piece_id }),
                  });
                  // Stripe Checkout へ遷移
                  if (data.checkout_url) {
                    window.location.href = data.checkout_url;
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Purchase failed';
                  if (msg.includes('PRODUCT_NOT_CONFIGURED')) {
                    showToast('この駒はまだ購入できません');
                  } else if (msg.includes('ALREADY_OWNED')) {
                    showToast('すでに所持しています');
                    setSelectedItem({ ...selectedItem, is_owned: true });
                  } else if (msg.includes('401') || msg.includes('Unauthorized')) {
                    showToast('ログインが必要です');
                  } else {
                    showToast('購入に失敗しました');
                  }
                } finally {
                  setPurchasing(false);
                }
              }}
              style={{
                width: '100%', marginTop: 16, padding: '12px 0', borderRadius: 8,
                border: 'none',
                background: selectedItem.is_owned ? '#555' : '#2563EB',
                color: '#fff',
                fontSize: 15, fontWeight: 'bold',
                cursor: purchasing || selectedItem.is_owned ? 'default' : 'pointer',
                opacity: purchasing ? 0.6 : 1,
              }}
            >
              {selectedItem.is_owned ? '所持済み' : purchasing ? '処理中...' : '購入する'}
            </button>

            <button
              onClick={() => setSelectedItem(null)}
              style={{
                width: '100%', marginTop: 8, padding: '10px 0', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                color: '#888', fontSize: 13, cursor: 'pointer',
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(30,30,50,0.95)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8, padding: '10px 20px', color: '#fff', fontSize: 14,
          zIndex: 2000,
        }}>
          {toast}
        </div>
      )}

      {/* 戻るボタン */}
      <button onClick={() => onNavigate('title')} style={{
        padding: '8px 24px', background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
        color: '#888', fontSize: 14, cursor: 'pointer', marginTop: 8,
      }}>
        戻る
      </button>
    </div>
  );
}

/** 小さなタグコンポーネント */
function Tag({ label }: { label: string }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 12, fontSize: 11,
      background: 'rgba(255,255,255,0.06)', color: '#aaa',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {label}
    </span>
  );
}
