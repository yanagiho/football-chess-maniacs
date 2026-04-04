// ============================================================
// useWebSocket.ts — WebSocket通信フック（§3-1, §7-2）
// ============================================================

import { useRef, useCallback, useEffect, useState } from 'react';
import type { WsMessage } from '../types';

interface UseWebSocketOptions {
  /** WebSocket接続先URL */
  url: string;
  /** JWTトークン */
  token: string;
  /** メッセージ受信ハンドラ */
  onMessage: (msg: WsMessage) => void;
  /** 切断ハンドラ */
  onDisconnect?: () => void;
  /** 再接続ハンドラ */
  onReconnect?: () => void;
  /** 自動再接続を有効にするか */
  autoReconnect?: boolean;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export function useWebSocket(options: UseWebSocketOptions) {
  const { url, token, onMessage, onDisconnect, onReconnect, autoReconnect = true } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected' as ConnectionStatus);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // §7-2: URLクエリパラメータにトークンを含める
    const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      setStatus('connected');
      if (reconnectCountRef.current > 0) {
        onReconnect?.();
      }
      reconnectCountRef.current = 0;

      // Ping送信（10秒間隔）
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, 10_000);

      ws.onclose = () => {
        clearInterval(pingInterval);
        setStatus('disconnected');
        onDisconnect?.();

        if (autoReconnect && reconnectCountRef.current < 5) {
          const delay = Math.min(1000 * 2 ** reconnectCountRef.current, 10_000);
          reconnectCountRef.current++;
          setStatus('reconnecting');
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        onMessage(msg);
      } catch {
        // 不正なJSONは無視
      }
    };
  }, [url, token, onMessage, onDisconnect, onReconnect, autoReconnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectCountRef.current = 999; // 再接続防止
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  return { connect, disconnect, send, status };
}
