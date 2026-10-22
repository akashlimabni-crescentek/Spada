// src/hooks/useOrderBook.ts
"use client";

import { useQuery } from "@tanstack/react-query";

import { getApiBaseUrl } from "@/lib/apiBase";

export interface OrderLevel {
  price: number | string;
  size: number | string;
}

export interface OrderBookResponse {
  canonical_id: string;
  platform: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
  timestamp: string;
}

type KalshiTuple = [string | number, string | number];

function parseKalshiTuple(level: unknown): { price: number; size: number } | null {
  if (Array.isArray(level) && level.length >= 2) {
    const price = Number(level[0]);
    const size = Number(level[1]);
    if (!Number.isFinite(price) || !Number.isFinite(size) || price < 0 || size <= 0) {
      return null;
    }
    return { price, size };
  }
  if (level && typeof level === "object") {
    const row = level as Record<string, unknown>;
    const price = Number(row.price);
    const size = Number(row.size ?? row.qty ?? row.quantity);
    if (!Number.isFinite(price) || !Number.isFinite(size) || price < 0 || size <= 0) {
      return null;
    }
    return { price, size };
  }
  return null;
}

function asLevelArray(raw: unknown): KalshiTuple[] {
  return Array.isArray(raw) ? (raw as KalshiTuple[]) : [];
}

/**
 * Kalshi returns YES/NO bid ladders in dollars (or legacy cents keys).
 * Shared OrderBook expects a YES-side book:
 *   bids = YES bids
 *   asks = implied YES asks from NO bids → price = 1 − NO bid
 */
function normalizeKalshiOrderbook(raw: {
  orderbook?: Record<string, unknown>;
}): { bids: OrderLevel[]; asks: OrderLevel[] } {
  const book = raw.orderbook ?? {};
  const yesLevels = asLevelArray(
    book.yes_dollars ?? book.yes ?? book.yes_bids ?? (book as { yesBids?: unknown }).yesBids
  );
  const noLevels = asLevelArray(
    book.no_dollars ?? book.no ?? book.no_bids ?? (book as { noBids?: unknown }).noBids
  );

  const yesParsed = yesLevels
    .map(parseKalshiTuple)
    .filter((level): level is { price: number; size: number } => level != null)
    .sort((a, b) => b.price - a.price);
  const noParsed = noLevels
    .map(parseKalshiTuple)
    .filter((level): level is { price: number; size: number } => level != null)
    .sort((a, b) => b.price - a.price);

  const bestYes = yesParsed[0]?.price;
  const bestNo = noParsed[0]?.price;
  const crossed =
    bestYes != null && bestNo != null && bestYes + bestNo > 1.0001;
  const noLeg = crossed
    ? noParsed
        .map((level) => ({
          price: Math.round((1 - level.price) * 1e6) / 1e6,
          size: level.size,
        }))
        .filter((level) => level.price > 0 && level.price < 1)
        .sort((a, b) => b.price - a.price)
    : noParsed;

  const bids: OrderLevel[] = yesParsed.map((level) => ({
    price: level.price,
    size: level.size,
  }));

  const asks: OrderLevel[] = [];
  for (const level of noLeg) {
    const yesAsk = Number((1 - level.price).toFixed(6));
    if (!Number.isFinite(yesAsk) || yesAsk < 0) continue;
    asks.push({ price: yesAsk, size: level.size });
  }
  asks.sort((a, b) => Number(a.price) - Number(b.price));

  return { bids, asks };
}

function normalizeOrderBookPayload(raw: Record<string, unknown>): OrderBookResponse {
  const platform = String(raw.platform ?? "");
  const canonical_id = String(raw.canonical_id ?? "");
  const timestamp = String(raw.timestamp ?? "");

  const hasUnifiedBook =
    Array.isArray(raw.bids) &&
    Array.isArray(raw.asks) &&
    ((raw.bids as unknown[]).length > 0 || (raw.asks as unknown[]).length > 0);

  // Prefer backend-normalized bids/asks when present (Polymarket + new Kalshi shape).
  if (hasUnifiedBook) {
    return {
      canonical_id,
      platform,
      bids: raw.bids as OrderLevel[],
      asks: raw.asks as OrderLevel[],
      timestamp,
    };
  }

  const isKalshi =
    platform === "kalshi" ||
    (raw.orderbook != null && !Array.isArray(raw.bids) && !Array.isArray(raw.asks));

  if (isKalshi) {
    const { bids, asks } = normalizeKalshiOrderbook(
      raw as { orderbook?: Record<string, unknown> }
    );
    return { canonical_id, platform: platform || "kalshi", bids, asks, timestamp };
  }

  return {
    canonical_id,
    platform,
    bids: Array.isArray(raw.bids) ? (raw.bids as OrderLevel[]) : [],
    asks: Array.isArray(raw.asks) ? (raw.asks as OrderLevel[]) : [],
    timestamp,
  };
}

async function fetchOrderBook(canonicalId: string): Promise<OrderBookResponse> {
  const base = getApiBaseUrl();
  if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");

  const res = await fetch(
    `${base}/api/v1/markets/${encodeURIComponent(canonicalId)}/orderbook`
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch order book: ${res.status}`);
  }

  const raw: unknown = await res.json();
  if (!raw || typeof raw !== "object") {
    return { canonical_id: canonicalId, platform: "", bids: [], asks: [], timestamp: "" };
  }

  return normalizeOrderBookPayload(raw as Record<string, unknown>);
}

export function useOrderBook(canonicalId: string) {
  return useQuery({
    queryKey: ["orderbook", canonicalId],
    queryFn: () => fetchOrderBook(canonicalId),
    enabled: !!canonicalId,
    refetchInterval: 5000,
  });
}
