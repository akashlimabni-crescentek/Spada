import type { NormalizedCandle } from "@/lib/candles/types";

/**
 * Maps the candles API into the chart format.
 *
 * The live backend currently returns:
 * `{ candles: [{ ticker, bucket, open, high, low, close, volume }] }`
 * with `bucket` as an ISO timestamp and prices as 0–1 probabilities.
 *
 * Also accepts alternate row shapes (`ts`) and short keys (`t`, `o`, `h`, `l`, `c`, `v`)
 * so a resolution-aware response can land without UI changes.
 */
const LIST_KEYS = ["candles", "data", "rows", "ohlcv"] as const;
const TIME_KEYS = ["ts", "bucket", "timestamp", "time", "t", "date"] as const;
const OPEN_KEYS = ["open", "o"] as const;
const HIGH_KEYS = ["high", "h"] as const;
const LOW_KEYS = ["low", "l"] as const;
const CLOSE_KEYS = ["close", "c"] as const;
const VOLUME_KEYS = ["volume", "v", "vol"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return [];
  for (const key of LIST_KEYS) {
    const value = body[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function readNumber(row: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function readTime(row: Record<string, unknown>): number | null {
  for (const key of TIME_KEYS) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return toUnixSeconds(value);
    }
    if (typeof value === "string" && value.trim() !== "") {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && value.trim() !== "" && !value.includes("-") && !value.includes(":")) {
        return toUnixSeconds(numeric);
      }
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
    }
  }
  return null;
}

function toUnixSeconds(value: number): number {
  if (value > 1e12) return Math.floor(value / 1000);
  return Math.floor(value);
}

export function normalizeCandles(body: unknown): NormalizedCandle[] {
  const byTime = new Map<number, NormalizedCandle>();

  for (const entry of readList(body)) {
    if (!isRecord(entry)) continue;

    const time = readTime(entry);
    const open = readNumber(entry, OPEN_KEYS);
    const highRaw = readNumber(entry, HIGH_KEYS);
    const lowRaw = readNumber(entry, LOW_KEYS);
    const close = readNumber(entry, CLOSE_KEYS);
    if (time == null || open == null || close == null || highRaw == null || lowRaw == null) {
      continue;
    }

    const high = Math.max(open, close, highRaw);
    const low = Math.min(open, close, lowRaw);
    const volume = Math.max(0, readNumber(entry, VOLUME_KEYS) ?? 0);

    byTime.set(time, { time, open, high, low, close, volume });
  }

  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

export function candlesLookLikeProbability(rows: NormalizedCandle[]): boolean {
  if (rows.length === 0) return true;
  return rows.every((row) => row.low >= 0 && row.high <= 1.5);
}
