import { create } from "zustand";

interface PriceStore {
  prices: Record<string, number[]>; // canonical_id -> prices array
  /** Socket PRICE_UPDATE timestamp. The line tip uses this the way the POC uses updated_at. */
  quotedAt: Record<string, string>;
  /** Market pages currently open — used to scope websocket receive logs. */
  watchedMarketIds: Set<string>;
  setPrice: (canonicalId: string, prices: number[], timestamp?: string) => void;
  watchMarket: (canonicalId: string) => void;
  unwatchMarket: (canonicalId: string) => void;
}

export const usePriceStore = create<PriceStore>((set) => ({
  prices: {},
  quotedAt: {},
  watchedMarketIds: new Set(),
  setPrice: (canonicalId, newPrices, timestamp) =>
    set((state) => ({
      prices: { ...state.prices, [canonicalId]: newPrices },
      quotedAt:
        typeof timestamp === "string" && timestamp
          ? { ...state.quotedAt, [canonicalId]: timestamp }
          : state.quotedAt,
    })),
  watchMarket: (canonicalId) =>
    set((state) => {
      if (state.watchedMarketIds.has(canonicalId)) return state;
      const watchedMarketIds = new Set(state.watchedMarketIds);
      watchedMarketIds.add(canonicalId);
      return { watchedMarketIds };
    }),
  unwatchMarket: (canonicalId) =>
    set((state) => {
      if (!state.watchedMarketIds.has(canonicalId)) return state;
      const watchedMarketIds = new Set(state.watchedMarketIds);
      watchedMarketIds.delete(canonicalId);
      return { watchedMarketIds };
    }),
}));

// Components subscribe to 1 market's price slice, not the whole store —
// so a tick for market A never re-renders a card showing market B.
export function useLivePrice(canonicalId: string, fallback: number[]): number[] {
  const live = usePriceStore((state) => state.prices[canonicalId]);
  return live ?? fallback;
}
