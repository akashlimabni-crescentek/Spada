"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getApiBaseUrl } from "@/lib/apiBase";
import { useMarketSubscription } from "@/providers/priceStreamConnector";

import type { MarketCross } from "@/types/ratios";

export function useRatios(marketId: string | null) {
  const query = useQuery({
    queryKey: ["ratios", marketId],
    queryFn: async (): Promise<MarketCross> => {
      const base = getApiBaseUrl();
      if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");
      const res = await fetch(`${base}/api/v1/ratios/${encodeURIComponent(String(marketId))}`);
      if (!res.ok) throw new Error(`Failed to fetch ratios: ${res.status}`);
      return res.json();
    },
    enabled: !!marketId,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const counterMarketId =
    query.data?.counterMarket &&
    typeof query.data.counterMarket === "object" &&
    "canonical_id" in query.data.counterMarket
      ? query.data.counterMarket.canonical_id
      : null;

  useMarketSubscription(counterMarketId);

  return query;
}
