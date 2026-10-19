/**
 * Client-side rollup of finer candles into larger buckets
 * (same rules as poc-stock-market `candle-aggregate.ts`).
 *
 * Open  = first bar's open in the bucket (first-write-wins)
 * High  = max high
 * Low   = min low
 * Close = last bar's close
 * Volume = sum
 */

import type { NormalizedCandle } from "@/lib/candles/types";

export function aggregateCandles(
  rows: NormalizedCandle[],
  bucketMs: number
): NormalizedCandle[] {
  if (!rows.length || bucketMs <= 0) return [];

  const buckets = new Map<number, NormalizedCandle>();

  for (const row of rows) {
    if (!Number.isFinite(row.close) || !Number.isFinite(row.time)) continue;

    const tsMs = row.time * 1000;
    const bucketStart = Math.floor(tsMs / bucketMs) * bucketMs;
    const existing = buckets.get(bucketStart);

    if (!existing) {
      buckets.set(bucketStart, {
        time: Math.floor(bucketStart / 1000),
        open: Number.isFinite(row.open) ? row.open : row.close,
        high: Number.isFinite(row.high) ? row.high : row.close,
        low: Number.isFinite(row.low) ? row.low : row.close,
        close: row.close,
        volume: row.volume ?? 0,
      });
      continue;
    }

    existing.high = Math.max(existing.high, row.high ?? row.close);
    existing.low = Math.min(existing.low, row.low ?? row.close);
    existing.close = row.close;
    existing.volume = (existing.volume ?? 0) + (row.volume ?? 0);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([, candle]) => candle);
}
