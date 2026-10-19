import { useQuery } from "@tanstack/react-query";

import { getApiBaseUrl } from "@/lib/apiBase";
import type { EndingSoonMarket, EndingSoonResponse } from "@/types/dashboard";

export function useEndingSoon(limit?: number, category?: string) {
  return useQuery({
    queryKey: ["markets", "ending-soon", limit, category],
    queryFn: async (): Promise<EndingSoonMarket[]> => {
      const base = getApiBaseUrl();
      if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");

      const searchParams = new URLSearchParams();
      if (limit !== undefined) searchParams.set("limit", String(limit));
      if (category) searchParams.set("category", category);

      const res = await fetch(`${base}/api/v1/markets/ending-soon?${searchParams}`);
      if (!res.ok) throw new Error(`Failed to fetch ending-soon markets: ${res.status}`);

      const data: EndingSoonResponse = await res.json();
      return data.ending_soon;
    },
  });
}
