"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { RealtimeOhlcvChart } from "@/components/custom/markets/RealtimeOhlcvChart";
import { Card } from "@/components/ui/card";
import { fetchMarketCandles } from "@/hooks/useMarketCandles";
import {
  applyLivePricesToLineSeries,
  buildOutcomeLineSeries,
  lineRangeToResolution,
  lineRangeToWindow,
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
} from "@/lib/candles/types";
import type { MultiLineChartHandle } from "@/lib/charts/ohlcvChart";
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

export function HistoricalOhlcvChart({ market }: HistoricalOhlcvChartProps) {
  const marketId = market.canonical_id;
  const outcomes = useMemo(() => marketOutcomes(market), [market]);
  const binary = market.outcome_type === "binary" || outcomes.length === 2;

  const [mode, setMode] = useState<ChartMode>("line");
  const [lineRange, setLineRange] = useState<LineRange>(DEFAULT_LINE_RANGE);
  const [resolution, setResolution] = useState<CandleResolution>(DEFAULT_CANDLE_RESOLUTION);
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set());
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [lineSeries, setLineSeries] = useState<ChartLineSeries[]>([]);

  const initializedRef = useRef(false);
  const historyKeyRef = useRef("");
  const linesRef = useRef<ChartLineSeries[]>([]);

  // Line mode only — OHLCV loads its own history inside RealtimeOhlcvChart.
  const lineResolution = lineRangeToResolution(lineRange);
  const visibleKey = [...visibleIds].sort((a, b) => a - b).join(",");
  const lineQuery = useQuery({
    queryKey: ["line-candles", marketId, lineRange, lineResolution, visibleKey, binary],
    enabled: mode === "line" && visibleIds.size > 0,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { from, to } = lineRangeToWindow(lineRange);
      const ids = new Set(visibleIds);
      if (binary && ids.has(1)) ids.add(0);
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
      return new Map(entries);
    },
  });
  const livePrices = usePriceStore((state) => state.prices[marketId]);
  const prices = useMemo(
    () => livePrices ?? market.prices ?? [],
    [livePrices, market.prices]
  );

  useEffect(() => {
    const { watchMarket, unwatchMarket } = usePriceStore.getState();
    watchMarket(marketId);
    return () => unwatchMarket(marketId);
  }, [marketId]);

  useEffect(() => {
    initializedRef.current = false;
    linesRef.current = [];
  }, [marketId]);

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

  const lineHistoryKey = `${marketId}|line|${lineResolution}|${lineRange}|${[...visibleIds].sort().join(",")}`;

  // Line chart: seed history once per session; live mids update the right edge.
  useEffect(() => {
    if (mode !== "line") return;

    const sessionChanged = historyKeyRef.current !== lineHistoryKey;
    if (sessionChanged) {
      historyKeyRef.current = lineHistoryKey;
      linesRef.current = [];
    }

    const candlesByOutcome = lineQuery.data;
    const hasRows = [...(candlesByOutcome?.values() ?? [])].some((rows) => rows.length > 0);
    if (!hasRows) {
      if (sessionChanged) setLineSeries([]);
      return;
    }

    if (sessionChanged || linesRef.current.length === 0) {
      const series = buildOutcomeLineSeries({
        candlesByOutcome: candlesByOutcome!,
        range: lineRange,
        outcomes,
        visibleIds: [...visibleIds],
        binary,
      });
      const quote = usePriceStore.getState();
      const quotedAt = quote.quotedAt[marketId];
      const quotePrices = quote.prices[marketId];
      const timeSec = quotedAt ? Math.floor(Date.parse(quotedAt) / 1000) : NaN;
      const withTip =
        quotePrices?.length && Number.isFinite(timeSec)
          ? applyLivePricesToLineSeries(series, quotePrices, timeSec, binary)
          : series;
      linesRef.current = withTip;
      setLineSeries(withTip);
    }
  }, [
    binary,
    lineHistoryKey,
    lineQuery.data,
    lineRange,
    marketId,
    mode,
    outcomes,
    visibleIds,
  ]);

  // POC applies each realtime price as it arrives. A render effect misses a tick
  // that lands before history is ready and does not run again until the next one.
  useEffect(() => {
    if (mode !== "line") return;

    const applyTick = (prices: number[] | undefined, quotedAt: string | undefined) => {
      const series = linesRef.current;
      if (!series.length || !prices?.length || !quotedAt) return;
      const timeSec = Math.floor(Date.parse(quotedAt) / 1000);
      if (!Number.isFinite(timeSec)) return;
      const updated = applyLivePricesToLineSeries(series, prices, timeSec, binary);
      if (updated === series) return;
      linesRef.current = updated;
      setLineSeries(updated);
    };

    const current = usePriceStore.getState();
    applyTick(current.prices[marketId], current.quotedAt[marketId]);
    return usePriceStore.subscribe((state, prev) => {
      const next = state.prices[marketId];
      const at = state.quotedAt[marketId];
      if (next === prev.prices[marketId] && at === prev.quotedAt[marketId]) return;
      applyTick(next, at);
    });
  }, [binary, marketId, mode]);

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

  const showLoading = mode === "line" && lineQuery.isPending && lineSeries.length === 0;
  const showError = mode === "line" && !showLoading && lineQuery.isError;
  const showEmpty =
    mode === "line" && !showLoading && !lineQuery.isError && lineSeries.length === 0;
  const showLineChart = mode === "line" && !showLoading && !lineQuery.isError && lineSeries.length > 0;
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

        <div className="timeline-bar" role="tablist" aria-label={mode === "line" ? "Time range" : "Candle resolution"}>
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
        <MultiLineChartView lines={lineSeries} height={chartHeight} resetKey={lineHistoryKey} />
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

function MultiLineChartView({
  lines,
  height,
  resetKey,
}: {
  lines: ChartLineSeries[];
  height: number;
  resetKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MultiLineChartHandle | null>(null);
  const linesRef = useRef(lines);
  const resetRef = useRef<string | null>(null);

  const resetKeyRef = useRef(resetKey);
  resetKeyRef.current = resetKey;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let handle: MultiLineChartHandle | null = null;

    void import("@/lib/charts/ohlcvChart").then(({ createMultiLineChart }) => {
      if (cancelled || !containerRef.current) return;
      handle = createMultiLineChart(containerRef.current, height);
      handleRef.current = handle;
      const hasPoints = linesRef.current.some((line) => line.points.length > 0);
      handle.setLines(linesRef.current, { fit: hasPoints });
      if (hasPoints) resetRef.current = resetKeyRef.current;

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
      resetRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    linesRef.current = lines;
    const hasPoints = lines.some((line) => line.points.length > 0);
    const fit = hasPoints && resetRef.current !== resetKey;
    if (fit) resetRef.current = resetKey;
    handleRef.current?.setLines(lines, { fit });
  }, [lines, resetKey]);

  return (
    <div className="chart-shell" ref={containerRef} style={{ height, minHeight: height }} />
  );
}
