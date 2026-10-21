import type { NormalizedCandle } from "@/lib/candles/types";

/** Compact OHLCV row for console inspection. Same columns as the POC logger. */
export function formatCandleRowForLog(
  row: NormalizedCandle,
  interval?: string
) {
  return {
    ts: new Date(row.time * 1000).toISOString(),
    interval: interval ?? "",
    o: row.open,
    h: row.high,
    l: row.low,
    c: row.close,
    v: row.volume,
  };
}

/**
 * Log a metadata line plus the full row list. Uses console.table when non-empty
 * so rows are easy to scan in DevTools.
 */
export function logCandleRows(
  label: string,
  rows: NormalizedCandle[],
  meta: Record<string, unknown> = {},
  interval?: string
): void {
  const formatted = rows.map((row) => formatCandleRowForLog(row, interval));
  console.log(label, { ...meta, rowCount: rows.length, rows: formatted });
  if (formatted.length > 0) {
    console.table(formatted);
  }
}

/** Log finer-bucket rows grouped by stored interval. */
export function logCandleRowsByInterval(
  label: string,
  byInterval: Partial<Record<string, NormalizedCandle[]>>,
  meta: Record<string, unknown> = {}
): void {
  const summary = Object.fromEntries(
    Object.entries(byInterval).map(([iv, rows]) => [iv, rows?.length ?? 0])
  );
  console.log(label, { ...meta, rowCounts: summary });
  for (const [iv, rows] of Object.entries(byInterval)) {
    if (!rows?.length) continue;
    const formatted = rows.map((row) => formatCandleRowForLog(row, iv));
    console.log(`${label} [${iv}]`, formatted);
    console.table(formatted);
  }
}
