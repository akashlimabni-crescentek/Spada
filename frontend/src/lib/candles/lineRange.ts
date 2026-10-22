import type {
  CandleResolution,
  ChartLineSeries,
  LinePoint,
  LineRange,
  NormalizedCandle,
} from "@/lib/candles/types";
import { outcomeColor } from "@/lib/candles/types";

const HOUR = 60 * 60 * 1000;

/** Line source interval. 1m is stored history only; it is not an OHLCV resolution. */
export type LineResolution = CandleResolution | "1m";

const DAY = 24 * HOUR;
/** POC ALL lookback. */
const LINE_ALL_LOOKBACK_MS = 90 * DAY;

/**
 * Same source intervals as the POC line chart.
 * 1H and 6H use 1-minute closes, 1D uses 5-minute closes,
 * and 1W, 1M, and ALL use hourly closes.
 */
export function lineRangeToResolution(range: LineRange): LineResolution {
  switch (range) {
    case "1H":
    case "6H":
      return "1m";
    case "1D":
      return "5m";
    case "1W":
    case "1M":
    case "ALL":
      return "1h";
  }
}

/** Inclusive window for a line range. ALL is the last 90 days, matching the POC. */
export function lineRangeToWindow(range: LineRange): { from: string; to: string } {
  const to = Date.now();
  const ms = range === "ALL" ? LINE_ALL_LOOKBACK_MS : lineRangeMs(range);
  return {
    from: new Date(to - ms).toISOString(),
    to: new Date(to).toISOString(),
  };
}

function lineRangeMs(range: LineRange): number {
  switch (range) {
    case "1H":
      return HOUR;
    case "6H":
      return 6 * HOUR;
    case "1D":
      return 24 * HOUR;
    case "1W":
      return 7 * 24 * HOUR;
    case "1M":
      return 30 * DAY;
    case "ALL":
      return LINE_ALL_LOOKBACK_MS;
  }
}

export function linePointsFromCandles(candles: NormalizedCandle[], range: LineRange): LinePoint[] {
  const windowMs = lineRangeMs(range);
  const cutoff = windowMs == null ? null : Math.floor((Date.now() - windowMs) / 1000);
  const points: LinePoint[] = [];

  for (const candle of candles) {
    if (cutoff != null && candle.time < cutoff) continue;
    points.push({ time: candle.time, value: candle.close });
  }

  return points;
}

function validProb(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * That outcome's socket price. Same role as the POC last_price for one market.
 * Binary No uses 1 − YES only when the socket did not send a No price.
 */
export function linePriceForOutcome(
  prices: number[] | undefined,
  outcomeId: number,
  binary: boolean
): number | null {
  if (!prices?.length) return null;
  const value = prices[outcomeId];
  if (validProb(value)) return value;
  if (binary && outcomeId === 1 && validProb(prices[0])) {
    return Number((1 - prices[0]).toFixed(6));
  }
  return null;
}

/**
 * One close series per visible outcome.
 * Each outcome uses its own stored closes. Binary No is 1 − YES only when
 * that outcome has no candle rows of its own.
 */
export function buildOutcomeLineSeries(args: {
  candlesByOutcome: ReadonlyMap<number, NormalizedCandle[]>;
  range: LineRange;
  outcomes: string[];
  visibleIds: number[];
  binary: boolean;
}): ChartLineSeries[] {
  const primary = linePointsFromCandles(args.candlesByOutcome.get(0) ?? [], args.range);

  return args.visibleIds
    .map((id) => {
      let points = linePointsFromCandles(args.candlesByOutcome.get(id) ?? [], args.range);
      if (!points.length && args.binary && id === 1) {
        points = primary.map((point) => ({
          time: point.time,
          value: Number((1 - point.value).toFixed(6)),
        }));
      }
      if (!points.length) return null;
      return {
        id,
        label: args.outcomes[id] ?? `Outcome ${id + 1}`,
        color: outcomeColor(id),
        points,
      };
    })
    .filter((line): line is ChartLineSeries => line != null);
}

function appendTip(points: LinePoint[], price: number, timeSec: number): LinePoint[] {
  const last = points[points.length - 1];
  if (!last) return [{ time: timeSec, value: price }];
  // POC: a newer price timestamp extends the line, even when the price is unchanged.
  // The same timestamp rewrites the tip value.
  if (timeSec > last.time) return [...points, { time: timeSec, value: price }];
  if (last.value === price) return points;
  const next = points.slice();
  next[next.length - 1] = { time: last.time, value: price };
  return next;
}

/** Move the right edge to the latest socket price. Unchanged prices stay put. */
export function applyLivePricesToLineSeries(
  series: ChartLineSeries[],
  prices: number[],
  timeSec: number,
  binary: boolean
): ChartLineSeries[] {
  let changed = false;
  const next = series.map((line) => {
    const price = linePriceForOutcome(prices, line.id, binary);
    if (price == null || !line.points.length) return line;
    const points = appendTip(line.points, price, timeSec);
    if (points === line.points) return line;
    changed = true;
    return { ...line, points };
  });
  return changed ? next : series;
}

/** Invert primary candles for binary No OHLCV. */
export function invertCandles(candles: NormalizedCandle[]): NormalizedCandle[] {
  return candles.map((candle) => ({
    ...candle,
    open: Number((1 - candle.open).toFixed(6)),
    high: Number((1 - candle.low).toFixed(6)),
    low: Number((1 - candle.high).toFixed(6)),
    close: Number((1 - candle.close).toFixed(6)),
  }));
}
