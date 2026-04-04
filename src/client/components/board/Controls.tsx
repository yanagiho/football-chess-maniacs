// ============================================================
// Controls.tsx — ズーム/パン制御（§2-3, §3-2）
// スマホ: ピンチズーム・ドラッグパン・ダブルタップ全体表示
// PC: ホイールズーム・中クリックドラッグ・ダブルクリック全体表示
// ============================================================

import { useRef, useCallback } from 'react';

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

interface UseControlsOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  transform: Transform;
  setTransform: React.Dispatch<React.SetStateAction<Transform>>;
  boardWidth: number;
  boardHeight: number;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 5.0;

/** ボード全体がコンテナに収まるscale/positionを返す */
export function fitToContainer(
  containerW: number,
  containerH: number,
  boardW: number,
  boardH: number,
): Transform {
  const scale = Math.min(containerW / boardW, containerH / boardH) * 0.95;
  return {
    scale,
    x: (containerW - boardW * scale) / 2,
    y: (containerH - boardH * scale) / 2,
  };
}

export function useControls({
  containerRef,
  transform,
  setTransform,
  boardWidth,
  boardHeight,
}: UseControlsOptions) {
  // ── ドラッグ状態 ──
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originTx: number;
    originTy: number;
  } | null>(null);
  const didDragRef = useRef(false);

  // ── ピンチ状態 ──
  const pinchRef = useRef<{
    startDist: number;
    startScale: number;
    midX: number;
    midY: number;
  } | null>(null);

  // ── ヘルパー: ポインタ→コンテナ内座標 ──
  const clientToLocal = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { lx: 0, ly: 0 };
      return { lx: clientX - rect.left, ly: clientY - rect.top };
    },
    [containerRef],
  );

  // ── scaleをクランプしつつピボット中心でズーム ──
  const zoomAround = useCallback(
    (pivotX: number, pivotY: number, newScale: number) => {
      setTransform((prev) => {
        const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
        const ratio = clamped / prev.scale;
        return {
          scale: clamped,
          x: pivotX - (pivotX - prev.x) * ratio,
          y: pivotY - (pivotY - prev.y) * ratio,
        };
      });
    },
    [setTransform],
  );

  // ================================================================
  // PC: ホイールズーム（§3-2）
  // ================================================================
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const { lx, ly } = clientToLocal(e.clientX, e.clientY);
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomAround(lx, ly, transform.scale * factor);
    },
    [clientToLocal, zoomAround, transform.scale],
  );

  // ================================================================
  // タッチ: ピンチズーム + ドラッグパン（§2-3）
  // ================================================================
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // ピンチ開始
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const { lx, ly } = clientToLocal(midX, midY);

        pinchRef.current = {
          startDist: dist,
          startScale: transform.scale,
          midX: lx,
          midY: ly,
        };
        dragRef.current = null;
      } else if (e.touches.length === 1) {
        // ドラッグ開始
        dragRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          originTx: transform.x,
          originTy: transform.y,
        };
        didDragRef.current = false;
        pinchRef.current = null;
      }
    },
    [clientToLocal, transform],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        // ピンチ中
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / pinchRef.current.startDist;
        const newScale = pinchRef.current.startScale * ratio;
        zoomAround(pinchRef.current.midX, pinchRef.current.midY, newScale);
      } else if (e.touches.length === 1 && dragRef.current) {
        // ドラッグ中
        const dx = e.touches[0].clientX - dragRef.current.startX;
        const dy = e.touches[0].clientY - dragRef.current.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          didDragRef.current = true;
        }
        setTransform((prev) => ({
          ...prev,
          x: dragRef.current!.originTx + dx,
          y: dragRef.current!.originTy + dy,
        }));
      }
    },
    [zoomAround, setTransform],
  );

  const handleTouchEnd = useCallback(() => {
    dragRef.current = null;
    pinchRef.current = null;
  }, []);

  // ================================================================
  // PC: 中クリック + ドラッグでパン（§3-2）
  // ================================================================
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 1) return; // 中クリックのみ
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originTx: transform.x,
        originTy: transform.y,
      };
      didDragRef.current = false;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [transform],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        didDragRef.current = true;
      }
      setTransform((prev) => ({
        ...prev,
        x: dragRef.current!.originTx + dx,
        y: dragRef.current!.originTy + dy,
      }));
    },
    [setTransform],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ================================================================
  // ダブルクリック / ダブルタップ → 全体表示（§2-3, §3-2）
  // ================================================================
  const handleDoubleClick = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTransform(fitToContainer(rect.width, rect.height, boardWidth, boardHeight));
  }, [containerRef, boardWidth, boardHeight, setTransform]);

  /** ドラッグ操作が行われたか（クリック判定で使う） */
  const wasDragging = useCallback(() => didDragRef.current, []);

  return {
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    wasDragging,
  };
}
