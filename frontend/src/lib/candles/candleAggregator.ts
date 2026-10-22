/**
 * Folds realtime ticks into one forming OHLCV bucket.
 * Logic mirrors poc-stock-market `candle-aggregator.ts` (NormalizedCandle shape).
 *
 *   Open   = first event's open in the bucket (first-write-wins)
 *   High   = max of event highs
 *   Low    = min of event lows
 *   Close  = latest event's close
 *   Volume = sum of event volumes
 *
 * Never holds history — only the current bucket — so historical candles are
 * never rewritten. `id` must be monotonic so reconnect replays dedupe cleanly.
 */

import type { NormalizedCandle } from "@/lib/candles/types";

export type CandleEvent = {
  id: number;
  tsMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  mid: number | null;
  volume: number;
};

export type LiveCandle = NormalizedCandle & { mid: number | null };

export type IngestResult = {
  /** Current still-forming candle after applying the event. */
  live: LiveCandle;
  /** Non-null only when this event crossed a bucket boundary. */
  sealed: LiveCandle | null;
};

/** Floor a timestamp to the start of its bucket (UTC epoch math). */
export function bucketStartMs(tsMs: number, bucketMs: number): number {
  return Math.floor(tsMs / bucketMs) * bucketMs;
}

/** Adapt a single price snapshot into a point candle event (O=H=L=C). */
export function priceToEvent(price: number, tsMs: number): CandleEvent | null {
  if (!Number.isFinite(price) || !Number.isFinite(tsMs)) return null;
  return {
    id: tsMs,
    tsMs,
    open: price,
    high: price,
    low: price,
    close: price,
    mid: price,
    volume: 0,
  };
}

export class CandleAggregator {
  private readonly bucketMs: number;
  private live: LiveCandle | null = null;
  private liveBucketStart: number | null = null;
  private lastEventId = Number.NEGATIVE_INFINITY;
  private midSum = 0;
  private midCount = 0;

  constructor(bucketMs: number) {
    this.bucketMs = bucketMs;
  }

  get current(): LiveCandle | null {
    return this.live;
  }

  /** Drop all state so the current bucket rebuilds from scratch (used on resync). */
  reset(): void {
    this.live = null;
    this.liveBucketStart = null;
    this.lastEventId = Number.NEGATIVE_INFINITY;
    this.midSum = 0;
    this.midCount = 0;
  }

  /**
   * Open the current candle from a stored bar for this bucket.
   * Later ticks still fold in: open stays, high/low/close/volume move.
   * lastEventId is cleared so the next live tick is not treated as a replay.
   */
  seed(row: NormalizedCandle): void {
    if (!Number.isFinite(row.time)) return;
    const open = row.open;
    const high = row.high;
    const low = row.low;
    const close = row.close;
    if (![open, high, low, close].every((value) => Number.isFinite(value))) return;

    this.liveBucketStart = row.time * 1000;
    this.lastEventId = Number.NEGATIVE_INFINITY;
    const mid = Number.isFinite(close) ? close : null;
    this.midSum = mid ?? 0;
    this.midCount = mid == null ? 0 : 1;
    this.live = {
      time: Math.floor(row.time),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(row.volume) ? row.volume : 0,
      mid,
    };
  }

  ingest(event: CandleEvent): IngestResult | null {
    // 1. Dedupe / replay guard
    if (event.id <= this.lastEventId) return null;
    this.lastEventId = event.id;

    const bucket = bucketStartMs(event.tsMs, this.bucketMs);

    // 2. First event → open the first candle
    if (this.live == null || this.liveBucketStart == null) {
      this.live = this.startCandle(bucket, event);
      this.liveBucketStart = bucket;
      return { live: this.live, sealed: null };
    }

    // 3. Late / out-of-order for an already-closed bucket → ignore
    if (bucket < this.liveBucketStart) return null;

    // 4. Boundary crossed → seal current, open fresh (idle buckets stay as gaps)
    if (bucket > this.liveBucketStart) {
      const sealed = this.live;
      this.live = this.startCandle(bucket, event);
      this.liveBucketStart = bucket;
      return { live: this.live, sealed };
    }

    // 5. Same bucket → fold in (open is first-write-wins)
    if (event.mid != null && Number.isFinite(event.mid)) {
      this.midSum += event.mid;
      this.midCount += 1;
    }
    this.live = {
      ...this.live,
      high: Math.max(this.live.high ?? event.high, event.high),
      low: Math.min(this.live.low ?? event.low, event.low),
      close: event.close,
      mid: this.midCount ? this.midSum / this.midCount : this.live.mid,
      volume: (this.live.volume ?? 0) + event.volume,
    };
    return { live: this.live, sealed: null };
  }

  private startCandle(bucketStart: number, event: CandleEvent): LiveCandle {
    this.midSum = event.mid != null && Number.isFinite(event.mid) ? event.mid : 0;
    this.midCount = event.mid != null && Number.isFinite(event.mid) ? 1 : 0;
    return {
      time: Math.floor(bucketStart / 1000),
      open: event.open,
      high: event.high,
      low: event.low,
      close: event.close,
      volume: event.volume,
      mid: this.midCount ? this.midSum / this.midCount : null,
    };
  }
}
