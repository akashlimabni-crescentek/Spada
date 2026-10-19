"use client";

/**
 * Realtime OHLCV pane (two-lane model):
 *  - Slow lane: setHistory once (completed bars only; forming bucket stripped)
 *  - Fast lane: CandleAggregator + buildFormingCandle → updateLive (RAF)
 *  - Finer refetch on initial / bucket-roll / periodic 15s / WS reconnect
 *  - Chart instance survives ticks; only height recreates it
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { aggregateCandles } from "@/lib/candles/aggregateCandles";
import {
  CandleAggregator,
  bucketStartMs,
  priceToEvent,
} from "@/lib/candles/candleAggregator";
import {
  RESOLUTION_MS,
  SUB_INTERVAL_LADDER,
  buildFormingCandle,
  stripFormingBucket,
} from "@/lib/candles/formingCandle";
import { getApiBaseUrl } from "@/lib/apiBase";
import { invertCandles } from "@/lib/candles/lineRange";
import { normalizeCandles } from "@/lib/candles/normalize";
import type { CandleResolution, NormalizedCandle } from "@/lib/candles/types";
import type { OhlcvChartHandle } from "@/lib/charts/ohlcvChart";
import { onPriceStreamReconnect } from "@/providers/priceStreamConnector";
import { usePriceStore } from "@/stores/usePriceStore";

/** How often to refetch finer sub-candles so newly-closed blocks fold in. */
const FINER_REFETCH_MS = 15_000;

/**
 * When set, history for this resolution is loaded from a finer source interval
 * and rolled up client-side (same pattern as POC `OHLCV_SOURCE.aggregateMs`).
 * Leave empty while the API already returns native bars per resolution.
 */
const CLIENT_AGGREGATE_FROM: Partial<
  Record<CandleResolution, { source: CandleResolution; aggregateMs: number }>
> = {
  // Example (disabled by default — enable only if API lacks a native series):
  // "15m": { source: "5m", aggregateMs: RESOLUTION_MS["15m"] },
};

type Status = "loading" | "ready" | "empty" | "error";

type RealtimeOhlcvChartProps = {
  marketId: string;
  resolution: CandleResolution;
  /** 0 = Yes / primary, 1 = No (binary invert). */
  selectedOutcome: number;
  binary: boolean;
  height: number;
  fallbackPrices: number[];
};

async function fetchCandles(
  marketId: string,
  resolution: CandleResolution
): Promise<NormalizedCandle[]> {
  const base = getApiBaseUrl();
  const url = `${base}/api/v1/markets/${encodeURIComponent(marketId)}/candles?resolution=${encodeURIComponent(resolution)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`candles ${res.status}`);
  return normalizeCandles(await res.json());
}

function mapOutcome(
  rows: NormalizedCandle[],
  binary: boolean,
  selectedOutcome: number
): NormalizedCandle[] {
  if (binary && selectedOutcome === 1) return invertCandles(rows);
  return rows;
}

function outcomePrice(
  prices: number[] | undefined,
  selectedOutcome: number,
  fallback: number[]
): number | null {
  const list = prices?.length ? prices : fallback;
  const value = list[selectedOutcome];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function RealtimeOhlcvChart({
  marketId,
  resolution,
  selectedOutcome,
  binary,
  height,
  fallbackPrices,
}: RealtimeOhlcvChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleRef = useRef<OhlcvChartHandle | null>(null);
  const chartReadyRef = useRef<Promise<OhlcvChartHandle | null>>(Promise.resolve(null));
  const aggregatorRef = useRef<CandleAggregator | null>(null);
  const historyReadyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const tokenRef = useRef(0);
  const resyncingRef = useRef(false);
  const finerRowsRef = useRef<Partial<Record<CandleResolution, NormalizedCandle[]>>>({});
  const formingBucketStartRef = useRef<number | null>(null);
  const configRef = useRef<{
    marketId: string;
    resolution: CandleResolution;
    bucketMs: number;
    ladder: CandleResolution[];
    binary: boolean;
    selectedOutcome: number;
  } | null>(null);

  const [status, setStatus] = useState<Status>("loading");

  // Chart instance once per height — survives market/resolution/tick changes.
  useEffect(() => {
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let handle: OhlcvChartHandle | null = null;
    let resolveReady!: (value: OhlcvChartHandle | null) => void;
    chartReadyRef.current = new Promise<OhlcvChartHandle | null>((resolve) => {
      resolveReady = resolve;
    });

    void import("@/lib/charts/ohlcvChart").then(({ createOhlcvChart }) => {
      if (cancelled || !containerRef.current || !wrapperRef.current) {
        resolveReady(null);
        return;
      }
      handle = createOhlcvChart(containerRef.current, wrapperRef.current, height);
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

  const paintForming = useCallback(() => {
    const handle = handleRef.current;
    const cfg = configRef.current;
    if (!handle || !historyReadyRef.current || !cfg) return;

    const now = Date.now();
    const bucket = bucketStartMs(now, cfg.bucketMs);
    const { candle } = buildFormingCandle({
      interval: cfg.resolution,
      bucketStartMs: bucket,
      nowMs: now,
      ladder: cfg.ladder,
      finerRowsByInterval: finerRowsRef.current,
      liveTail: aggregatorRef.current?.current ?? null,
    });
    if (!candle) return;
    handle.updateLive(candle);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paintForming();
    });
  }, [paintForming]);

  // Load history + live subscribe for this (market, resolution, outcome) key.
  useEffect(() => {
    if (!binary && selectedOutcome > 0) {
      const emptyId = requestAnimationFrame(() => setStatus("empty"));
      return () => cancelAnimationFrame(emptyId);
    }

    const token = ++tokenRef.current;
    historyReadyRef.current = false;
    const loadingId = requestAnimationFrame(() => {
      if (token === tokenRef.current) setStatus("loading");
    });

    const bucketMs = RESOLUTION_MS[resolution];
    const ladder = SUB_INTERVAL_LADDER[resolution];
    aggregatorRef.current = new CandleAggregator(bucketMs);
    configRef.current = {
      marketId,
      resolution,
      bucketMs,
      ladder,
      binary,
      selectedOutcome,
    };
    finerRowsRef.current = {};
    formingBucketStartRef.current = null;
    let finerFetchSeq = 0;
    let tickSeq = 0;

    const loadHistory = async (fit: boolean) => {
      // Wait for chart create so setHistory is never dropped on a null handle.
      await chartReadyRef.current;
      if (token !== tokenRef.current) return null;

      const aggregateCfg = CLIENT_AGGREGATE_FROM[resolution];
      let rows = await fetchCandles(
        marketId,
        aggregateCfg?.source ?? resolution
      );
      rows = mapOutcome(rows, binary, selectedOutcome);
      if (aggregateCfg) {
        rows = aggregateCandles(rows, aggregateCfg.aggregateMs);
      }
      // Gap-fill is owned by the backend candle API — do not re-fill here.

      const bucketStart = bucketStartMs(Date.now(), bucketMs);
      const bucketStartSec = Math.floor(bucketStart / 1000);
      // Forming bucket is owned by composition — strip from immutable history.
      const completed = stripFormingBucket(rows, bucketStartSec);

      if (token !== tokenRef.current) return null;
      handleRef.current?.setHistory(completed, { fit });
      return completed;
    };

    const refetchFiner = async () => {
      const callSeq = ++finerFetchSeq;
      const now = Date.now();
      const bucket = bucketStartMs(now, bucketMs);
      formingBucketStartRef.current = bucket;

      if (ladder.length === 0) {
        finerRowsRef.current = {};
        if (token === tokenRef.current) paintForming();
        return;
      }

      try {
        const byInterval: Partial<Record<CandleResolution, NormalizedCandle[]>> = {};
        await Promise.all(
          ladder.map(async (rung) => {
            let rows = await fetchCandles(marketId, rung);
            rows = mapOutcome(rows, binary, selectedOutcome);
            const bucketSec = Math.floor(bucket / 1000);
            const nowSec = Math.floor(now / 1000);
            byInterval[rung] = rows.filter((r) => r.time >= bucketSec && r.time < nowSec);
          })
        );
        if (token !== tokenRef.current || callSeq !== finerFetchSeq) return;
        finerRowsRef.current = byInterval;
        paintForming();
      } catch (err) {
        console.warn("[RealtimeOhlcvChart] finer refetch failed:", err);
      }
    };

    const seedFromLive = () => {
      const price = outcomePrice(
        usePriceStore.getState().prices[marketId],
        selectedOutcome,
        fallbackPrices
      );
      if (price == null) return;
      const tsMs = Date.now();
      const event = priceToEvent(price, tsMs);
      if (!event) return;
      aggregatorRef.current?.ingest({ ...event, id: ++tickSeq });
      paintForming();
    };

    const applyHistory = (fit: boolean) => {
      return loadHistory(fit)
        .then((rows) => {
          if (rows == null) return;
          historyReadyRef.current = true;
          setStatus(rows.length ? "ready" : "empty");
          void refetchFiner();
          seedFromLive();
        })
        .catch((err) => {
          if (token !== tokenRef.current) return;
          console.error("[RealtimeOhlcvChart] history load failed:", err);
          setStatus("error");
        });
    };

    /**
     * On reconnect: reset aggregator then reload history + finer (POC resync).
     * Dedupe-by-id makes replayed ticks safe after reset.
     */
    const resync = async () => {
      if (resyncingRef.current || token !== tokenRef.current) return;
      resyncingRef.current = true;
      try {
        aggregatorRef.current?.reset();
        tickSeq = 0;
        const rows = await loadHistory(false);
        if (rows == null || token !== tokenRef.current) return;
        historyReadyRef.current = true;
        setStatus(rows.length ? "ready" : "empty");
        await refetchFiner();
        seedFromLive();
      } catch (err) {
        console.error("[RealtimeOhlcvChart] resync failed:", err);
      } finally {
        resyncingRef.current = false;
      }
    };

    void applyHistory(true);

    // Websocket price ticks → live aggregator.
    const unsubStore = usePriceStore.subscribe((state, prev) => {
      if (token !== tokenRef.current) return;
      const next = state.prices[marketId];
      const before = prev.prices[marketId];
      if (next === before) return;
      const price = outcomePrice(next, selectedOutcome, fallbackPrices);
      if (price == null) return;
      const aggregator = aggregatorRef.current;
      if (!aggregator) return;

      const tsMs = Date.now();
      const event = priceToEvent(price, tsMs);
      if (!event) return;
      const result = aggregator.ingest({ ...event, id: ++tickSeq });
      if (!result) return;

      // Freeze the just-closed bucket on the chart before composing the new one.
      if (result.sealed) {
        handleRef.current?.updateLive(result.sealed);
      }

      const eventBucket = bucketStartMs(event.tsMs, bucketMs);
      if (eventBucket !== formingBucketStartRef.current) {
        // Boundary crossed: recompose new bucket from finer DB + live tail.
        void refetchFiner();
      } else {
        scheduleFlush();
      }
    });

    // After WS reconnect, soft-resync completed history + finer (no chart remount).
    const unsubReconnect = onPriceStreamReconnect(() => {
      if (token !== tokenRef.current) return;
      void resync();
    });

    // Periodic finer pull so newly-closed blocks fold in (quiet markets too).
    const finerTimer = window.setInterval(() => void refetchFiner(), FINER_REFETCH_MS);

    return () => {
      cancelAnimationFrame(loadingId);
      unsubStore();
      unsubReconnect();
      window.clearInterval(finerTimer);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    binary,
    fallbackPrices,
    marketId,
    paintForming,
    resolution,
    scheduleFlush,
    selectedOutcome,
  ]);

  return (
    <div ref={wrapperRef} className="ohlcv-chart relative">
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 text-center text-xs text-text-dim">
          Loading chart…
        </div>
      ) : null}
      {status === "error" ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 text-center text-xs text-negative">
          Failed to load chart data
        </div>
      ) : null}
      {status === "empty" ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 text-center text-xs text-text-dim">
          {!binary && selectedOutcome > 0
            ? "No candles for this outcome"
            : `No ${resolution} candles`}
        </div>
      ) : null}
      <div ref={containerRef} style={{ height, minHeight: height }} />
    </div>
  );
}
