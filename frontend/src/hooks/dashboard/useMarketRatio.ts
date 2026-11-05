"use client";

import { useEffect, useRef } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getApiBaseUrl } from "@/lib/apiBase";
import { useMarketSubscription } from "@/providers/priceStreamConnector";
import { usePriceStore } from "@/stores/usePriceStore";
import type { MarketCross } from "@/types/ratios";

export function useRatios(marketId: string | null) {
  const liveYes = usePriceStore((state) =>
    marketId ? state.prices[marketId]?.[0] : undefined
  );

  const query = useQuery({
    queryKey: ["ratios", marketId, liveYes ?? "none"],
    queryFn: async (): Promise<MarketCross> => {
      const base = getApiBaseUrl();
      if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");
      const res = await fetch(`${base}/api/v1/ratios/${encodeURIComponent(String(marketId))}`);
      if (!res.ok) throw new Error(`Failed to fetch ratios: ${res.status}`);
      return res.json();
    },
    enabled: !!marketId,
    placeholderData: keepPreviousData,
    // Book-driven fields (execution cost, Kalshi liquidity) change without a new price tick.
    refetchInterval: 5_000,
  });

  const counterMarketId =
    query.data?.counterMarket &&
    typeof query.data.counterMarket === "object" &&
    "canonical_id" in query.data.counterMarket
      ? query.data.counterMarket.canonical_id
      : null;

  useMarketSubscription(counterMarketId);

  const counterYes = usePriceStore((state) =>
    counterMarketId ? state.prices[counterMarketId]?.[0] : undefined
  );

  const prevCounterYesRef = useRef(counterYes);
  useEffect(() => {
    if (counterYes !== prevCounterYesRef.current) {
      prevCounterYesRef.current = counterYes;
      if (counterYes !== undefined) {
        query.refetch();
      }
    }
  }, [counterYes, query]);

  return query;
}
