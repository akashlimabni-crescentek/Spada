# Spada persistence tables (repository evidence)

This document describes **orderbook and OHLC / price-history persistence** as implemented in the local Spada backend code. It does **not** invent SQL migrations or claim production DDL.

**Evidence sources:** `backend/Spada_Backend/fastify-backend/src/lib/orderbookPersist.ts`, `src/services/orderbookStore.ts`, `src/services/candleAggregator.ts`, `src/workers/candleSync.ts`.

**No SQL migration files** for these tables were found in the repository (search for `*.sql` / migration folders under the workspace). Schema details below are therefore limited to columns and conflict targets **referenced by application code**.

**Read-only local/dev probe (P2):** With the already-configured local backend env, head selects confirmed these tables are reachable: `polymarket_orderbook`, `kalshi_orderbook`, `polymarket_ohlc`, `kalshi_ohlc`, `polymarket_price_history`, `kalshi_price_history`. That confirms **existence**, not column types, indexes, or constraints. No credentials or connection strings are recorded here.

Legend:
- **Verified in code** — column/table/conflict key appears in select/upsert/build helpers.
- **Inferred** — implied by upsert `onConflict` or comments; not proven by a migration.
- **Unknown** — requires live DB introspection (`information_schema` / `\d`).

---

## 1. Orderbook tables

### `polymarket_orderbook`

| Item | Status | Detail |
|------|--------|--------|
| Purpose | Verified | Latest Polymarket CLOB book snapshot for a Gamma market id |
| Upsert conflict | Verified | `onConflict: 'market_id'` (`orderbookStore.ts`) |
| PK / uniqueness | Inferred | Code comments call `market_id` the PK; **not confirmed by DDL in-repo** |
| Columns written | Verified | `market_id`, `yes_token_id`, `no_token_id`, `yes_bids`, `no_bids`, `last_snapshot`, `updated_at` |
| Ladder shape | Verified | `yes_bids` / `no_bids`: `[{ price, qty }, ...]` |
| Persist behavior | Verified | Latest-wins queue; skip no-op via ladder fingerprint; late older writes re-applied to newest snapshot |

`market_id` resolution (verified): prefers numeric Gamma id from `markets.raw_data` (`id` / `market_id` / `marketId`), not `0x` condition ids (`resolvePolymarketOrderbookMarketId`).

### `kalshi_orderbook`

| Item | Status | Detail |
|------|--------|--------|
| Purpose | Verified | Latest Kalshi book snapshot keyed by ticker |
| Upsert conflict | Verified | `onConflict: 'ticker'` |
| PK / uniqueness | Inferred | Comments say PK is `ticker`; **not confirmed by DDL in-repo** |
| Columns written | Verified | `ticker`, `yes_bids`, `no_bids`, `last_snapshot`, `updated_at` |

**Indexes:** unknown (conflict targets do not prove index existence beyond what Supabase/Postgres requires for `ON CONFLICT`).

**Retention:** unknown — no TTL/cleanup worker found for these tables.

---

## 2. OHLC / candle tables

Worker note (verified, `candleSync.ts` / `candleAggregator.ts`):

- Upserts **1m** into `polymarket_ohlc` / `kalshi_ohlc`
- Upserts **5m…1w** into `polymarket_price_history` / `kalshi_price_history`
- Base stored interval constant: `BASE_OHLC_INTERVAL = '1m'`

### `polymarket_ohlc`

| Item | Status | Detail |
|------|--------|--------|
| Purpose | Verified | Base 1-minute OHLC for Polymarket CLOB token |
| Upsert conflict | Verified | `onConflict: 'token_id,ts,interval'` |
| Columns written | Verified | `token_id`, `ts`, `open`, `high`, `low`, `close`, `volume`, `interval`, `trade_count` |
| Columns read (finer) | Verified | `ts, open, high, low, close, volume` filtered by `token_id`, `interval` |

### `kalshi_ohlc`

| Item | Status | Detail |
|------|--------|--------|
| Purpose | Verified | Base 1-minute OHLC for Kalshi ticker |
| Upsert conflict | Verified | `onConflict: 'ticker,ts,interval'` |
| Columns written | Verified | `ticker`, `ts`, `open`, `high`, `low`, `close`, `volume`, `interval`, `trade_count` |

### `polymarket_price_history` / `kalshi_price_history`

| Item | Status | Detail |
|------|--------|--------|
| Purpose | Verified | Coarser resolutions (`5m`, `15m`, `1h`, `4h`, `1d`, `1w`) rolled from 1m / sync |
| Upsert conflict | Verified | Polymarket: `token_id,ts,interval`; Kalshi: `ticker,ts,interval` |
| Columns read | Verified | `ts, open, high, low, close, volume` (+ interval filter) |

Volume-preserving upsert behavior exists in aggregator helpers (verified in code comments/logic): avoid wiping pre-existing non-zero volume with zeros where implemented.

### Related read paths

| Object | Status | Detail |
|--------|--------|--------|
| RPC `get_candles` | Verified (call site) | `supabaseAdmin.rpc('get_candles', { p_ticker, … })` — **argument list / SQL body not in-repo** |
| View `ohlcv_1h_view` | Verified (select) | Used as a fallback read path — **definition not in-repo** |

---

## 3. Timestamp and resolution conventions

| Topic | Status | Detail |
|-------|--------|--------|
| Bucket timestamps | Verified | Stored/returned as ISO strings from `Date(...).toISOString()` |
| Bucket alignment | Verified | `bucketStartMs = Math.floor(tsMs / bucketMs) * bucketMs` (Unix-epoch aligned) |
| `1w` duration | Verified | `7 * 24 * 60 * 60 * 1000` ms — **not** ISO calendar-week Monday boundaries |
| Chart trim | Verified | Chart path may trim to `MAX_CANDLES` (see aggregator); sync path can bypass trim |

Practical difference for weekly candles: epoch-aligned 7-day windows start at Unix epoch multiples, so week boundaries generally **do not** match ISO weeks (Monday 00:00 local/UTC calendar weeks).

---

## 4. Other related tables (out of OHLC scope but used nearby)

| Table | Conflict / key (code) | Notes |
|-------|----------------------|-------|
| `markets` | `onConflict: 'canonical_id'` | Market catalogue |
| `market_matches` | upserts on `pm_platform_id` (and related insert paths) | Cross-platform twins |
| `watchlist` | read for candle-sync priority | Not OHLC storage |

---

## 5. What requires local DB inspection

Run **read-only** against a **local/dev** database only (never production). Do not paste connection strings or keys into tickets.

Suggested checks (operator-run):

```sql
-- Example only — run in your own SQL console against local/dev
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'polymarket_orderbook','kalshi_orderbook',
    'polymarket_ohlc','kalshi_ohlc',
    'polymarket_price_history','kalshi_price_history'
  );

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'polymarket_orderbook','kalshi_orderbook',
    'polymarket_ohlc','kalshi_ohlc',
    'polymarket_price_history','kalshi_price_history'
  )
ORDER BY table_name, ordinal_position;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'polymarket_orderbook','kalshi_orderbook',
    'polymarket_ohlc','kalshi_ohlc',
    'polymarket_price_history','kalshi_price_history'
  );
```

Also confirm: RPC `get_candles` definition; view `ohlcv_1h_view` definition; any retention policies / RLS.

---

## 6. Migrations

**Status:** Missing from this repository.  
**Proposal:** Do **not** invent migrations here. After local DB introspection, the client/team should add reviewed SQL migrations that match the live schema (or generate them from Supabase). Until then, treat uniques/indexes beyond upsert conflict targets as **unknown**.

No database changes were applied as part of writing this document.
