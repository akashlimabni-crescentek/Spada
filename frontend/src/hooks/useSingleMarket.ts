// hooks/useMarket.ts
"use client";

import { useQuery } from "@tanstack/react-query";

import { getApiBaseUrl } from "@/lib/apiBase";
import { Market } from "@/types/market";

interface MarketResponse {
  market: Market;
}

export function useMarket(id: string) {
  return useQuery({
    queryKey: ["markets", id],
    queryFn: async (): Promise<Market> => {
      const base = getApiBaseUrl();
      if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");
      const res = await fetch(`${base}/api/v1/markets/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`Failed to fetch market: ${res.status}`);
      const data: MarketResponse = await res.json();
      return data.market;
    },
    enabled: !!id,
  });
}

