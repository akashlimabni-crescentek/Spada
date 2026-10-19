import { useQuery } from "@tanstack/react-query";
import type { RelatedArticle, RelatedNewsResponse } from "@/types/news";
import { getApiBaseUrl } from "@/lib/apiBase";

export function relatedNewsUrl(marketId: string, base = getApiBaseUrl()): string {
  const root = base.replace(/\/$/, "");
  return `${root}/api/news/related-markets?marketId=${encodeURIComponent(marketId)}`;
}

export function useRelatedNews(marketId: string) {
  return useQuery<RelatedArticle[]>({
    queryKey: ["related-news", marketId],
    queryFn: async () => {
      const base = getApiBaseUrl();
      if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");

      const res = await fetch(relatedNewsUrl(marketId, base));

      if (!res.ok) {
        throw new Error(`Failed to fetch related news: ${res.status}`);
      }

      const data: RelatedNewsResponse = await res.json();
      return data.correlations ?? [];
    },
    enabled: Boolean(marketId),
  });
}
