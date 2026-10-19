import {
  GAP_FILL_CAP,
  RESOLUTION_MS,
  bucketStartMs,
  computeGapFills,
} from "@/lib/candles/formingCandle";
import type { CandleResolution, LinePoint, NormalizedCandle } from "@/lib/candles/types";

export function resolutionMs(resolution: CandleResolution): number {
  return RESOLUTION_MS[resolution];
}

/** Append or update the line's right edge from a websocket price. */
export function appendLiveLinePoint(points: LinePoint[], price: number, timeSec: number): LinePoint[] {
  if (!points.length || !Number.isFinite(price) || !Number.isFinite(timeSec)) return points;

  const last = points[points.length - 1];
  if (timeSec > last.time) {
    return [...points, { time: timeSec, value: price }];
  }

  const next = points.slice();
  next[next.length - 1] = { time: last.time, value: price };
  return next;
}

/**
 * Fold a websocket price into the current OHLCV bucket.
 * When the tick crosses into a new bucket, insert carry-forward flat bars for any
 * skipped quiet intervals so the chart stays continuous.
 */
export function foldLiveCandle(
  candles: NormalizedCandle[],
  price: number,
  tsMs: number,
  bucketMs: number
): NormalizedCandle[] {
  if (!candles.length || !Number.isFinite(price) || !Number.isFinite(tsMs) || bucketMs <= 0) {
    return candles;
  }

  const bucket = bucketStartMs(tsMs, bucketMs);
  const last = candles[candles.length - 1];
  const lastBucket = bucketStartMs(last.time * 1000, bucketMs);

  if (bucket < lastBucket) return candles;

  if (bucket > lastBucket) {
    const fills = computeGapFills(lastBucket, bucket, last.close, bucketMs, GAP_FILL_CAP);
    return [
      ...candles,
      ...fills,
      {
        time: Math.floor(bucket / 1000),
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      },
    ];
  }

  const next = candles.slice();
  next[next.length - 1] = {
    ...last,
    close: price,
    high: Math.max(last.high, price),
    low: Math.min(last.low, price),
  };
  return next;
}
