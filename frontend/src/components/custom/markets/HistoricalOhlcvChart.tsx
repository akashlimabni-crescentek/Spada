"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { RealtimeOhlcvChart } from "@/components/custom/markets/RealtimeOhlcvChart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketCandles } from "@/hooks/useMarketCandles";
import {
  applyLivePricesToLineSeries,
  buildOutcomeLineSeries,
  lineRangeToResolution,
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

type HistoricalOhlcvChartProps = {
  market: Market;
};

function chartHeightForViewport(width: number): number {
  if (width < 640) return 320;
  if (width < 1024) return 400;
  return 460;
}

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
  const [height, setHeight] = useState(460);
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set());
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [lineSeries, setLineSeries] = useState<ChartLineSeries[]>([]);

  const initializedRef = useRef(false);
  const historyKeyRef = useRef("");
  const linesRef = useRef<ChartLineSeries[]>([]);

  // Line mode only — OHLCV loads its own history inside RealtimeOhlcvChart.
  const lineResolution = lineRangeToResolution(lineRange);
  const query = useMarketCandles(marketId, lineResolution);
  const livePrices = usePriceStore((state) => state.prices[marketId]);
  const prices = useMemo(
    () => livePrices ?? market.prices ?? [],
    [livePrices, market.prices]
  );

  useEffect(() => {
    const update = () => setHeight(chartHeightForViewport(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

    if (!query.data?.length) {
      if (sessionChanged) setLineSeries([]);
      return;
    }

    if (sessionChanged || linesRef.current.length === 0) {
      const series = buildOutcomeLineSeries({
        candles: query.data,
        range: lineRange,
        outcomes,
        prices: market.prices ?? [],
        visibleIds: [...visibleIds],
        binary,
      });
      linesRef.current = series;
      setLineSeries(series);
    }
  }, [
    binary,
    lineHistoryKey,
    lineRange,
    market.prices,
    mode,
    outcomes,
    query.data,
    visibleIds,
  ]);

  useEffect(() => {
    if (mode !== "line") return;

    const applyLineLive = () => {
      const series = linesRef.current;
      if (!series.length) return;
      const fromWs = usePriceStore.getState().prices[marketId];
      if (!Array.isArray(fromWs) || !fromWs.length) return;
      const updated = applyLivePricesToLineSeries(
        series,
        fromWs,
        Math.floor(Date.now() / 1000)
      );
      linesRef.current = updated;
      setLineSeries(updated);
    };

    applyLineLive();
    const timer = window.setInterval(applyLineLive, 1000);
    return () => window.clearInterval(timer);
  }, [livePrices, marketId, mode]);

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

  const showLoading = mode === "line" && (query.isPending || query.isFetching);
  const showError = mode === "line" && !showLoading && query.isError;
  const showEmpty =
    mode === "line" && !showLoading && !query.isError && lineSeries.length === 0;
  const showLineChart = mode === "line" && !showLoading && !query.isError && lineSeries.length > 0;
  const live = (livePrices?.length ?? 0) > 0;
  const multiOutcome = outcomes.length > 1;

  return (
    <Card className="min-w-0 gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="t-h3">Price history</h2>
            <p className="t-meta mt-0.5">
              {multiOutcome
                ? `${outcomes.length} outcomes`
                : mode === "line"
                  ? "Close price"
                  : "OHLCV candles"}
            </p>
          </div>
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-positive">
              <span className="size-1.5 rounded-full bg-positive" />
              Live
            </span>
          ) : null}
        </div>

        {multiOutcome ? (
          <div className="outcome-chips" aria-label="Outcomes">
            {outcomes.map((label, index) => {
              const active =
                mode === "line" ? visibleIds.has(index) : selectedOutcome === index;
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            label="Chart type"
            value={mode}
            options={[
              { value: "line", label: "Line" },
              { value: "ohlcv", label: "OHLCV" },
            ]}
            onChange={setMode}
          />
          {mode === "line" ? (
            <SegmentedControl
              label="Time range"
              value={lineRange}
              options={LINE_RANGES.map((range) => ({ value: range, label: range }))}
              onChange={setLineRange}
            />
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SegmentedControl
                label="Candle resolution"
                value={resolution}
                options={CANDLE_RESOLUTIONS.map((item) => ({ value: item, label: item }))}
                onChange={setResolution}
              />
              {multiOutcome ? (
                <label className="inline-flex items-center gap-2 text-xs text-text-dim">
                  <span className="uppercase tracking-wide">Outcome</span>
                  <select
                    className="h-8 rounded-md border border-border bg-inset px-2 font-mono text-xs text-foreground"
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
          )}
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-lg border border-border bg-background"
        style={{ minHeight: height }}
        aria-busy={showLoading}
      >
        {showLoading ? <ChartSkeleton height={height} /> : null}
        {showError ? (
          <ChartStatus
            height={height}
            title="Price history didn't load"
            detail="The candles request failed. Try again in a moment."
            action={
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : null}
        {showEmpty ? (
          <ChartStatus
            height={height}
            title={`No ${lineRange} history`}
            detail="This market has no historical prices for the selected range yet."
          />
        ) : null}
        {showLineChart ? (
          <MultiLineChartView lines={lineSeries} height={height} resetKey={lineHistoryKey} />
        ) : null}
        {mode === "ohlcv" ? (
          <RealtimeOhlcvChart
            marketId={marketId}
            resolution={resolution}
            selectedOutcome={selectedOutcome}
            binary={binary}
            height={height}
            fallbackPrices={market.prices ?? []}
          />
        ) : null}
      </div>
    </Card>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-inset p-1"
      role="tablist"
      aria-label={label}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
            className={cn(
              "h-7 shrink-0 rounded-md px-2.5 font-mono text-xs font-semibold tracking-wide transition-colors",
              selected
                ? "bg-raised text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                : "text-text-dim hover:bg-raised/80 hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="flex flex-col gap-3 p-4" style={{ height }} aria-hidden>
      <div className="flex items-end justify-between gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="w-full flex-1 rounded-md" />
    </div>
  );
}

function ChartStatus({
  height,
  title,
  detail,
  action,
}: {
  height: number;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 px-6 text-center"
      style={{ minHeight: height }}
    >
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="t-meta max-w-sm">{detail}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
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
      handle.setLines(linesRef.current, { fit: true });
      resetRef.current = resetKey;

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
  }, [height, resetKey]);

  useEffect(() => {
    linesRef.current = lines;
    const fit = resetRef.current !== resetKey;
    resetRef.current = resetKey;
    handleRef.current?.setLines(lines, { fit });
  }, [lines, resetKey]);

  return (
    <div className="ohlcv-chart">
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
