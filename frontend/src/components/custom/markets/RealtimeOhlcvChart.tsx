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
  formatCandleRowForLog,
  logCandleRows,
  logCandleRowsByInterval,
} from "@/lib/candles/candleDebug";
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
  resolution: CandleResolution,
  window?: { fromMs: number; toMs: number },
  outcomeIndex = 0
): Promise<NormalizedCandle[]> {
  const base = getApiBaseUrl();
  const params = new URLSearchParams({ resolution });
  if (window) {
    params.set("from", new Date(window.fromMs).toISOString());
    params.set("to", new Date(window.toMs).toISOString());
  }
  // Binary No stays 1 − Yes. Other outcomes have their own token history.
  if (outcomeIndex > 0) params.set("outcome", String(outcomeIndex));
  const url = `${base}/api/v1/markets/${encodeURIComponent(marketId)}/candles?${params.toString()}`;
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

  const fallbackPricesRef = useRef(fallbackPrices);
  fallbackPricesRef.current = fallbackPrices;

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

  const paintForming = useCallback((log = false) => {
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
      log,
    });
    if (!candle) return;
    handle.updateLive(candle);
    if (log) {
      console.log("[candle] chart update (forming candle)", {
        source: "composed",
        interval: cfg.resolution,
        row: formatCandleRowForLog(candle, cfg.resolution),
      });
      console.table([formatCandleRowForLog(candle, cfg.resolution)]);
    }
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
    const token = ++tokenRef.current;
    historyReadyRef.current = false;
    const outcomeIndex = !binary && selectedOutcome > 0 ? selectedOutcome : 0;
    setStatus("loading");

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

    console.log("[candle] chart session start", {
      marketId,
      interval: resolution,
      ladder,
      finerRefetchIntervalMs: FINER_REFETCH_MS,
      refetchTriggers: ["initial", "bucket-roll", "periodic", "resync"],
    });

    const loadHistory = async (fit: boolean) => {
      // Wait for chart create so setHistory is never dropped on a null handle.
      await chartReadyRef.current;
      if (token !== tokenRef.current) return null;

      const aggregateCfg = CLIENT_AGGREGATE_FROM[resolution];
      let rows = await fetchCandles(
        marketId,
        aggregateCfg?.source ?? resolution,
        undefined,
        outcomeIndex
      );
      rows = mapOutcome(rows, binary, selectedOutcome);
      if (aggregateCfg) {
        console.log("[candle] history aggregate", {
          source: "history-table",
          interval: resolution,
          sourceInterval: aggregateCfg.source,
          rowCountBefore: rows.length,
        });
        rows = aggregateCandles(rows, aggregateCfg.aggregateMs);
        console.log("[candle] history aggregate done", {
          source: "history-table",
          interval: resolution,
          rowCountAfter: rows.length,
        });
      }
      // Gap-fill is owned by the backend candle API — do not re-fill here.

      const bucketStart = bucketStartMs(Date.now(), bucketMs);
      const bucketStartSec = Math.floor(bucketStart / 1000);
      // Forming bucket is owned by composition — strip from immutable history.
      const completed = stripFormingBucket(rows, bucketStartSec);
      const droppedForming = rows.filter((row) => row.time >= bucketStartSec);
      console.log("[candle] history → chart split", {
        source: "history-table",
        interval: resolution,
        sourceInterval: aggregateCfg?.source ?? resolution,
        totalFromDb: rows.length,
        completedToChart: completed.length,
        droppedFormingBucket: droppedForming.length,
        formingBucketStart: new Date(bucketStart).toISOString(),
        note: "Dropped rows belong to the forming bucket — rebuilt via stored finer bars + realtime",
      });
      logCandleRows("[candle] history → chart (completed rows)", completed, {
        source: "history-table",
        interval: resolution,
        role: "setHistory",
      }, resolution);
      if (droppedForming.length > 0) {
        logCandleRows("[candle] history → dropped (forming bucket rows)", droppedForming, {
          source: "history-table",
          interval: resolution,
          role: "excluded-from-setHistory",
        }, resolution);
      }

      if (token !== tokenRef.current) return null;
      handleRef.current?.setHistory(completed, { fit });
      return completed;
    };

    const refetchFiner = async (reason: string) => {
      const callSeq = ++finerFetchSeq;
      const now = Date.now();
      const bucket = bucketStartMs(now, bucketMs);
      formingBucketStartRef.current = bucket;
      console.log("[candle] refetchFiner called", {
        reason,
        callSeq,
        interval: resolution,
        marketId,
        bucketStart: new Date(bucket).toISOString(),
        ladder,
        whyMultipleCalls:
          "initial=after history load; bucket-roll=new bucket from WS tick; periodic=every 15s; resync=after reconnect",
      });

      if (ladder.length === 0) {
        finerRowsRef.current = {};
        console.log("[candle] refetchFiner skipped DB — no finer ladder for interval", {
          reason,
          callSeq,
          interval: resolution,
        });
        if (token === tokenRef.current) paintForming(true);
        return;
      }

      try {
        const byInterval: Partial<Record<CandleResolution, NormalizedCandle[]>> = {};
        await Promise.all(
          ladder.map(async (rung) => {
            let rows = await fetchCandles(marketId, rung, { fromMs: bucket, toMs: now }, outcomeIndex);
            rows = mapOutcome(rows, binary, selectedOutcome);
            const bucketSec = Math.floor(bucket / 1000);
            const nowSec = Math.floor(now / 1000);
            byInterval[rung] = rows.filter((r) => r.time >= bucketSec && r.time <= nowSec);
          })
        );
        if (token !== tokenRef.current || callSeq !== finerFetchSeq) return;
        finerRowsRef.current = byInterval;
        const liveTail = aggregatorRef.current?.current ?? null;
        console.log("[candle] refetchFiner done — forming candle inputs", {
          reason,
          callSeq,
          interval: resolution,
          bucketStart: new Date(bucket).toISOString(),
        });
        logCandleRowsByInterval("[candle] refetchFiner — history-table rows", byInterval, {
          source: "history-table",
          reason,
          callSeq,
        });
        if (liveTail) {
          console.log("[candle] refetchFiner — realtime live tail", {
            source: "realtime-ws",
            reason,
            callSeq,
            row: formatCandleRowForLog(liveTail, resolution),
          });
          console.table([formatCandleRowForLog(liveTail, resolution)]);
        } else {
          console.log("[candle] refetchFiner — realtime live tail", {
            source: "realtime-ws",
            reason,
            callSeq,
            row: null,
            note: "No websocket ticks ingested yet for this bucket",
          });
        }
        paintForming(true);
      } catch (err) {
        console.error("[candle] refetchFiner failed:", { reason, callSeq, err });
      }
    };

    const seedFromLive = () => {
      const price = outcomePrice(
        usePriceStore.getState().prices[marketId],
        selectedOutcome,
        fallbackPricesRef.current
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
          void refetchFiner("initial");
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
        await refetchFiner("resync");
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
      const price = outcomePrice(next, selectedOutcome, fallbackPricesRef.current);
      if (price == null) return;
      const aggregator = aggregatorRef.current;
      if (!aggregator) return;

      const tsMs = Date.now();
      const event = priceToEvent(price, tsMs);
      if (!event) return;
      const result = aggregator.ingest({ ...event, id: ++tickSeq });
      if (!result) return;

      console.log("[candle] realtime tick ingested", {
        source: "realtime-ws",
        interval: resolution,
        event: {
          id: event.id,
          ts: new Date(event.tsMs).toISOString(),
          o: event.open,
          h: event.high,
          l: event.low,
          c: event.close,
          v: event.volume,
        },
        aggregatorLive: result.live ? formatCandleRowForLog(result.live, resolution) : null,
      });

      // Boundary crossed: keep the last composed bar frozen. Refetch finer
      // blocks for the new bucket and recompose from scratch.
      const eventBucket = bucketStartMs(event.tsMs, bucketMs);
      if (eventBucket !== formingBucketStartRef.current) {
        console.log("[candle] bucket roll → will refetchFiner", {
          source: "realtime-ws",
          interval: resolution,
          prevBucket:
            formingBucketStartRef.current != null
              ? new Date(formingBucketStartRef.current).toISOString()
              : null,
          newBucket: new Date(eventBucket).toISOString(),
        });
        void refetchFiner("bucket-roll");
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
    const finerTimer = window.setInterval(() => void refetchFiner("periodic"), FINER_REFETCH_MS);

    return () => {
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
