# P4 — Live Data Coverage & Cross-Venue Matching Design

**Date:** 2026-10-19  
**Phase:** Design (evidence-based). Implementation only for low-risk items listed in §6.  
**Constraint:** No fabricated prices/matches/ratios; do not blindly raise subscription limits; no auth weakening; no weekly-bucket change; no unreviewed migrations.

Inputs: `P3_READINESS_REPORT.md`, `LOCAL_READINESS_REPORT.md`, `AUDIT_OUTSTANDING.md`, `PERSISTENCE.md`, current `priceStream.ts` / `marketMatching.ts` / `candleSyncPlan.ts`.

---

## 1. Baseline — live price stream

### Pipeline (both venues)

```
markets (active) → select ≤N → map tokens/tickers → venue WS subscribe (chunked)
  → parse mid/trade → broadcastPriceUpdate + candleAggregator.ingestLiveTick
  → periodic DB price write (batched)
```

| Constant (code) | Value | Role |
|-----------------|-------|------|
| Market select limit | **150** / venue | Hard `.limit(150)` in `loadActivePolymarketMarkets` / `loadActiveKalshiTickers` |
| Order | `updated_at DESC` | Always newest-updated markets |
| Poly chunk | `POLY_CHUNK_SIZE = 50` | Avoids `INVALID OPERATION` on large `type:market` bursts |
| Kalshi chunk | `KALSHI_CHUNK_SIZE = 100` | Batch subscribe |
| Refresh | 5 minutes | Reselect + diff subscribe/unsubscribe |
| Poly ping / pong | 10s / 30s timeout | Reconnect on stall |
| Reconnect base | 5s | Backoff path present |

**Documented in code (not assumed from vendor docs):** Poly rejects huge/extra `type:market` frames; chunking is the local mitigation. **No in-repo evidence** of a vendor-hard “max 150 markets” — 150 is a **Spada application cap**.

### Why 150 + `updated_at` hurts fairness

1. Cap keeps WS payload and subscribe churn bounded (risk control).  
2. Ordering by `updated_at` **starves** quiet but active markets that rarely update metadata.  
3. Local catalogue (P3 read-only): ~6.5k Poly / ~191k Kalshi active → vast majority never subscribed.  
4. Refresh every 5m can churn subscriptions toward whichever markets just got `updated_at` bumps (sync workers), not watchlist/user interest.

### What we can measure safely

| Metric | How (local) |
|--------|-------------|
| Active catalogue size | `count(*)` active per platform (read-only) |
| Subscribed count | Log `tokens=` / `tickers=` on refresh (already) |
| Recent ticks | In-process last-tick timestamps → count with tick in last T minutes |
| Candle sync rates | Existing `[Candle Sync] cycle eligible=… ok=… empty=… failed=…` over multiple cycles |
| Match outcomes | Existing `[marketMatchSync] matched/unmatched/rejected=…` + `market_matches` count |

---

## 2. Baseline — matching

| Piece | Current behavior |
|-------|------------------|
| Threshold | Jaccard/containment ≥ **0.88** |
| Gates | close-time window, same market kind, series slot / year, ambiguity margin |
| Unmatchable | `_event_` aggregates, short titles, inactive |
| Candidate pool | Top **500** by volume / platform |
| Sync sources | Top volume page of size `limit/2` per platform with **in-memory offset** |
| Persist | `market_matches` upsert |

**P3 evidence:** Only ~5 persisted matches; offline top-40 Poly vs top-500 Kalshi → 0 matches (**23** `unmatchable_market`, **17** `score_below_threshold`).

**False-negative coverage defect (not a “force match”):** Match-sync source pages are volume-ordered **including** event aggregates. Sync budget (e.g. 50 Poly sources) is heavily spent on markets that `findBestTwin` immediately rejects as unmatchable — matchable binaries further down the volume list are delayed/starved.

Ambiguity rejection and kind gates must stay.

---

## 3. Options considered

### Stream coverage

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| A. Raise limit to 500+ | More live ticks | Risk of WS INVALID OPERATION / auth rate limits; **unmeasured** | **Defer** until staged load test |
| B. Fair mix inside 150: watchlist + volume + rotate | Fixes starvation; keeps cap | Slightly more query complexity | **Recommend now** |
| C. Demand-driven subscribe (FE interest) | Best UX | Needs BE protocol for “wanted markets”; larger change | Later |
| D. Metrics only | Safe | Does not improve coverage | Do with B |

### Matching

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| A. Prefer matchable sources in sync (skip `_event_` / short title when paging) | Uses scan budget on markets that can twin | Slightly more DB reads when filtering | **Recommend now** |
| B. Lower 0.88 threshold | More matches | False positives / bad divergence | **Reject** without product sign-off |
| C. Expand candidate pool to 2000 | May find more twins | DB/CPU load | Defer; measure first |
| D. Persist rotation cursor | Restart-fair | Needs migration/table | Defer (no migration this phase) |

---

## 4. Recommended approach (this P4 implementation)

1. **`priceStreamPlan` (pure helpers)** — select ≤`PRICE_STREAM_MARKET_LIMIT` (default **150**, env-overridable, hard max) using watch + volume + rotate shares (reuse candle-sync quota ideas). Advance rotate cursor in memory.  
2. **Wire plan into `priceStream` loaders** — stop pure `updated_at` top-150 as sole strategy; keep chunk sizes and refresh intervals.  
3. **Structured stream metrics log** each refresh: catalogue eligible (if known), selected, subscribed, watch/volume/rotate mix, markets with recent ticks (if tracked).  
4. **Match-sync source filtering** — when building source pages, skip unmatchable markets so each cycle examines matchable candidates; advance DB offset by rows examined. Preserve reject reasons and ambiguity rules.  
5. **Unit tests** for plan selection fairness and matchable source paging.  
6. **Do not** raise default 150 without ops approval; **do not** invent matches; **do not** migrate DB.

---

## 5. Risks

- Watchlist query adds load every 5m refresh — keep bounded.  
- Rotate pool still limited by how many rows we fetch per refresh (bounded page).  
- Matchable filtering may scan deeper into volume list — cap examined rows per cycle.  
- In-memory cursors still reset on restart (known limitation).

---

## 6. Product / ops decisions still required

- Whether default stream cap may increase after a staged load test.  
- Demand-driven subscriptions.  
- Persisted match/stream rotation cursors (migration).  
- ISO vs epoch weekly candles (out of scope).  
- Client endpoint defect list / visitor PDF (out of scope).

---

## 7. Success criteria (measured, not claimed)

After implementation, local verification should show:

- Unit tests for stream plan + matchable source preference pass.  
- Logs include structured stream coverage lines.  
- Match-sync rejects fewer sources as `unmatchable_market` for the same scan limit (more matchable sources examined) — **without** fabricating twins.  
- **No claim** of production-wide coverage improvement without multi-cycle staging metrics.

*End of design. Implementation proceeds only for §4 items.*
