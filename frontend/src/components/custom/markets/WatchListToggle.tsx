// components/custom/markets/WatchlistToggle.tsx
"use client";

import { Bookmark } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";

type WatchlistToggleProps = {
  canonicalId: string;
  platform: "polymarket" | "kalshi";
  outcomeId?: string;
  outcomeLabel?: string;
  className?: string;
};

export function WatchlistToggle({
  canonicalId,
  platform,
  outcomeId,
  outcomeLabel,
  className = "",
}: WatchlistToggleProps) {
  const { data, addToWatchlist, removeFromWatchlist, isAdding, isRemoving } = useWatchlist();

  const isWatched = data?.watchlist?.some((m) => m.canonical_id === canonicalId) ?? false;
  const isBusy = isAdding || isRemoving;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isBusy) return;

    if (isWatched) {
      removeFromWatchlist(canonicalId);
    } else {
        console.log("watchlist payload:", {
  canonical_id: canonicalId,
  platform,
  outcome_id: outcomeId || "",
  outcome_label: outcomeLabel || "",
});

      addToWatchlist({ canonical_id: canonicalId, platform, outcome_id: outcomeId, outcome_label: outcomeLabel });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isBusy}
      aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
      aria-pressed={isWatched}
      className={`flex items-center justify-center h-7 w-7 rounded-md transition-colors disabled:opacity-50 ${
        isWatched
          ? "text-foreground hover:text-foreground"
          : "text-dim hover:text-foreground hover:bg-raised"
      } ${className}`}
    >
      <Bookmark className="h-5 w-5" fill={isWatched ? "currentColor" : "none"} />
    </button>
  );
}