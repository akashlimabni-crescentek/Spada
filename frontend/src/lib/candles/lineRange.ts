import type {
  CandleResolution,
  ChartLineSeries,
  LinePoint,
  LineRange,
  NormalizedCandle,
} from "@/lib/candles/types";
import { outcomeColor } from "@/lib/candles/types";

const HOUR = 60 * 60 * 1000;

/** Closest stored resolution for a line range. The API has no 1m candles. */
export function lineRangeToResolution(range: LineRange): CandleResolution {
  switch (range) {
    case "1H":
    case "6H":
    case "1D":
      return "5m";
    case "1W":
      return "1h";
    case "1M":
      return "4h";
    case "ALL":
      return "1d";
  }
}

function lineRangeMs(range: LineRange): number | null {
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
      return 30 * 24 * HOUR;
    case "ALL":
      return null;
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

/**
 * Build multi-outcome line series from the market candles API.
 *
 * History is stored for the primary token only. Binary "No" is derived as 1 − close.
 * Other categorical outcomes start at the latest bar with the current live price.
 */
export function buildOutcomeLineSeries(args: {
  candles: NormalizedCandle[];
  range: LineRange;
  outcomes: string[];
  prices: number[];
  visibleIds: number[];
  binary: boolean;
}): ChartLineSeries[] {
  const primary = linePointsFromCandles(args.candles, args.range);
  const lastTime = primary[primary.length - 1]?.time ?? Math.floor(Date.now() / 1000);

  return args.visibleIds
    .map((id) => {
      const label = args.outcomes[id] ?? `Outcome ${id + 1}`;
      const live = args.prices[id];
      let points: LinePoint[] = [];

      if (id === 0) {
        points = primary;
      } else if (args.binary && id === 1) {
        points = primary.map((point) => ({
          time: point.time,
          value: Number((1 - point.value).toFixed(6)),
        }));
      } else if (Number.isFinite(live)) {
        points = [{ time: lastTime, value: live }];
      }

      if (Number.isFinite(live) && points.length) {
        points = appendTip(points, live, Math.floor(Date.now() / 1000));
      }

      if (!points.length) return null;

      return {
        id,
        label,
        color: outcomeColor(id),
        points,
      };
    })
    .filter((line): line is ChartLineSeries => line != null);
}

function appendTip(points: LinePoint[], price: number, timeSec: number): LinePoint[] {
  const last = points[points.length - 1];
  if (!last) return [{ time: timeSec, value: price }];
  if (timeSec > last.time) return [...points, { time: timeSec, value: price }];
  const next = points.slice();
  next[next.length - 1] = { time: last.time, value: price };
  return next;
}

/** Apply a websocket prices[] tick onto visible outcome lines. */
export function applyLivePricesToLineSeries(
  series: ChartLineSeries[],
  prices: number[],
  timeSec: number
): ChartLineSeries[] {
  return series.map((line) => {
    const price = prices[line.id];
    if (!Number.isFinite(price) || !line.points.length) return line;
    return { ...line, points: appendTip(line.points, price, timeSec) };
  });
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
