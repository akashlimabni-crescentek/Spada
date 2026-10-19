# Spada — P3 Production Readiness Report (Local Only)

**Date:** 2026-10-19  
**Scope:** Read-only production-readiness audit of existing P0–P2 implementation  
**Workspace:** `/Users/imac/Desktop/Spada`

**Explicit confirmation:** No deployment, no production connections, no database mutations/migrations, and no secrets printed. This report does **not** certify production readiness.

Related docs: `PERSISTENCE.md`, `AUDIT_OUTSTANDING.md`, `LOCAL_READINESS_REPORT.md`, `TESTING.md`.

---

## Executive summary

Local automated suites remain green. Production auth fail-closed behavior is confirmed in unit tests and, newly this audit, via an **isolated `next start :3010`** browser redirect that does not stop the existing `next dev` server.

Market-data and matching limitations are structural and intentional or data-driven—not silent fabrications:

| Topic | Finding |
|-------|---------|
| `volume_change_24h` | Hard-coded `null` — no historical snapshot pipeline |
| Live price stream | Cap **150 markets/venue**; local DB has ~6.5k Poly / ~191k Kalshi active |
| Cross-venue matches | Only **5** persisted `market_matches` rows; top-volume Poly is mostly event aggregates / below-threshold titles |
| Weekly candles | Epoch-aligned 7-day buckets (unchanged) |
| Client blockers | Venue endpoint defect list + visitor-information PDF still missing |

**Verdict:** Implementation is locally verifiable for many paths; **not production-certified**. Operators still need staging measurement, schema DDL confirmation, and client inputs listed below.

---

## Findings (severity · location)

### F1 — Production cannot bypass FE auth — Low risk (verified)
- **Severity:** Info / verified control  
- **Where:** `frontend/src/lib/auth/authGate.ts` L24–47; `frontend/src/middleware.ts` L14–19  
- **Evidence:** `shouldBypassAuth` returns `false` whenever `NODE_ENV` / `VERCEL_ENV` / `NEXT_PUBLIC_APP_ENV` is `production`, even if `E2E_BYPASS_AUTH=true`.  
- **Env sources traced:** middleware passes `process.env.NODE_ENV`, `VERCEL_ENV`, `NEXT_PUBLIC_APP_ENV`, `E2E_BYPASS_AUTH` into the gate.

### F2 — Intentionally public market APIs vs authenticated APIs — Medium (design)
- **Severity:** Medium (ops must understand boundary)  
- **Public (no `authenticate`):** `/api/v1/markets*`, candles, orderbook, ratios (market data).  
- **Authenticated:** `/api/v1/me`, watchlist CRUD, `/api/v1/ws/ticket`, payment create routes (`preHandler: [fastify.authenticate]` in `user.ts`, `watchlist.ts`, `payments.ts`).  
- **WS:** Ticket required when `NODE_ENV === 'production'` (`websocket.ts` L69–72); ticketless allowed in non-production. FE skips ticket fetch when `NODE_ENV !== 'production'` (`priceStreamConnector.ts` L136–140).

### F3 — `volume_change_24h` remains null by design — Medium (product gap)
- **Severity:** Medium (UI shows "—" / empty change)  
- **Where:** `backend/.../src/routes/market.ts` L260–268 and L361–369  
- **Root cause:** Comment in code: *"24h deltas need historical snapshots — never invent percentages."* Metrics compute current active counts and total volume only; no persistence of prior-day totals, no calculation path.  
- **Not a sync bug:** Volume for ratios uses provider `volume_24h` / candle sum (`ratioEngine` / `providerStats`); that is separate from dashboard **change** fields.

### F4 — Price-stream 150/venue cap — High impact on live completeness
- **Severity:** High for live-price coverage; Medium for product honesty if undocumented to users  
- **Where:** `priceStream.ts` `loadActivePolymarketMarkets` / `loadActiveKalshiTickers` — `.limit(150)` ordered by `updated_at`  
- **Local read-only counts (dev Supabase, no secrets):**  
  - Active Polymarket ≈ **6568** → ~**6418** outside stream cap  
  - Active Kalshi ≈ **191025** → ~**190875** outside stream cap  
- **Impact:** Most markets will not receive live WS ticks from the worker; charts may rely on historical candles / slower refresh for non-subscribed markets.

### F5 — Match coverage sparse; unmatched is often correct — Medium
- **Severity:** Medium (ratios divergence often null)  
- **Persisted:** `market_matches` count ≈ **5** (sports moneyline-style twins at similarity 1).  
- **Offline scan (read-only):** top **40** Poly by volume vs top **500** Kalshi → **0** matches; reasons: `unmatchable_market` **23** (event aggregates), `score_below_threshold` **17**.  
- **Interpretation:** Limitation is primarily **catalogue composition + title/kind gates + candidate pool**, not a forced-null bug. Do not fabricate matches.

### F6 — Candle-sync metrics exist; fleet % not measured here — Medium
- **Severity:** Medium (ops gap)  
- **Where:** `candleSyncPlan.formatCandleSyncStats`, `candleAggregator.syncActiveMarketHistory`, worker every **15m** after boot+20s (`server.ts` L79–89)  
- **Logged fields:** eligible, watchlist, processed, ok, empty, failed, rows, watch/volume/rotate mix, page size, duration, overlap skip.  
- **This audit:** Unit tests for plan logic **pass**; a single live cycle’s full eligible/processed numbers were **not** captured from a dedicated run in this pass (worker logs rotate). **No invented production coverage %.**

### F7 — Match-sync rotation is in-memory — Low/Medium
- **Where:** `marketMatching.ts` module `matchSyncSourceOffset`; worker hourly (`server.ts` L91–101)  
- **Limitation:** Offset resets on process restart (documented in `AUDIT_OUTSTANDING.md`).

### F8 — Weekly buckets epoch-aligned — Info (no change)
- **Where:** `formingCandle.ts` `bucketStartMs` / `1w` = 7×86400000 ms  
- **Product decision still pending** for ISO calendar weeks (`AUDIT_OUTSTANDING.md`).

### F9 — Schema DDL / RLS / retention — Blocked for full verification
- Code + `PERSISTENCE.md` + read-only table reachability only. Indexes/RLS/retention **not** verified without authorized `information_schema` inspection.

### F10 — Client inputs missing — Blocked
- Authoritative venue endpoint defect checklist  
- Visitor-information PDF (`Information.pdf` / `Infomation.pdf` absent)

---

## Status by area

| Area | Status | Notes |
|------|--------|-------|
| Authentication & env safety | **Verified** | Unit + isolated `next start` redirect |
| FE protected routes | **Verified** | Middleware + PUBLIC/AUTH route lists |
| BE auth boundaries | **Partial** | Auth’d user/watchlist/payments/WS ticket; market APIs public by design |
| WebSocket reliability | **Partial** | Code: connect/reconnect/resubscribe/cleanup; production ticket enforce; no chaos/load test |
| `volume_change_24h` | **Verified** (null cause) | Hard-coded null pending snapshot store |
| Candle-sync coverage | **Partial** | Plan + logging verified; fleet % not measured this run |
| Price-stream limit | **Verified** | 150/venue + local active counts |
| Matching & ratios | **Partial** | Rules/tests verified; live match rate low for top volume |
| Persistence / prod config | **Partial** | Code evidence + table existence; DDL/RLS/indexes unknown |
| Weekly candle semantics | **Verified** (epoch) | Unchanged; ISO decision pending |
| Visitor / endpoint PDF | **Blocked** | Files/checklist absent |

---

## Commands and test results

| Command | Exit | Notes |
|---------|------|-------|
| `frontend npm run test:auth-gate` | **0** | Fail-closed production matrix |
| `SPADA_E2E_BASE_URL=http://localhost:3010 npm run test:e2e:auth-redirect` (with `next start :3010`) | **0** | **1 passed** — `/dashboard` → `/login` |
| `backend npm run test:candle-sync-plan` | **0** | |
| `backend npm run test:matching` | **0** | |
| Prior full suite (see `LOCAL_READINESS_REPORT.md`) | **0** | unit / mock / LIVE / lint / tsc / e2e |

### Isolated auth-redirect procedure (does not disrupt `next dev`)

```bash
# Leave npm run dev on :3000 running
cd frontend
E2E_BYPASS_AUTH=false npx next start -p 3010   # uses existing .next; NODE_ENV=production

# Other terminal
cd frontend
SPADA_E2E_BASE_URL=http://localhost:3010 npm run test:e2e:auth-redirect
```

`next dev` cannot run twice on the same project (Next 16 lock). `next start` on another port works.

---

## What cannot be verified locally

- Production CDN/TLS/hosting configuration  
- Supabase RLS policies, index DDL, retention jobs  
- Venue-side rate limits and full catalogue stream capacity  
- Multi-hour WS reconnect under network partitions  
- Fleet-wide candle coverage % over days  
- Legal/compliance visitor tracking (PDF missing)  
- Client’s authoritative endpoint defect list  

---

## Remaining risks & required decisions

1. **Ops:** Accept or raise the 150-market stream cap; document for product.  
2. **Product:** Implement volume 24h **change** only with a snapshot store (do not invent).  
3. **Ops:** Persist match-sync rotation cursor if restart fairness is an SLA.  
4. **Client:** Endpoint defect checklist; visitor-info PDF; ISO vs epoch weeks.  
5. **Security:** Confirm public market APIs are acceptable for production.  
6. **Staging:** Measure candle sync ok/empty/failed over multiple cycles before go-live.

---

## Production operator checklist (documentation only — do not execute here)

1. Set `NODE_ENV` / hosting env to production; leave `E2E_BYPASS_AUTH` **unset**.  
2. Configure FE: `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` (HTTPS/WSS).  
3. Configure BE secrets via vault (Supabase service role, Kalshi credentials, payment keys) — never commit.  
4. Confirm WS ticket enforcement in production (`websocket.ts` path).  
5. Confirm RLS + RPC `get_candles` + view `ohlcv_1h_view` against live schema.  
6. Schedule/verify workers: market sync, candle sync (15m), match sync (1h), price stream.  
7. Smoke: auth login, protected page, WS with ticket, candles×6, orderbook, ratios unmatched honesty.  
8. Monitor `[Candle Sync] cycle eligible=…` and `[marketMatchSync]` logs.  
9. Decide stream subscription strategy beyond 150/venue.  
10. Close client blockers (PDF, endpoints, weekly semantics) before compliance claims.

---

## Changes made in this P3 pass

| Change | Type |
|--------|------|
| `P3_READINESS_REPORT.md` | **Created** (this document) |
| `frontend/package.json` → `test:e2e:auth-redirect` | Script for isolated redirect test |
| `e2e/single-market.spec.ts` comments | Document `next start :3010` procedure |
| `TESTING.md` | Document isolated auth-redirect |
| Application logic | **Not changed** (no reproducible safe defect required a fix) |

## Inspected only

Auth gate/middleware/BE auth plugin; WS FE connector + BE route; metrics null stubs; price-stream limits; candle-sync plan/worker schedules; matching offline scan + `market_matches` counts; persistence docs.

## Still blocked / evidence needed

- Visitor-information PDF  
- Authoritative venue endpoint defect list  
- Full DB schema/indexes/RLS dump (authorized read-only)  
- Staging multi-cycle candle coverage metrics  
- Product decision on weekly ISO vs epoch  

---

*End of P3 readiness report. Local verification ≠ production certification.*
