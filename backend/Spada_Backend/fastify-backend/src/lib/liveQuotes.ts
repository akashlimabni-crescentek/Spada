export interface LiveQuoteRecord {
  prices: number[];
  sourceTs: number | null;
  receivedAt: number;
}

/**
 * A live quote record older than this is treated as absent.
 * Prevents stale socket ticks from a previous session blocking divergence via
 * the freshness gate (sourceTs from days ago >> DEFAULT_MAX_QUOTE_AGE_MS).
 */
export const LIVE_QUOTE_TTL_MS = 5 * 60_000; // 5 minutes

/** Latest price record pushed on the live socket, so a new subscriber gets it immediately. */
const quotes = new Map<string, LiveQuoteRecord>();

export function rememberLiveQuote(
  canonicalId: string,
  prices: number[],
  sourceTs?: number | null
): void {
  const existing = quotes.get(canonicalId);
  const validSourceTs =
    sourceTs != null && Number.isFinite(sourceTs)
      ? sourceTs
      : (existing?.sourceTs ?? null);
  quotes.set(canonicalId, {
    prices: [...prices],
    sourceTs: validSourceTs,
    receivedAt: Date.now(),
  });
}

export function readLiveQuote(canonicalId: string, nowMs = Date.now()): number[] | undefined {
  const rec = quotes.get(canonicalId);
  if (!rec) return undefined;
  if (nowMs - rec.receivedAt > LIVE_QUOTE_TTL_MS) return undefined;
  return [...rec.prices];
}

export function readLiveQuoteRecord(canonicalId: string, nowMs = Date.now()): LiveQuoteRecord | undefined {
  const rec = quotes.get(canonicalId);
  if (!rec) return undefined;
  if (nowMs - rec.receivedAt > LIVE_QUOTE_TTL_MS) return undefined;
  return {
    prices: [...rec.prices],
    sourceTs: rec.sourceTs,
    receivedAt: rec.receivedAt,
  };
}
