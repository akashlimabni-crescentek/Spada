
import type { Market, Platform } from "@/types/market";

export interface WatchlistItem {
  id: string;
  canonical_id: string;
  platform: Platform;
  outcome_id: string | null;
  outcome_label: string | null;
  created_at: string;
  market: Market;
}

export interface WatchlistResponse {
  watchlist: WatchlistItem[];
}