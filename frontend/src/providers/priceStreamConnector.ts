// Price streaming for price updates

"use client";

import { useEffect } from "react";
import { fetchWsTicket } from "@/hooks/useWsTicket";
import { getWsBaseUrl } from "@/lib/apiBase";
import { usePriceStore } from "@/stores/usePriceStore";

/** Ref-counted per-market subscriptions the UI currently needs. */
const marketRefCounts = new Map<string, number>();
/** Ref-count for explicit subscribe_all consumers (none by default). */
let subscribeAllRefCount = 0;

let socket: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
let connectGeneration = 0;
let hasConnectedOnce = false;

type ReconnectListener = () => void;
const reconnectListeners = new Set<ReconnectListener>();

/** Fire after a successful WebSocket reconnect (not the first connect). */
export function onPriceStreamReconnect(listener: ReconnectListener): () => void {
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}

function notifyReconnect(): void {
  for (const listener of reconnectListeners) {
    try {
      listener();
    } catch {
      // chart resync listeners must not break the socket lifecycle
    }
  }
}

function isOpen(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}

function send(payload: Record<string, unknown>): void {
  if (!isOpen() || !socket) return;
  socket.send(JSON.stringify(payload));
}

/** Re-apply desired subscriptions after connect/reconnect. */
function flushSubscriptions(): void {
  if (!isOpen()) return;

  if (subscribeAllRefCount > 0) {
    send({ action: "subscribe_all" });
    return;
  }

  for (const canonicalId of marketRefCounts.keys()) {
    send({ action: "subscribe", canonical_id: canonicalId });
  }
}

/**
 * Request live prices for one market/event (canonical_id).
 * First consumer sends WS subscribe; further consumers only bump the ref-count.
 */
export function subscribe(canonicalId: string): void {
  if (!canonicalId) return;

  const next = (marketRefCounts.get(canonicalId) ?? 0) + 1;
  marketRefCounts.set(canonicalId, next);

  if (next === 1 && subscribeAllRefCount === 0) {
    send({ action: "subscribe", canonical_id: canonicalId });
  }
}

/**
 * Release interest in a market/event.
 * Last consumer sends WS unsubscribe.
 */
export function unsubscribe(canonicalId: string): void {
  if (!canonicalId) return;

  const current = marketRefCounts.get(canonicalId) ?? 0;
  if (current <= 0) return;

  const next = current - 1;
  if (next === 0) {
    marketRefCounts.delete(canonicalId);
    if (subscribeAllRefCount === 0) {
      send({ action: "unsubscribe", canonical_id: canonicalId });
    }
  } else {
    marketRefCounts.set(canonicalId, next);
  }
}

/**
 * Explicit all-markets subscription (not used automatically on connect).
 * Ref-counted so multiple callers can share one subscribe_all.
 */
export function subscribeAll(): void {
  subscribeAllRefCount += 1;
  if (subscribeAllRefCount === 1) {
    send({ action: "subscribe_all" });
  }
}

/** Release an explicit subscribe_all; restores per-market subs when the last caller leaves. */
export function unsubscribeAll(): void {
  if (subscribeAllRefCount <= 0) return;
  subscribeAllRefCount -= 1;
  if (subscribeAllRefCount === 0) {
    flushSubscriptions();
  }
}

/**
 * Lifecycle helper: subscribe while mounted, unsubscribe on unmount / id change.
 * Safe to call from multiple components for the same canonical_id (ref-counted).
 */
export function useMarketSubscription(canonicalId: string | undefined | null): void {
  useEffect(() => {
    if (!canonicalId) return;
    subscribe(canonicalId);
    return () => unsubscribe(canonicalId);
  }, [canonicalId]);
}

async function resolveWsUrl(signal?: AbortSignal): Promise<string> {
  const base = getWsBaseUrl();
  if (!base) throw new Error("NEXT_PUBLIC_WS_URL is not set");

  // Local/dev backend accepts anonymous ticketless WS. Skip the ticket POST
  // entirely so dig isn't spammed with Failed to fetch when the ticket call
  // races Strict Mode remounts or a momentarily unreachable API.
  if (process.env.NODE_ENV !== "production") {
    return base;
  }

  const ticket = await fetchWsTicket({ signal });
  return `${base}?ticket=${encodeURIComponent(ticket)}`;
}

export function PriceStreamConnector() {
  const setPrice = usePriceStore((state) => state.setPrice);

  useEffect(() => {
    let cancelled = false;
    const generation = ++connectGeneration;
    const abort = new AbortController();

    async function connect() {
      try {
        const wsUrl = await resolveWsUrl(abort.signal);
        if (cancelled || generation !== connectGeneration || abort.signal.aborted) return;

        const nextSocket = new WebSocket(wsUrl);
        socket = nextSocket;

        nextSocket.onopen = () => {
          if (cancelled || socket !== nextSocket) return;
          flushSubscriptions();
          if (hasConnectedOnce) {
            notifyReconnect();
          } else {
            hasConnectedOnce = true;
          }
        };

        nextSocket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "CONNECTED" || msg.type === "SUBSCRIBED") {
              console.log("[WebSocket] subscribed (waiting for data)", msg);
            }
            if (msg.type === "PRICE_UPDATE") {
              const watched = usePriceStore.getState().watchedMarketIds;
              const onThisPage =
                subscribeAllRefCount > 0 ||
                marketRefCounts.has(msg.canonical_id) ||
                watched.has(msg.canonical_id);
              if (onThisPage) {
                console.log("[WebSocket] data received", {
                  type: msg.type,
                  canonical_id: msg.canonical_id,
                  prices: msg.prices,
                  timestamp: msg.timestamp,
                  receivedAt: new Date().toISOString(),
                });
              }
              setPrice(msg.canonical_id, msg.prices);
            }
          } catch {
            // ignore malformed frames
          }
        };

        nextSocket.onclose = () => {
          if (socket === nextSocket) socket = null;
          if (!cancelled && generation === connectGeneration) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };

        nextSocket.onerror = () => nextSocket.close();
      } catch (err) {
        if (abort.signal.aborted || cancelled) return;
        console.error("[PriceStream] Failed to connect:", err);
        if (generation === connectGeneration) {
          reconnectTimeout = setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      abort.abort();
      clearTimeout(reconnectTimeout);
      reconnectTimeout = undefined;
      socket?.close();
      socket = null;
    };
  }, [setPrice]);

  return null;
}
