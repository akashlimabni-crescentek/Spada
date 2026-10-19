import { useQuery } from "@tanstack/react-query";

import { getApiBaseUrl } from "@/lib/apiBase";
import type { MarketCross } from "@/types/ratios";

export function useRatios(marketId: string | null) {
  return useQuery({
    queryKey: ["ratios", marketId],
    queryFn: async (): Promise<MarketCross> => {
      const base = getApiBaseUrl();
      if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");
      const res = await fetch(`${base}/api/v1/ratios/${encodeURIComponent(String(marketId))}`);
      if (!res.ok) throw new Error(`Failed to fetch ratios: ${res.status}`);
      return res.json();
    },
    enabled: !!marketId,
  });
}
