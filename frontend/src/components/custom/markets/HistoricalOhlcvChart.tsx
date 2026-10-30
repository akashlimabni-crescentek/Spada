"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { RealtimeLineChart } from "@/components/custom/markets/RealtimeLineChart";
import { RealtimeOhlcvChart } from "@/components/custom/markets/RealtimeOhlcvChart";
import { Card } from "@/components/ui/card";
import {
  CANDLE_RESOLUTIONS,
  DEFAULT_CANDLE_RESOLUTION,
  DEFAULT_LINE_RANGE,
  LINE_RANGES,
  outcomeColor,
  type CandleResolution,
  type ChartMode,
  type LineRange,
} from "@/lib/candles/types";
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
  marketId?: string;
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

  const initializedRef = useRef(false);

  useEffect(() => {
    const { watchMarket, unwatchMarket } = usePriceStore.getState();
    watchMarket(marketId);
    return () => unwatchMarket(marketId);
  }, [marketId]);

  useEffect(() => {
    initializedRef.current = false;
  }, [marketId]);

  useEffect(() => {
    if (initializedRef.current || !outcomes.length) return;
    initializedRef.current = true;

    const currentPrices = usePriceStore.getState().prices[marketId] ?? market.prices ?? [];
    const ranked = outcomes
      .map((label, index) => ({
        index,
        label,
        price: currentPrices[index] ?? market.outcome_prices?.[index]?.price ?? 0,
      }))
      .sort((a, b) => b.price - a.price);

    setVisibleIds(new Set(ranked.slice(0, DEFAULT_LINE_VISIBLE).map((item) => item.index)));
    setSelectedOutcome(ranked[0]?.index ?? 0);
  }, [outcomes, market.outcome_prices, market.prices, marketId]);

  const visibleIdsArray = useMemo(
    () => [...visibleIds].sort((a, b) => a - b),
    [visibleIds]
  );

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

      {mode === "line" ? (
        <RealtimeLineChart
          marketId={marketId}
          range={lineRange}
          visibleIds={visibleIdsArray}
          outcomes={outcomes}
          binary={binary}
          height={chartHeight}
        />
      ) : (
        <RealtimeOhlcvChart
          marketId={marketId}
          resolution={resolution}
          selectedOutcome={selectedOutcome}
          binary={binary}
          height={chartHeight}
        />
      )}
    </Card>
  );
}
