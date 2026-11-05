"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UTCTimestamp } from "lightweight-charts";

import { RealtimeOhlcvChart } from "@/components/custom/markets/RealtimeOhlcvChart";
import { Card } from "@/components/ui/card";
import { fetchMarketCandles } from "@/hooks/useMarketCandles";
import {
  buildOutcomeLineSeries,
  lineFullHistoryWindow,
  linePriceForOutcome,
  lineRangeViewport,
} from "@/lib/candles/lineRange";
import {
  CANDLE_RESOLUTIONS,
  DEFAULT_CANDLE_RESOLUTION,
  DEFAULT_LINE_RANGE,
  LINE_RANGES,
  outcomeColor,
  type CandleResolution,
  type ChartLineSeries,
  type ChartMode,
  type LineRange,
  type NormalizedCandle,
} from "@/lib/candles/types";
import type { MultiLineChartHandle, MultiLineChartSeries } from "@/lib/charts/ohlcvChart";
import { cn } from "@/lib/utils";
import { usePriceStore } from "@/stores/usePriceStore";
import type { Market } from "@/types/market";

const DEFAULT_LINE_VISIBLE = 4;
const LINE_CHART_HEIGHT = 420;
const OHLCV_CHART_HEIGHT = 480;

/** POC interval labels. Request values stay 1h / 4h / 1d / 1w. */
const OHLCV_INTERVAL_LABEL: Record<CandleResolution, string> = {
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
};

type HistoricalOhlcvChartProps = {
  market: Market;
};

function marketOutcomes(market: Market): string[] {
  if (market.outcomes?.length) return market.outcomes;
  if (market.outcome_prices?.length) return market.outcome_prices.map((item) => item.name);
  return ["Yes", "No"];
}

/** Merge two candle arrays by timestamp. Later entries overwrite earlier ones. */
function mergeCandles(base: NormalizedCandle[], overlay: NormalizedCandle[]): NormalizedCandle[] {
  const byTime = new Map<number, NormalizedCandle>();
  for (const c of base) byTime.set(c.time, c);
  for (const c of overlay) byTime.set(c.time, c);
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

export function HistoricalOhlcvChart({ market }: HistoricalOhlcvChartProps) {
  const marketId = market.canonical_id;
  const outcomes = useMemo(() => marketOutcomes(market), [market]);
  const binary = market.outcome_type === "binary" || outcomes.length === 2;

  const [mode, setMode] = useState<ChartMode>("line");
  const [lineRange, setLineRange] = useState<LineRange>(DEFAULT_LINE_RANGE);
  const [resolution, setResolution] = useState<CandleResolution>(DEFAULT_CANDLE_RESOLUTION);
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set());
  const [selectedOutcome, setSelectedOutcome] = useState(0);

  const initializedRef = useRef(false);

  // In-memory candle store — never stored in React state to avoid re-renders
  const loadedCandlesRef = useRef<Map<number, NormalizedCandle[]>>(new Map());
  const earliestLoadedSecRef = useRef<number | null>(null);
  const loadingOlderRef = useRef(false);
  const exhaustedRef = useRef(false);

  // Chart handle ref — accessed directly for ticks and prepend, no React state
  const handleRef = useRef<MultiLineChartHandle | null>(null);
  // If data arrives before the chart DOM mounts, store the seed fn here and
  // call it once the handle is ready (fixes blank chart on hard refresh).
  const pendingSeedRef = useRef<(() => void) | null>(null);

  const visibleKey = [...visibleIds].sort((a, b) => a - b).join(",");

  // ─── Outcome initialisation ───────────────────────────────────────────────
  useEffect(() => {
    const { watchMarket, unwatchMarket } = usePriceStore.getState();
    watchMarket(marketId);
    return () => unwatchMarket(marketId);
  }, [marketId]);

  useEffect(() => {
    initializedRef.current = false;
    loadedCandlesRef.current = new Map();
    earliestLoadedSecRef.current = null;
    exhaustedRef.current = false;
  }, [marketId]);

  const prices = usePriceStore((state) => state.prices[marketId]) ?? market.prices ?? [];

  useEffect(() => {
    if (initializedRef.current || !outcomes.length) return;
    initializedRef.current = true;

    const ranked = outcomes
      .map((label, index) => ({
        index,
        label,
        price: prices[index] ?? market.outcome_prices?.[index]?.price ?? 0,
      }))
      .sort((a, b) => b.price - a.price);

    setVisibleIds(new Set(ranked.slice(0, DEFAULT_LINE_VISIBLE).map((item) => item.index)));
    setSelectedOutcome(ranked[0]?.index ?? 0);
  }, [outcomes, market.outcome_prices, prices]);

  // ─── Full-history fetch (once per market + visibleIds, NOT per range) ─────
  const lineQuery = useQuery({
    queryKey: ["line-candles-full", marketId, visibleKey, binary],
    enabled: mode === "line" && visibleIds.size > 0,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { from, to } = lineFullHistoryWindow();
      const recentFrom = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      const ids = new Set(visibleIds);
      if (binary && ids.has(1)) ids.add(0);

      // 1h candles for full 365-day history
      const historyEntries = await Promise.all(
        [...ids].map(async (id) => {
          const rows = await fetchMarketCandles(marketId, "1h", {
            outcome: id,
            stored: true,
            from,
            to,
          }).catch(() => [] as NormalizedCandle[]);
          return [id, rows] as const;
        })
      );

      // 1m candles for last 24h (fine detail for 1H / 6H views)
      const recentEntries = await Promise.all(
        [...ids].map(async (id) => {
          const rows = await fetchMarketCandles(marketId, "1m", {
            outcome: id,
            stored: true,
            from: recentFrom,
            to,
          }).catch(() => [] as NormalizedCandle[]);
          return [id, rows] as const;
        })
      );

      // Merge: 1m overwrites 1h for the overlapping 24h window
      const merged = new Map<number, NormalizedCandle[]>();
      for (const [id, base] of historyEntries) {
        const recent = new Map(recentEntries).get(id) ?? [];
        merged.set(id, mergeCandles(base, recent));
      }
      return merged;
    },
  });

  // ─── Seed chart when data arrives (not on range change) ───────────────────
  const historyKey = `${marketId}|${visibleKey}`;
  const historyKeyRef = useRef("");

  useEffect(() => {
    if (mode !== "line") return;
    const candlesByOutcome = lineQuery.data;
    if (!candlesByOutcome) return;

    const hasRows = [...candlesByOutcome.values()].some((r) => r.length > 0);
    if (!hasRows) return;

    // Store in ref for infinite scroll use
    loadedCandlesRef.current = candlesByOutcome;

    // Track earliest loaded timestamp for infinite scroll
    let earliest = Infinity;
    for (const rows of candlesByOutcome.values()) {
      if (rows.length > 0 && rows[0].time < earliest) earliest = rows[0].time;
    }
    earliestLoadedSecRef.current = earliest === Infinity ? null : earliest;
    exhaustedRef.current = false;

    // Build the seed function — called immediately if handle is ready,
    // or stored in pendingSeedRef for MultiLineChartView to call once mounted.
    const doSeed = () => {
      const handle = handleRef.current;
      if (!handle) return;

      const series = buildOutcomeLineSeries({
        candlesByOutcome,
        range: "ALL",
        outcomes,
        visibleIds: [...visibleIds],
        binary,
      });

      const quote = usePriceStore.getState();
      const quotedAt = quote.quotedAt[marketId];
      const quotePrices = quote.prices[marketId];
      const timeSec = quotedAt ? Math.floor(Date.parse(quotedAt) / 1000) : NaN;

      const chartSeries: MultiLineChartSeries[] = series.map((s) => {
        let points = s.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
        if (quotePrices?.length && Number.isFinite(timeSec)) {
          const livePrice = linePriceForOutcome(quotePrices, s.id, binary);
          if (livePrice != null) {
            const last = points[points.length - 1];
            if (!last || timeSec > (last.time as number)) {
              points = [...points, { time: timeSec as UTCTimestamp, value: livePrice }];
            } else if (timeSec === (last.time as number)) {
              points = [...points.slice(0, -1), { time: last.time, value: livePrice }];
            }
          }
        }
        return { id: s.id, label: s.label, color: s.color, points };
      });

      const viewport = lineRangeViewport(lineRange);
      handle.setHistory(chartSeries, { fit: true, timeRange: viewport });
      historyKeyRef.current = historyKey;
      pendingSeedRef.current = null;
    };

    if (handleRef.current) {
      doSeed();
    } else {
      // Chart DOM not mounted yet — store for MultiLineChartView to call
      pendingSeedRef.current = doSeed;
    }
  }, [binary, historyKey, lineQuery.data, lineRange, marketId, mode, outcomes, visibleIds]);

  // ─── Viewport-only update when timeframe button changes ───────────────────
  useEffect(() => {
    if (mode !== "line") return;
    const handle = handleRef.current;
    if (!handle) return;
    // Only adjust viewport if history is already loaded
    if (historyKeyRef.current !== historyKey) return;
    const viewport = lineRangeViewport(lineRange);
    handle.setVisibleTimeRange(viewport);
  }, [historyKey, lineRange, mode]);

  // ─── Live tick: O(1) direct chart update, zero React re-renders ───────────
  useEffect(() => {
    if (mode !== "line") return;

    const applyTick = (tickPrices: number[], quotedAt: string) => {
      const handle = handleRef.current;
      if (!handle) return;
      const timeSec = Math.floor(Date.parse(quotedAt) / 1000);
      if (!Number.isFinite(timeSec)) return;
      handle.updateTick(timeSec, (id) => linePriceForOutcome(tickPrices, id, binary));
    };

    const current = usePriceStore.getState();
    if (current.prices[marketId]?.length && current.quotedAt[marketId]) {
      applyTick(current.prices[marketId], current.quotedAt[marketId]);
    }

    return usePriceStore.subscribe((state, prev) => {
      const next = state.prices[marketId];
      const at = state.quotedAt[marketId];
      if (next === prev.prices[marketId] && at === prev.quotedAt[marketId]) return;
      if (!next?.length || !at) return;
      applyTick(next, at);
    });
  }, [binary, marketId, mode]);

  // ─── Infinite scroll: fetch older data when user reaches left edge ─────────
  const handleScrollNearLeft = useCallback(async () => {
    if (loadingOlderRef.current || exhaustedRef.current) return;
    const earliest = earliestLoadedSecRef.current;
    if (earliest == null) return;
    const handle = handleRef.current;
    if (!handle) return;

    loadingOlderRef.current = true;
    try {
      const toMs = earliest * 1000;
      const fromMs = toMs - 365 * 24 * 3600 * 1000;
      const toIso = new Date(toMs).toISOString();
      const fromIso = new Date(fromMs).toISOString();

      const ids = new Set(visibleIds);
      if (binary && ids.has(1)) ids.add(0);

      const olderEntries = await Promise.all(
        [...ids].map(async (id) => {
          const rows = await fetchMarketCandles(marketId, "1h", {
            outcome: id,
            stored: true,
            from: fromIso,
            to: toIso,
          }).catch(() => [] as NormalizedCandle[]);
          return [id, rows] as const;
        })
      );

      const hasOlderData = olderEntries.some(([, rows]) => rows.length > 0);
      if (!hasOlderData) {
        exhaustedRef.current = true;
        return;
      }

      // Merge older data into existing loaded candles
      let newEarliest = earliest;
      for (const [id, olderRows] of olderEntries) {
        const existing = loadedCandlesRef.current.get(id) ?? [];
        const merged = mergeCandles(olderRows, existing);
        loadedCandlesRef.current.set(id, merged);
        if (merged.length > 0 && merged[0].time < newEarliest) {
          newEarliest = merged[0].time;
        }
      }
      earliestLoadedSecRef.current = newEarliest;

      // Rebuild series from full merged dataset and prepend without viewport reset
      const series = buildOutcomeLineSeries({
        candlesByOutcome: loadedCandlesRef.current,
        range: "ALL",
        outcomes,
        visibleIds: [...visibleIds],
        binary,
      });

      const chartSeries: MultiLineChartSeries[] = series.map((s) => ({
        id: s.id,
        label: s.label,
        color: s.color,
        points: s.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      }));

      handle.prependHistory(chartSeries);
    } finally {
      loadingOlderRef.current = false;
    }
  }, [binary, marketId, outcomes, visibleIds]);

  // ─── Outcome toggle ────────────────────────────────────────────────────────
  const toggleOutcome = (id: number) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const showLoading = mode === "line" && lineQuery.isPending && !lineQuery.data;
  const showError = mode === "line" && !showLoading && lineQuery.isError;
  const showEmpty =
    mode === "line" &&
    !showLoading &&
    !lineQuery.isError &&
    lineQuery.data != null &&
    [...lineQuery.data.values()].every((r) => r.length === 0);
  const showLineChart = mode === "line" && !showLoading && !lineQuery.isError && !showEmpty;
  const chartHeight = mode === "line" ? LINE_CHART_HEIGHT : OHLCV_CHART_HEIGHT;

  return (
    <Card className="min-w-0 gap-4 p-4 sm:p-5">
      <div className="event-chart-header">
        <span className="t-meta">
          {outcomes.length} outcome{outcomes.length === 1 ? "" : "s"}
        </span>
      </div>

      {outcomes.length > 0 ? (
        <div className="outcome-chips" aria-label="Outcomes">
          {outcomes.map((label, index) => {
            const active = mode === "line" ? visibleIds.has(index) : selectedOutcome === index;
            return (
              <button
                key={`${label}-${index}`}
                type="button"
                className={cn("outcome-chip", active && "outcome-chip-active")}
                onClick={() => {
                  if (mode === "line") toggleOutcome(index);
                  else setSelectedOutcome(index);
                }}
              >
                <span className="outcome-dot" style={{ background: outcomeColor(index) }} />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="chart-toolbar">
        <div className="mode-toggle" role="tablist" aria-label="Chart type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "line"}
            className={cn("mode-btn", mode === "line" && "mode-btn-active")}
            onClick={() => setMode("line")}
          >
            LINE
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "ohlcv"}
            className={cn("mode-btn", mode === "ohlcv" && "mode-btn-active")}
            onClick={() => setMode("ohlcv")}
          >
            OHLCV
          </button>
        </div>

        <div
          className="timeline-bar"
          role="tablist"
          aria-label={mode === "line" ? "Time range" : "Candle resolution"}
        >
          {mode === "line"
            ? LINE_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  role="tab"
                  aria-selected={lineRange === range}
                  className={cn("timeline-btn", lineRange === range && "timeline-btn-active")}
                  onClick={() => setLineRange(range)}
                >
                  {range}
                </button>
              ))
            : CANDLE_RESOLUTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={resolution === item}
                  className={cn("timeline-btn", resolution === item && "timeline-btn-active")}
                  onClick={() => setResolution(item)}
                >
                  {OHLCV_INTERVAL_LABEL[item]}
                </button>
              ))}
        </div>

        {mode === "ohlcv" && outcomes.length > 0 ? (
          <label className="outcome-select-wrap">
            <span className="outcome-select-label">Outcome</span>
            <select
              className="outcome-select"
              value={selectedOutcome}
              onChange={(event) => setSelectedOutcome(Number(event.target.value))}
            >
              {outcomes.map((label, index) => (
                <option key={`${label}-${index}`} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {showLoading ? <div className="status-banner status-banner-info">Loading chart…</div> : null}
      {showError ? (
        <div className="status-banner status-banner-warn">Failed to load chart data</div>
      ) : null}
      {showEmpty ? (
        <div className="status-banner status-banner-warn">
          No chart data yet — promote this event to hot and wait for history backfill.
        </div>
      ) : null}

      {showLineChart ? (
        <MultiLineChartView
          height={chartHeight}
          handleRef={handleRef}
          onScrollNearLeft={handleScrollNearLeft}
          pendingSeedRef={pendingSeedRef}
        />
      ) : null}

      {mode === "ohlcv" ? (
        <RealtimeOhlcvChart
          marketId={marketId}
          resolution={resolution}
          selectedOutcome={selectedOutcome}
          binary={binary}
          height={chartHeight}
        />
      ) : null}
    </Card>
  );
}

// ─── MultiLineChartView ───────────────────────────────────────────────────────
// Owns the chart DOM lifecycle only. Data is pushed via handleRef by the parent.
function MultiLineChartView({
  height,
  handleRef,
  onScrollNearLeft,
  pendingSeedRef,
}: {
  height: number;
  handleRef: React.MutableRefObject<MultiLineChartHandle | null>;
  onScrollNearLeft: () => void;
  pendingSeedRef: React.MutableRefObject<(() => void) | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onScrollNearLeftRef = useRef(onScrollNearLeft);
  onScrollNearLeftRef.current = onScrollNearLeft;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let handle: MultiLineChartHandle | null = null;

    void import("@/lib/charts/ohlcvChart").then(({ createMultiLineChart }) => {
      if (cancelled || !containerRef.current) return;

      handle = createMultiLineChart(containerRef.current, height, undefined, {
        onScrollNearLeft: () => onScrollNearLeftRef.current(),
      });
      handleRef.current = handle;

      // Data may have arrived before the chart mounted — flush the pending seed now
      pendingSeedRef.current?.();

      observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (!width || !handle) return;
        handle.resize(width, height);
      });
      observer.observe(containerRef.current);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      handle?.destroy();
      handleRef.current = null;
    };
  }, [height, handleRef, pendingSeedRef]);

  return (
    <div className="chart-shell" ref={containerRef} style={{ height, minHeight: height }} />
  );
}
