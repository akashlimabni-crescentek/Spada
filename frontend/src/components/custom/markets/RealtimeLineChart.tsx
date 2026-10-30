"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";

import { fetchMarketCandles } from "@/hooks/useMarketCandles";
import {
  linePointsFromCandles,
  linePriceForOutcome,
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

type Status = "loading" | "ready" | "empty" | "error";

export type RealtimeLineChartProps = {
  marketId: string;
  range: LineRange;
  visibleIds: number[];
  outcomes: string[];
  binary: boolean;
  height: number;
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

  const [status, setStatus] = useState<Status>("loading");

  // Keep latest props accessible in event callbacks and background tasks without causing effect re-triggers
  const configRef = useRef({
    marketId,
    range,
    visibleIds,
    outcomes,
    binary,
  });
  configRef.current = { marketId, range, visibleIds, outcomes, binary };

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
        linePointsFromCandles(candlesByOutcome.get(0) ?? [], targetRange)
      );

      const quote = usePriceStore.getState();
      const quoteAt = quote.quotedAt[marketId];
      const quotePrices = quote.prices[marketId];
      const timeSec = quoteAt ? Math.floor(Date.parse(quoteAt) / 1000) : NaN;

      const list: MultiLineChartSeries[] = [];

      for (const id of targetVisibleIds) {
        let pts = deduplicateAndSort(
          linePointsFromCandles(candlesByOutcome.get(id) ?? [], targetRange)
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
              pts = [{ time: timeSec, value: livePrice }];
            } else if (timeSec > last.time) {
              pts = [...pts, { time: timeSec, value: livePrice }];
            } else if (timeSec === last.time) {
              pts = [...pts.slice(0, -1), { time: last.time, value: livePrice }];
            }
          }
        }

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

    // Only display "Loading chart..." on cold initial load or market switch — never on ticks or chips!
    if (!historyReadyRef.current || isNewMarket) {
      historyReadyRef.current = false;
      setStatus("loading");
    }

    const cfg = configRef.current;
    const lineResolution = lineRangeToResolution(range);
    const { from, to } = lineRangeToWindow(range);
    const ids = new Set(cfg.visibleIds);
    if (binary && ids.has(1)) ids.add(0);

    const loadHistory = async () => {
      try {
        const entries = await Promise.all(
          [...ids].map(async (id) => {
            const rows = await fetchMarketCandles(marketId, lineResolution, {
              outcome: id,
              stored: true,
              from,
              to,
            });
            return [id, rows] as const;
          })
        );

        if (token !== tokenRef.current) return;

        const candlesMap = new Map(entries);
        const hasRows = [...candlesMap.values()].some((rows) => rows.length > 0);

        if (!hasRows) {
          setStatus("empty");
          return;
        }

        const seriesList = buildSeriesList(
          candlesMap,
          range,
          cfg.visibleIds,
          cfg.outcomes,
          binary
        );
        if (!seriesList.length) {
          setStatus("empty");
          return;
        }

        const handle = await chartReadyRef.current;
        if (token !== tokenRef.current || !handle) return;

        // Fit content ONLY on initial market load or when user changed the time range button.
        // If user already zoomed in, preserve their exact zoom/pan viewport!
        const fit = isNewMarket || isNewRange;
        handle.setHistory(seriesList, { fit });
        historyReadyRef.current = true;
        setStatus("ready");
      } catch (err) {
        if (token !== tokenRef.current) return;
        console.error("[RealtimeLineChart] Failed to load history:", err);
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
      const lineResolution = lineRangeToResolution(cfg.range);
      const { from, to } = lineRangeToWindow(cfg.range);
      const ids = new Set(cfg.visibleIds);
      if (cfg.binary && ids.has(1)) ids.add(0);

      try {
        const entries = await Promise.all(
          [...ids].map(async (id) => {
            const rows = await fetchMarketCandles(cfg.marketId, lineResolution, {
              outcome: id,
              stored: true,
              from,
              to,
            });
            return [id, rows] as const;
          })
        );
        const seriesList = buildSeriesList(
          new Map(entries),
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
