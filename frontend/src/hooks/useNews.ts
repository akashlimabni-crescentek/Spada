import { useQuery } from "@tanstack/react-query";
import type { NewsResponse } from "@/types/news";
import { getApiBaseUrl } from "@/lib/apiBase";

export function workspaceNewsUrl(
  category: string | null,
  base = getApiBaseUrl()
): string {
  const root = base.replace(/\/$/, "");
  const url = new URL(`${root}/api/workspace/news`);
  if (category) url.searchParams.set("category", category);
  return url.toString();
}

export function useNews(category: string | null) {
  return useQuery({
    queryKey: ["news", category], // category is part of the key so switching
                                   // categories triggers a fresh fetch + its own cache entry
    queryFn: async (): Promise<NewsResponse["articles"]> => {
      const base = getApiBaseUrl();
      if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");

      const res = await fetch(workspaceNewsUrl(category, base));
      if (!res.ok) throw new Error(`Failed to fetch news: ${res.status}`);

      const data: NewsResponse = await res.json();
      return data.articles;
    },
  });
}
