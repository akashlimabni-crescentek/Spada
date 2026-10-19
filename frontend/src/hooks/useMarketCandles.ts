"use client";

import { useQuery } from "@tanstack/react-query";

import { getApiBaseUrl } from "@/lib/apiBase";
import { normalizeCandles } from "@/lib/candles/normalize";
import type { CandleResolution, NormalizedCandle } from "@/lib/candles/types";

async function fetchMarketCandles(
  marketId: string,
  resolution: CandleResolution
): Promise<NormalizedCandle[]> {
  const base = getApiBaseUrl();
  const url = `${base}/api/v1/markets/${encodeURIComponent(marketId)}/candles?resolution=${encodeURIComponent(resolution)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch candles: ${res.status}`);
  }

  const body: unknown = await res.json();
  return normalizeCandles(body);
}

export function useMarketCandles(marketId: string, resolution: CandleResolution) {
  return useQuery({
    queryKey: ["market-candles", marketId, resolution],
    queryFn: () => fetchMarketCandles(marketId, resolution),
    enabled: Boolean(marketId),
    // History is loaded once per market/resolution. Live OHLC updates come from
    // the price websocket (foldLiveCandle) — do not poll or the chart remounts.
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}
