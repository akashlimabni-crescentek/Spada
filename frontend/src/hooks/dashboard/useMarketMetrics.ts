import { useQuery } from "@tanstack/react-query";

import { getApiBaseUrl } from "@/lib/apiBase";
import type { MarketMetrics, MarketMetricsResponse } from "@/types/dashboard";

export function useMarketMetrics() {
  return useQuery({
    queryKey: ["markets", "metrics"],
    queryFn: async (): Promise<MarketMetrics> => {
      const base = getApiBaseUrl();
      if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");
      const res = await fetch(`${base}/api/v1/markets/metrics`);
      if (!res.ok) throw new Error(`Failed to fetch market metrics: ${res.status}`);

      const data: MarketMetricsResponse = await res.json();
      return data.metrics;
    },
  });
}