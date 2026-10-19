
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { WatchlistResponse } from "@/types/watchlist";

type AddToWatchlistBody = {
  canonical_id: string;
  platform: "polymarket" | "kalshi";
  outcome_id?: string;
  outcome_label?: string;
};

export function useWatchlist() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["watchlist"],
    queryFn: (): Promise<WatchlistResponse> => apiFetch("/api/v1/watchlist"),
  });

  const add = useMutation({
    mutationFn: (body: AddToWatchlistBody) =>
      apiFetch("/api/v1/watchlist", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const remove = useMutation({
    mutationFn: (canonicalId: string) =>
      apiFetch(`/api/v1/watchlist/${canonicalId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return {
    ...query,
    addToWatchlist: add.mutate,
    removeFromWatchlist: remove.mutate,
    isAdding: add.isPending,
    isRemoving: remove.isPending,
  };
}