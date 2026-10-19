/** Resolutions accepted by GET /api/v1/markets/:id/candles?resolution= */
export const CANDLE_RESOLUTIONS = ["5m", "15m", "1h", "4h", "1d", "1w"] as const;

export type CandleResolution = (typeof CANDLE_RESOLUTIONS)[number];

/** Market chart default resolution. */
export const DEFAULT_CANDLE_RESOLUTION: CandleResolution = "5m";

/** Chart-ready candle. Prices are whatever the API sent (usually 0–1 probability). */
export type NormalizedCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type LinePoint = {
  time: number;
  value: number;
};

/** One outcome series on a multi-line chart. */
export type ChartLineSeries = {
  id: number;
  label: string;
  color: string;
  points: LinePoint[];
};

export const OUTCOME_COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#fb923c",
  "#4ade80",
  "#f472b6",
  "#facc15",
  "#60a5fa",
  "#f87171",
  "#2dd4bf",
  "#c084fc",
  "#38bdf8",
  "#eab308",
] as const;

export function outcomeColor(index: number): string {
  return OUTCOME_COLORS[index % OUTCOME_COLORS.length];
}

/** Line chart time ranges. Default is 1D. */
export const LINE_RANGES = ["1H", "6H", "1D", "1W", "1M", "ALL"] as const;

export type LineRange = (typeof LINE_RANGES)[number];

export const DEFAULT_LINE_RANGE: LineRange = "1D";

export type ChartMode = "line" | "ohlcv";
