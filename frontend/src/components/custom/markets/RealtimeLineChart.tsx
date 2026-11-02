"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";

import { fetchMarketCandles } from "@/hooks/useMarketCandles";
import {
  linePointsFromCandles,
  linePriceForOutcome,
  lineRangeMs,
  lineRangeToResolution,
  lineRangeToWindow,
} from "@/lib/candles/lineRange";
import {
  outcomeColor,
  type LinePoint,
  type LineRange,
  type NormalizedCandle,
} from "@/lib/candles/types";
import type { MultiLineChartHandle, MultiLineChartSeries } from "@/lib/charts/ohlcvChart";
import { onPriceStreamReconnect } from "@/providers/priceStreamConnector";
import { usePriceStore } from "@/stores/usePriceStore";
import type { Market } from "@/types/market";

type Status = "loading" | "ready" | "empty" | "error";

export type RealtimeLineChartProps = {
  marketId: string;
  range: LineRange;
  visibleIds: number[];
  outcomes: string[];
  binary: boolean;
  height: number;
  market?: Market;
};

/** Deduplicate timestamps (keep newest close value) and ensure ascending order. */
function deduplicateAndSort(points: LinePoint[]): LinePoint[] {
  if (points.length <= 1) return points;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const result: LinePoint[] = [];
  for (const pt of sorted) {
    const last = result[result.length - 1];
    if (!last) {
      result.push(pt);
    } else if (pt.time > last.time) {
      result.push(pt);
    } else if (pt.time === last.time) {
      result[result.length - 1] = pt;
    }
  }
  return result;
}

export function RealtimeLineChart({
  marketId,
  range,
  visibleIds,
  outcomes,
  binary,
  height,
  market,
}: RealtimeLineChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleRef = useRef<MultiLineChartHandle | null>(null);
  const chartReadyRef = useRef<Promise<MultiLineChartHandle | null>>(Promise.resolve(null));
  const historyReadyRef = useRef(false);
  const tokenRef = useRef(0);
  const prevMarketRef = useRef<string>("");
  const prevRangeRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);
  const pendingTickRef = useRef<{ timeSec: number; prices: number[] } | null>(null);
  const loadedCandlesRef = useRef<Map<number, NormalizedCandle[]>>(new Map());

  const [status, setStatus] = useState<Status>("loading");

  // Keep latest props accessible in event callbacks and background tasks without causing effect re-triggers
  const configRef = useRef({
    marketId,
    range,
    visibleIds,
    outcomes,
    binary,
    market,
  });
  configRef.current = { marketId, range, visibleIds, outcomes, binary, market };

  // 1. Chart instance lifecycle: created once per height; survives market/range/tick updates.
  useEffect(() => {
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let handle: MultiLineChartHandle | null = null;
    let resolveReady!: (value: MultiLineChartHandle | null) => void;

    chartReadyRef.current = new Promise<MultiLineChartHandle | null>((resolve) => {
      resolveReady = resolve;
    });

    void import("@/lib/charts/ohlcvChart").then(({ createMultiLineChart }) => {
      if (cancelled || !containerRef.current || !wrapperRef.current) {
        resolveReady(null);
        return;
      }
      handle = createMultiLineChart(containerRef.current, wrapperRef.current, height);
      handleRef.current = handle;
      resolveReady(handle);

      observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (!width || !handle) return;
        handle.resize(width, height);
      });
      observer.observe(containerRef.current);
    });

    return () => {
      cancelled = true;
      resolveReady(null);
      observer?.disconnect();
      handle?.destroy();
      handleRef.current = null;
    };
  }, [height]);

  // Helper to build line series points from candle responses and latest quote
  const buildSeriesList = useCallback(
    (
      candlesByOutcome: Map<number, NormalizedCandle[]>,
      targetRange: LineRange,
      targetVisibleIds: number[],
      targetOutcomes: string[],
      targetBinary: boolean
    ): MultiLineChartSeries[] => {
      const primaryPoints = deduplicateAndSort(
        linePointsFromCandles(candlesByOutcome.get(0) ?? [])
      );

      const quote = usePriceStore.getState();
      const quoteAt = quote.quotedAt[marketId];
      const quotePrices = quote.prices[marketId] ?? configRef.current.market?.prices;
      const timeSec = quoteAt ? Math.floor(Date.parse(quoteAt) / 1000) : NaN;
      const nowSec = Math.floor(Date.now() / 1000);
      const windowMs = lineRangeMs(targetRange);
      const cutoff = windowMs == null ? null : Math.floor((Date.now() - windowMs) / 1000);

      const list: MultiLineChartSeries[] = [];

      for (const id of targetVisibleIds) {
        let pts = deduplicateAndSort(
          linePointsFromCandles(candlesByOutcome.get(id) ?? [])
        );

        // Binary No inverse from Yes if outcome 1 has no native candles
        if (!pts.length && targetBinary && id === 1 && primaryPoints.length > 0) {
          pts = primaryPoints.map((p) => ({
            time: p.time,
            value: Number((1 - p.value).toFixed(6)),
          }));
        }

        // Incorporate current live socket tick right away if valid
        if (quotePrices?.length && Number.isFinite(timeSec)) {
          const livePrice = linePriceForOutcome(quotePrices, id, targetBinary);
          if (livePrice != null) {
            const last = pts[pts.length - 1];
            if (!last) {
              const startSec = cutoff != null ? cutoff : timeSec - 3600;
              pts = [
                { time: startSec, value: livePrice },
                { time: timeSec, value: livePrice },
              ];
            } else if (timeSec > last.time) {
              pts = [...pts, { time: timeSec, value: livePrice }];
            } else if (timeSec === last.time) {
              pts = [...pts.slice(0, -1), { time: last.time, value: livePrice }];
            }
          }
        }

        // Fallback for active markets with no historical candles:
        // Synthesize a flat line using market's current/initial price
        if (!pts.length) {
          const m = configRef.current.market;
          const fallbackPrice =
            linePriceForOutcome(quotePrices ?? m?.prices ?? [], id, targetBinary) ??
            m?.outcome_prices?.[id]?.price ??
            (id === 0 ? m?.yes_price : id === 1 ? m?.no_price : null);

          if (fallbackPrice != null && Number.isFinite(fallbackPrice)) {
            const startSec = cutoff != null ? cutoff : nowSec - 86400;
            pts = [
              { time: startSec, value: fallbackPrice },
              { time: nowSec, value: fallbackPrice },
            ];
          }
        }

        // Ensure line extends to nowSec (right edge)
        if (pts.length > 0 && pts[pts.length - 1].time < nowSec) {
          pts.push({ time: nowSec, value: pts[pts.length - 1].value });
        }

        // If an outcome series has only 1 point, synthesize a start point so lightweight-charts can render a line segment
        if (pts.length === 1) {
          const start = pts[0].time - 60;
          pts = [{ time: start, value: pts[0].value }, pts[0]];
        }

        pts = deduplicateAndSort(pts);

        if (pts.length > 0) {
          list.push({
            id,
            label: targetOutcomes[id] ?? `Outcome ${id + 1}`,
            color: outcomeColor(id),
            points: pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
          });
        }
      }

      return list;
    },
    [marketId]
  );

  const visibleKey = visibleIds.join(",");

  // 2. Initial history load: runs ONLY on mount, or when market, range, or visibleKey changes.
  //    NEVER runs on incoming WebSocket price ticks!
  useEffect(() => {
    const isNewMarket = prevMarketRef.current !== marketId;
    const isNewRange = prevRangeRef.current !== range;
    prevMarketRef.current = marketId;
    prevRangeRef.current = range;

    const token = ++tokenRef.current;

    // Fast-path: If the market hasn't changed and history is already in memory,
    // just instantly adjust the viewport zoom (timeRange) without re-fetching!
    if (historyReadyRef.current && !isNewMarket && isNewRange && loadedCandlesRef.current.size > 0) {
      const windowMs = lineRangeMs(range);
      const cutoff = windowMs == null ? null : Math.floor((Date.now() - windowMs) / 1000);
      const nowSec = Math.floor(Date.now() / 1000);
      void chartReadyRef.current.then((handle) => {
        if (handle && token === tokenRef.current) {
          handle.setVisibleTimeRange(
            range === "ALL" ? undefined : cutoff != null ? { from: cutoff, to: nowSec } : undefined
          );
        }
      });
      return;
    }

    // Only display "Loading chart..." on cold initial load or market switch — never on ticks or chips!
    if (!historyReadyRef.current || isNewMarket) {
      historyReadyRef.current = false;
      setStatus("loading");
      // Clear chart canvas immediately on new market so previous market's series aren't visible
      void chartReadyRef.current.then((handle) => {
        if (handle && token === tokenRef.current) {
          handle.setHistory([]);
        }
      });
    }

    const cfg = configRef.current;
    const ids = new Set(cfg.visibleIds);
    if (binary && ids.has(1)) ids.add(0);

    const loadHistory = async () => {
      try {
        const fromHistoryIso = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
        const toIso = new Date().toISOString();
        const fromRecentIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

        // 1. Fetch comprehensive history (1h stored candles up to 365 days)
        let entries = await Promise.all(
          [...ids].map(async (id) => {
            const rows = await fetchMarketCandles(marketId, "1h", {
              outcome: id,
              stored: true,
              from: fromHistoryIso,
              to: toIso,
            }).catch(() => [] as NormalizedCandle[]);
            return [id, rows] as const;
          })
        );

        let candlesMap = new Map(entries);
        const hasHistory = [...candlesMap.values()].some((rows) => rows.length > 0);

        // Fallback to 5m if 1h has no candles
        if (!hasHistory) {
          entries = await Promise.all(
            [...ids].map(async (id) => {
              const rows = await fetchMarketCandles(marketId, "5m", {
                outcome: id,
                stored: true,
                from: fromHistoryIso,
                to: toIso,
              }).catch(() => [] as NormalizedCandle[]);
              return [id, rows] as const;
            })
          );
          candlesMap = new Map(entries);
        }

        // 2. Fetch granular 1m candles for the last 24h to provide fine detail in 1H/6H views
        const recentEntries = await Promise.all(
          [...ids].map(async (id) => {
            try {
              const rows = await fetchMarketCandles(marketId, "1m", {
                outcome: id,
                stored: true,
                from: fromRecentIso,
                to: toIso,
              });
              return [id, rows] as const;
            } catch {
              return [id, [] as NormalizedCandle[]] as const;
            }
          })
        );
        const recentMap = new Map(recentEntries);

        // 3. Merge history + recent candles for each outcome (deduplicating by timestamp)
        const mergedEntries: Array<[number, NormalizedCandle[]]> = [...ids].map((id) => {
          const base = candlesMap.get(id) ?? [];
          const recent = recentMap.get(id) ?? [];
          const byTime = new Map<number, NormalizedCandle>();
          for (const c of base) byTime.set(c.time, c);
          for (const c of recent) byTime.set(c.time, c);
          const sorted = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
          return [id, sorted];
        });

        candlesMap = new Map(mergedEntries);
        loadedCandlesRef.current = candlesMap;

        const seriesList = buildSeriesList(
          candlesMap,
          range,
          cfg.visibleIds,
          cfg.outcomes,
          binary
        );

        const hasAnyPoints = seriesList.some((s) => s.points.length > 0);
        const handle = await chartReadyRef.current;
        if (token !== tokenRef.current || !handle) return;

        if (!hasAnyPoints) {
          handle.setHistory([]);
          historyReadyRef.current = false;
          setStatus("empty");
          return;
        }

        const windowMs = lineRangeMs(range);
        const cutoff = windowMs == null ? null : Math.floor((Date.now() - windowMs) / 1000);
        const nowSec = Math.floor(Date.now() / 1000);

        handle.setHistory(seriesList, {
          fit: true,
          timeRange:
            range === "ALL"
              ? undefined
              : cutoff != null
              ? { from: cutoff, to: nowSec }
              : undefined,
        });
        historyReadyRef.current = true;
        setStatus("ready");
      } catch (err) {
        if (token !== tokenRef.current) return;
        console.error("[RealtimeLineChart] Failed to load history:", err);
        const handle = await chartReadyRef.current;
        if (handle && token === tokenRef.current) {
          handle.setHistory([]);
        }
        historyReadyRef.current = false;
        setStatus("error");
      }
    };

    void loadHistory();
  }, [binary, buildSeriesList, marketId, range, visibleKey]);

  // 3. Fast-lane O(1) live price tick stream:
  //    - Batched via requestAnimationFrame
  //    - Does NOT trigger React state updates or component re-renders
  //    - Does NOT show "Loading chart..."
  //    - Never resets user's zoom or pan viewport
  useEffect(() => {
    const flushTicks = () => {
      rafIdRef.current = null;
      const tick = pendingTickRef.current;
      pendingTickRef.current = null;
      if (!tick || !historyReadyRef.current) return;

      const handle = handleRef.current;
      if (!handle) return;

      const cfg = configRef.current;
      handle.updateTick(tick.timeSec, (id) =>
        linePriceForOutcome(tick.prices, id, cfg.binary)
      );
    };

    const scheduleFlush = () => {
      if (rafIdRef.current != null) return;
      rafIdRef.current = requestAnimationFrame(flushTicks);
    };

    // Apply immediate current price on mount
    const currentQuote = usePriceStore.getState();
    const currentPrices = currentQuote.prices[marketId];
    const currentAt = currentQuote.quotedAt[marketId];
    if (currentPrices?.length && currentAt) {
      const timeSec = Math.floor(Date.parse(currentAt) / 1000);
      if (Number.isFinite(timeSec)) {
        pendingTickRef.current = { timeSec, prices: currentPrices };
        scheduleFlush();
      }
    }

    // Subscribe to store updates
    const unsubStore = usePriceStore.subscribe((state, prev) => {
      const nextPrices = state.prices[marketId];
      const nextAt = state.quotedAt[marketId];
      if (nextPrices === prev.prices[marketId] && nextAt === prev.quotedAt[marketId]) return;
      if (!nextPrices?.length || !nextAt) return;

      const timeSec = Math.floor(Date.parse(nextAt) / 1000);
      if (!Number.isFinite(timeSec)) return;

      pendingTickRef.current = { timeSec, prices: nextPrices };
      scheduleFlush();
    });

    // On WebSocket reconnection: re-sync missing historical data seamlessly
    const unsubReconnect = onPriceStreamReconnect(async () => {
      const handle = handleRef.current;
      if (!handle || !historyReadyRef.current) return;

      const cfg = configRef.current;
      const ids = new Set(cfg.visibleIds);
      if (cfg.binary && ids.has(1)) ids.add(0);

      try {
        const fromRecentIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const toIso = new Date().toISOString();

        const recentEntries = await Promise.all(
          [...ids].map(async (id) => {
            try {
              const rows = await fetchMarketCandles(cfg.marketId, "1m", {
                outcome: id,
                stored: true,
                from: fromRecentIso,
                to: toIso,
              });
              return [id, rows] as const;
            } catch {
              return [id, [] as NormalizedCandle[]] as const;
            }
          })
        );
        const recentMap = new Map(recentEntries);

        // Merge latest recent candles into existing loaded candles
        const mergedEntries: Array<[number, NormalizedCandle[]]> = [...ids].map((id) => {
          const base = loadedCandlesRef.current.get(id) ?? [];
          const recent = recentMap.get(id) ?? [];
          const byTime = new Map<number, NormalizedCandle>();
          for (const c of base) byTime.set(c.time, c);
          for (const c of recent) byTime.set(c.time, c);
          const sorted = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
          return [id, sorted];
        });

        const candlesMap = new Map(mergedEntries);
        loadedCandlesRef.current = candlesMap;

        const seriesList = buildSeriesList(
          candlesMap,
          cfg.range,
          cfg.visibleIds,
          cfg.outcomes,
          cfg.binary
        );
        if (seriesList.length > 0) {
          handle.resync(seriesList);
        }
      } catch (err) {
        console.warn("[RealtimeLineChart] Reconnect resync failed:", err);
      }
    });

    return () => {
      unsubStore();
      unsubReconnect();
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [buildSeriesList, marketId]);

  return (
    <div ref={wrapperRef} className="chart-wrap">
      {status === "loading" ? (
        <div className="status-banner status-banner-info">Loading chart…</div>
      ) : null}
      {status === "error" ? (
        <div className="status-banner status-banner-warn">Failed to load chart data</div>
      ) : null}
      {status === "empty" ? (
        <div className="chart-empty-overlay">
          <div className="chart-empty-message">
            <span>No historical chart data available for this market yet.</span>
          </div>
        </div>
      ) : null}
      <div ref={containerRef} className="chart-shell" style={{ height, minHeight: height }} />
    </div>
  );
}
