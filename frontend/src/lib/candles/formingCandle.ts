/**
 * Forming-candle composer + sub-interval ladder for the open chart bucket.
 */

import { bucketStartMs, type LiveCandle } from "@/lib/candles/candleAggregator";
import type { CandleResolution, NormalizedCandle } from "@/lib/candles/types";

export { bucketStartMs };

export const GAP_FILL_CAP = 36;

export const RESOLUTION_MS: Record<CandleResolution, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

/**
 * Coarsest → finest stored intervals inside the current forming bucket.
 * 5m has no finer rung (live aggregator covers it).
 */
export const SUB_INTERVAL_LADDER: Record<CandleResolution, CandleResolution[]> = {
  "5m": [],
  "15m": ["5m"],
  "1h": ["15m", "5m"],
  "4h": ["1h", "15m", "5m"],
  "1d": ["4h", "1h", "15m", "5m"],
  "1w": ["1d", "4h", "1h", "15m", "5m"],
};

export type FormingPiece = {
  src: string;
  fromMs: number;
  toMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ComposeResult = {
  candle: LiveCandle | null;
  pieces: FormingPiece[];
};

export function stripFormingBucket(
  candles: NormalizedCandle[],
  formingBucketStartSec: number
): NormalizedCandle[] {
  return candles.filter((c) => c.time < formingBucketStartSec);
}

export function computeGapFills(
  lastBucketMs: number,
  currentBucketMs: number,
  lastClose: number,
  stepMs: number,
  cap = GAP_FILL_CAP
): NormalizedCandle[] {
  if (stepMs <= 0 || !Number.isFinite(lastClose)) return [];
  const last = bucketStartMs(lastBucketMs, stepMs);
  const current = bucketStartMs(currentBucketMs, stepMs);
  const fills: NormalizedCandle[] = [];
  let next = last + stepMs;
  while (next < current) {
    fills.push({
      time: Math.floor(next / 1000),
      open: lastClose,
      high: lastClose,
      low: lastClose,
      close: lastClose,
      volume: 0,
    });
    next += stepMs;
  }
  if (fills.length > cap) return fills.slice(-cap);
  return fills;
}

export function fillCandleGaps(
  candles: NormalizedCandle[],
  stepMs: number,
  untilMs?: number
): NormalizedCandle[] {
  if (!candles.length || stepMs <= 0) return candles;
  const ordered = [...candles].sort((a, b) => a.time - b.time);
  const out: NormalizedCandle[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i];
    out.push(cur);
    const nextTimeSec = ordered[i + 1]?.time;
    const nextMs =
      nextTimeSec != null
        ? nextTimeSec * 1000
        : untilMs != null
          ? bucketStartMs(untilMs, stepMs)
          : null;
    if (nextMs == null) continue;
    out.push(...computeGapFills(cur.time * 1000, nextMs, cur.close, stepMs));
  }
  return out;
}

/** Index rows by bucket-start epoch (ms), keeping the newest per bucket. */
function indexByBucketStart(
  rows: NormalizedCandle[],
  stepMs: number
): Map<number, NormalizedCandle> {
  const byStart = new Map<number, NormalizedCandle>();
  for (const row of rows) {
    if (
      !Number.isFinite(row.open) ||
      !Number.isFinite(row.high) ||
      !Number.isFinite(row.low) ||
      !Number.isFinite(row.close) ||
      !Number.isFinite(row.time)
    ) {
      continue;
    }
    byStart.set(bucketStartMs(row.time * 1000, stepMs), row);
  }
  return byStart;
}

/**
 * Reconstruct the current still-forming candle from finer bars + live tail.
 */
export function buildFormingCandle(params: {
  interval: CandleResolution;
  bucketStartMs: number;
  nowMs: number;
  ladder?: CandleResolution[];
  finerRowsByInterval: Partial<Record<CandleResolution, NormalizedCandle[]>>;
  liveTail: LiveCandle | null;
  /** Set false to silence the `[candle] compose` log (hot per-frame path). */
  log?: boolean;
}): ComposeResult {
  const {
    interval,
    bucketStartMs: bucketStart,
    nowMs,
    finerRowsByInterval,
    liveTail,
  } = params;
  const shouldLog = params.log === true;
  const ladder = params.ladder ?? SUB_INTERVAL_LADDER[interval];
  const pieces: FormingPiece[] = [];
  let cursor = bucketStart;

  for (const rung of ladder) {
    const stepMs = RESOLUTION_MS[rung];
    const byStart = indexByBucketStart(finerRowsByInterval[rung] ?? [], stepMs);
    while (cursor + stepMs <= nowMs) {
      const row = byStart.get(cursor);
      if (!row) break;
      pieces.push({
        src: `db:${rung}`,
        fromMs: cursor,
        toMs: cursor + stepMs,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume ?? 0,
      });
      cursor += stepMs;
    }
  }

  if (liveTail && liveTail.close != null && Number.isFinite(liveTail.close) && cursor < nowMs) {
    const tailFrom = Math.max(cursor, liveTail.time * 1000);
    pieces.push({
      src: "live",
      fromMs: tailFrom,
      toMs: nowMs,
      open: Number(liveTail.open ?? liveTail.close),
      high: Number(liveTail.high ?? liveTail.close),
      low: Number(liveTail.low ?? liveTail.close),
      close: Number(liveTail.close),
      volume: Number(liveTail.volume ?? 0),
    });
  }

  if (pieces.length === 0) {
    if (shouldLog) {
      console.log("[candle] compose forming candle", {
        interval,
        bucketStart: new Date(bucketStart).toISOString(),
        now: new Date(nowMs).toISOString(),
        result: "no pieces — forming candle empty",
        sources: { historyTable: [], realtime: [] },
      });
    }
    return { candle: null, pieces };
  }

  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  let high = first.high;
  let low = first.low;
  let volume = 0;
  for (const p of pieces) {
    high = Math.max(high, p.high);
    low = Math.min(low, p.low);
    volume += p.volume;
  }

  const candle: LiveCandle = {
    time: Math.floor(bucketStart / 1000),
    open: first.open,
    high,
    low,
    close: last.close,
    volume,
    mid: liveTail?.mid ?? null,
  };

  if (shouldLog) {
    const dbPieces = pieces.filter((p) => p.src.startsWith("db:"));
    const livePieces = pieces.filter((p) => p.src === "live");
    const dbRows = dbPieces.map((p) => ({
      src: p.src,
      from: new Date(p.fromMs).toISOString(),
      to: new Date(p.toMs).toISOString(),
      o: p.open,
      h: p.high,
      l: p.low,
      c: p.close,
      v: p.volume,
    }));
    const liveRows = livePieces.map((p) => ({
      from: new Date(p.fromMs).toISOString(),
      to: new Date(p.toMs).toISOString(),
      o: p.open,
      h: p.high,
      l: p.low,
      c: p.close,
      v: p.volume,
    }));
    console.log("[candle] compose forming candle", {
      interval,
      bucketStart: new Date(bucketStart).toISOString(),
      now: new Date(nowMs).toISOString(),
      ladder,
      merged: { o: candle.open, h: candle.high, l: candle.low, c: candle.close, v: candle.volume },
    });
    if (dbRows.length > 0) {
      console.log("[candle] compose — history-table pieces", dbRows);
      console.table(dbRows);
    }
    if (liveRows.length > 0) {
      console.log("[candle] compose — realtime pieces", liveRows);
      console.table(liveRows);
    }
  }

  return { candle, pieces };
}
