# P4 — Implementation Report (Local)

**Date:** 2026-10-19  
**Design:** `P4_COVERAGE_DESIGN.md`  
**Scope:** Low-risk coverage fairness + metrics + matchable match-sync sources  
**Not claimed:** Production readiness or measured production-wide coverage improvement

---

## Summary

Implemented the recommended design options without raising the default 150-market stream cap, without fabricating matches/prices, and without DB migrations.

| Change | Purpose |
|--------|---------|
| `priceStreamPlan.ts` + tests | Fair select: watchlist + volume + rotate within cap |
| `priceStream.ts` wiring | Replace pure `updated_at` top-150; log structured coverage |
| `collectMatchableSources` / `filterMatchableSources` | Spend match-sync budget on matchable markets |
| Env `PRICE_STREAM_MARKET_LIMIT` | Optional tune (hard max 400); default **150** |

---

## Files changed

- `backend/.../src/lib/priceStreamPlan.ts` **(new)**
- `backend/.../src/lib/priceStreamPlan.test.ts` **(new)**
- `backend/.../src/workers/priceStream.ts`
- `backend/.../src/services/marketMatching.ts`
- `backend/.../src/lib/marketMatching.test.ts`
- `backend/.../package.json` (`test:price-stream-plan`)
- `P4_COVERAGE_DESIGN.md`, `P4_IMPLEMENTATION_REPORT.md`

---

## Behavior notes

### Stream

- Default page size remains **150** (`DEFAULT_PRICE_STREAM_MARKET_LIMIT`).
- Selection mix mirrors candle-sync quotas (watch ~25%, volume ~35%, rotate remainder).
- Rotate cursor is **in-memory** (resets on restart) — same class of limitation as match-sync / candle-sync cursors.
- Each refresh logs:  
  `[Price Stream][Polymarket|Kalshi] coverage eligible=… selected=… subscribed=… mix(watch=… volume=… rotate=…) recentTicks=…`
- `recentTicks` = distinct markets with a live tick in the last 5 minutes (process-local).
- Poly chunk size 50 / Kalshi 100 and reconnect/ping behavior **unchanged**.

### Matching

- Sync sources now skip unmatchable rows (e.g. `_event_`) while paging volume ranks.
- Logs include `examined_rows` and `skipped_unmatchable`.
- Ambiguity rejection, kind/series/year gates, and null unmatched divergence **unchanged**.
- Does **not** lower the 0.88 threshold or invent twins.

---

## Tests run

| Command | Exit |
|---------|------|
| `npm run test:price-stream-plan` | **0** |
| `npm run test:matching` | **0** |
| `npm run test:unit` | **0** |
| `npx tsc --noEmit` (backend) | **0** |
| `npx tsc --noEmit` (frontend) | **0** |

Skipped: production load test of higher caps; multi-hour fleet coverage %; LIVE match-rate A/B (would require sustained worker observation).

---

## Measurements vs tests

| Kind | What this proves |
|------|------------------|
| Unit tests | Fair selection math; matchable filter preference |
| Structured logs | Operators can observe eligible/selected/recentTicks after restart |
| **Not proven** | That production match rate or tick coverage rose by X% |

To measure locally after restarting the backend:

1. Watch `[Price Stream][…] coverage …` on each 5m refresh.  
2. Watch `[marketMatchSync] … skipped_unmatchable=… matched=…` hourly.  
3. Compare `market_matches` count over time (read-only) — do not invent targets.

---

## Remaining decisions (ops/product)

- Raise `PRICE_STREAM_MARKET_LIMIT` only after staged WS load testing.  
- Demand-driven subscribe (FE → BE) for watched markets beyond the rotate pool.  
- Persist rotation cursors (needs reviewed migration).  
- Client blockers in `AUDIT_OUTSTANDING.md` unchanged.

---

*Local implementation complete for §4 of the design. Not a production certification.*
