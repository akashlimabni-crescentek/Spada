# Spada — Local Readiness Report

**Date:** 2026-10-19  
**Scope:** Local regression audit after P0 / P1 / P2–P3 work  
**Environment:** Local development only  

**Explicit confirmation:** No deployment was performed. No database migrations, writes, or destructive operations were executed as part of this audit. Secrets, tokens, and connection strings are not recorded in this document.

---

## 1. Current local verification status

| Area | Status | Notes |
|------|--------|-------|
| Authentication (FE gate) | **VERIFIED LOCALLY** | Fail-closed production; unit tests green |
| Authentication (BE API) | **PARTIAL** | User/watchlist/payments/WS ticket require `authenticate`; public market/candles/orderbook/ratios routes intentionally unauthenticated |
| Historical candles | **VERIFIED LOCALLY** | Unit + LIVE integration all 6 resolutions; no `_tempStatic` |
| Live charts / WebSocket | **PARTIAL** | Code paths + E2E chart honesty verified; full reconnect matrix not instrumented end-to-end |
| Orderbook / volume | **VERIFIED LOCALLY** | LIVE orderbook + empty UI states; `volume_change_24h` still **null** in metrics API |
| Matching / ratios | **VERIFIED LOCALLY** | Unit suite green; LIVE sample often `matched=false` / `divergence=null` (honest) |
| Landing demo disclosure | **VERIFIED LOCALLY** | Unit + Playwright |
| News API base URL | **VERIFIED LOCALLY** | `getApiBaseUrl()` in news hooks + unit tests |
| Persistence documentation | **VERIFIED LOCALLY** | `PERSISTENCE.md` present; DDL/indexes still unknown |
| E2E + lint | **VERIFIED LOCALLY** | 4 passed / 1 skipped; lint 0 errors / 3 warnings |
| Outstanding client requirements | **BLOCKED / PENDING** | See `AUDIT_OUTSTANDING.md` |
| Production readiness | **NOT TESTED** | Local green ≠ production-certified |

---

## 2. Phase 1 — Repository vs prior handover

### Confirmed present (matches prior reports)

- P0: `frontend/src/lib/auth/authGate.ts`, middleware wiring, `test:auth-gate`
- P0: `backend/.../src/lib/candleSyncPlan.ts` + tests (watch / volume / rotate)
- P1: matching (`marketMatching.ts`, `crossPlatform.ts`), ratios (`ratios.ts`, `ratioEngine.ts`), tests
- P2: landing disclosures, `PERSISTENCE.md`, `AUDIT_OUTSTANDING.md`, news `getApiBaseUrl()` usage
- Scripts: frontend `test:landing-demo`, `test:api-base`; backend `test:unit` / mock / live integration

### Discrepancies / clarifications

| Topic | Prior impression | Current evidence |
|-------|------------------|------------------|
| Dashboard token logging | Earlier audit found `MY TOKEN` console.log | **Absent** from `dashboard/page.tsx` now |
| Price-stream Poly scale | Older logs mentioned ~2131 tokens | **Current code** loads active markets with `.limit(150)` per venue (`priceStream.ts`) |
| Match coverage | Matching improved | LIVE sample market still often unmatched — **not** a fabricated twin |
| Second Next for bypass-off E2E | Desired | **Blocked** by Next 16 single-dev-server lock while port 3000 runs with bypass |

### Secrets / env hygiene

- `example.env` lists **variable names only** (empty values) + documents `E2E_BYPASS_AUTH` opt-in.
- No `.env` secret values printed during this audit.
- Tracked env template only; do not commit real `.env` / `.env.local`.

---

## 3. Commands executed and exit codes

| Command | Exit |
|---------|------|
| `frontend npm test` (market-title + auth-gate + landing-demo + api-base) | **0** |
| `frontend npm run lint` | **0** (0 errors, 3 warnings) |
| `frontend npx tsc --noEmit` | **0** |
| `frontend npm run test:e2e` | **0** (4 passed, 1 skipped) |
| `backend npm run test:unit` | **0** |
| `backend npm run test:integration:mock` | **0** |
| `backend SPADA_INTEGRATION_REQUIRE=1 npm run test:integration` | **0** |
| `backend npx tsc --noEmit` | **0** |
| Auth decision script (`shouldBypassAuth` / `resolveAuthGate`) | **0** |

---

## 4. Tests passed / failed / skipped

### Frontend unit (`npm test`)

- Passed: market-title, auth-gate, landing-demo, api-base  
- Failed: none  
- Skipped: none  

### Playwright E2E

| Result | Test |
|--------|------|
| Passed | Landing demo disclosure visible (2 labels) |
| Passed | Login page reachable |
| **Skipped** | Protected `/dashboard` → `/login` when server bypass **off** (primary Next has `E2E_BYPASS_AUTH` enabled) |
| Passed | Single-market title/chart/orderbook/ratios honest states |
| Passed | Missing market → error state |

**Counts:** 4 passed, 1 skipped, 0 failed.

### Backend unit (`npm run test:unit`)

Includes: ratios, matching, forming candles, candles-contract, poly-trades, candle-sync-plan, orderbook persist.  
**All passed** (exit 0).

### Backend LIVE integration

- Market 404 + details + volume fields  
- Candles `5m/15m/1h/4h/1d/1w` with **no `_tempStatic`** (non-zero counts on sample)  
- Orderbook 200 with bids/asks  
- Ratios: `matched=false`, `divergence=null` on sample  

---

## 5. Defects fixed during this run

**None.** No reproducible application defect requiring a code change was found in this audit pass. All applicable automated suites exited 0.

(Prior P0–P2 fixes remain in the working tree; this run was verification-focused.)

---

## 6. Remaining risks and limitations

1. **Local ≠ production** — no prod deploy, SSL, CDN, or prod DB verification.
2. **Match-sync rotation** — in-memory offset resets on process restart (`AUDIT_OUTSTANDING.md`).
3. **Match / divergence coverage** — depends on twin existence in bounded pools; unmatched remains correct.
4. **Candle fleet coverage** — sync prioritization verified in unit tests; **fleet-wide coverage % not measured**.
5. **Price-stream cap** — **150** active markets per venue (by `updated_at`); not full catalogue.
6. **`volume_change_24h`** (and platform change metrics) still returned as **`null`** from metrics endpoints in code.
7. **Public market APIs** — Fastify market/candles/orderbook/ratios are not behind `authenticate` (by current design). FE middleware protects pages only.
8. **Visitor-information PDF** — missing; requirements unverified.
9. **Venue endpoint defect list** — awaiting client.
10. **DB DDL/indexes** — not in-repo; conflict keys inferred from upserts (`PERSISTENCE.md`).
11. **Lint** — 3 `@next/next/no-img-element` warnings on news cards.
12. **E2E auth redirect** — needs Next started **without** bypass; dual Next blocked locally by framework lock.
13. **Weekly buckets** — Unix-epoch 7-day alignment, not ISO calendar weeks (documented; unchanged).

---

## 7. Database schema questions (authorized read-only)

Requires operator SQL against **local/dev only** (see `PERSISTENCE.md`):

- Exact column types / nullability for orderbook + OHLC + price_history  
- Unique constraints / indexes beyond upsert `onConflict` strings  
- Definition of RPC `get_candles` and view `ohlcv_1h_view`  
- RLS policies and retention  

**Do not** connect to production for this.

---

## 8. Production deployment checklist (documentation only — do not execute here)

1. Confirm `NODE_ENV` / `VERCEL_ENV` / `NEXT_PUBLIC_APP_ENV` = production (auth fail-closed).  
2. Ensure `E2E_BYPASS_AUTH` is **unset** in production.  
3. Set frontend: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` (HTTPS/WSS).  
4. Set backend secrets by **name only** in your vault: Supabase service role, Kalshi API credentials, Stripe/NOWPayments if used — never commit values.  
5. Verify Supabase RLS + RPC/view definitions match `PERSISTENCE.md` expectations.  
6. Run migrations only from reviewed SQL (none invented in this audit).  
7. Smoke: markets, candles×6, orderbook, ratios, WS ticket auth, watchlist auth.  
8. Confirm workers: market sync, candle sync, price stream, match sync schedules and log health.  
9. Measure candle coverage and match rates in staging with representative data.  
10. Remove/disable any local-only bypass; confirm no token logging.  
11. Legal/product: visitor-info PDF requirements before claiming compliance features.  
12. Client confirm: venue endpoint defect list closed; weekly bucket product preference.

---

## 9. Environment variable requirements (names only)

### Frontend

- `NEXT_PUBLIC_SUPABASE_URL`  
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  
- `NEXT_PUBLIC_API_URL`  
- `NEXT_PUBLIC_WS_URL`  
- `E2E_BYPASS_AUTH` — **local/E2E only**; never honor in production  
- `NEXT_PUBLIC_APP_ENV` — optional; `production` forces fail-closed gate  

### Backend (typical; see `config/env.ts` / local `.env` — do not paste values)

- Supabase URL + service role (or equivalent admin client vars)  
- Kalshi authenticated API credentials (when required)  
- Optional: `CANDLE_SYNC_MARKET_LIMIT`, `CANDLE_SYNC_WATCH_SHARE`, `CANDLE_SYNC_VOLUME_SHARE`  
- Optional payment provider secrets if those routes are enabled  

### Test harness

- `SPADA_API_BASE`, `SPADA_INTEGRATION_REQUIRE`, `SPADA_E2E_BASE_URL`, `SPADA_E2E_MARKET_ID`  

---

## 10. Items needing client confirmation

1. Authoritative Polymarket/Kalshi **endpoint defect checklist**.  
2. Preference: **epoch-aligned 7-day** vs **ISO calendar** weekly candles.  
3. Provide **visitor-information PDF** (`Information.pdf` / historical misspelling).  
4. Whether match-sync rotation cursor must **survive restarts**.  
5. Whether public market APIs should remain unauthenticated at the API layer.  
6. Acceptance of **150-market** live price-stream subscription cap.  
7. Timeline/priority for implementing real **`volume_change_24h`** (currently null).  

---

## Area status table (summary)

| Area | Status |
|------|--------|
| Authentication | **VERIFIED LOCALLY** (FE gate + unit); BE route policy **PARTIAL** (public market read APIs) |
| Historical candles | **VERIFIED LOCALLY** |
| Live charts and WebSocket | **PARTIAL** |
| Orderbook and volume | **VERIFIED LOCALLY** (24h volume **change** still null) |
| Matching and ratios | **VERIFIED LOCALLY** |
| Landing demo disclosure | **VERIFIED LOCALLY** |
| News API configuration | **VERIFIED LOCALLY** |
| Persistence documentation | **VERIFIED LOCALLY** (DDL unknowns remain) |
| E2E and lint | **VERIFIED LOCALLY** (1 E2E skip; 3 lint warnings) |
| Outstanding client requirements | **BLOCKED** / **PENDING** |

---

## Implementation completion vs production verification

| | |
|--|--|
| **Implementation (local)** | P0–P2 items are present in code and covered by local automated tests as listed above. |
| **Production verification** | **Not done.** Do not treat this report as production go-live approval. |

---

*Generated by local regression audit. See also `TESTING.md`, `PERSISTENCE.md`, `AUDIT_OUTSTANDING.md`.*
