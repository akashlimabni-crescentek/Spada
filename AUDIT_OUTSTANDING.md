# Spada audit — outstanding decisions checklist

Tracks **unresolved client / environment questions** after local P0–P2 work.  
Separate **confirmed implementation facts** from **pending decisions**. Do not treat pending items as done.

---

## 1. Kalshi and Polymarket endpoint corrections

| Status | Item |
|--------|------|
| **Pending (client)** | Client must provide or confirm the authoritative defect list for venue endpoint corrections (paths, params, auth, pagination, rate limits). |
| **Not claimed** | This workspace has **not** verified “all endpoint corrections” against an external audit PDF defect list. |
| **Confirmed locally** | Live integration smoke tests exercise Spada’s Fastify market/candles/orderbook/ratios routes against the local API when running; that is **not** the same as validating every upstream Polymarket/Kalshi client call site. |

**Action needed:** Client supplies defect checklist → engineer maps each item to code paths → mark verified only with evidence.

---

## 2. Weekly candle semantics

| Status | Item |
|--------|------|
| **Confirmed in code** | `1w` interval duration is `7 * 24 * 60 * 60 * 1000` ms (`formingCandle.ts` / aggregator). |
| **Confirmed in code** | Bucket start is Unix-epoch aligned: `Math.floor(tsMs / bucketMs) * bucketMs`. |
| **Confirmed in code** | This is **not** ISO-8601 calendar-week bucketing (Monday-based weeks). |
| **Not changed** | Bucket semantics were **not** altered in P2; changing them requires an explicit request + tests. |

**Practical difference:** Two trades in the same ISO calendar week can land in different Spada `1w` buckets (and vice versa) because Spada weeks are fixed 7-day windows from the Unix epoch, not “week of year” calendar weeks.

**Pending (client):** Whether product/analytics should use ISO calendar weeks instead. Until decided, keep epoch-aligned behavior.

---

## 3. Visitor-information PDF

| Status | Item |
|--------|------|
| **Confirmed** | Workspace search found **neither** `Infomation.pdf` nor `Information.pdf`. |
| **Blocked** | Visitor-information requirements (IP, OS, browser, geolocation, retention, consent) **cannot be verified** without the source document. |
| **Not implemented** | No visitor IP / OS / browser / geolocation feature was invented to “satisfy” a missing PDF. |

**Action needed:** Client provides the visitor-information PDF (correct spelling) → gap analysis against product + legal requirements.

---

## 4. Production readiness

| Status | Item |
|--------|------|
| **Confirmed** | App has been exercised **locally** (unit, mocked contracts, optional LIVE API/E2E). |
| **Not claimed** | **Not production-certified.** Local green tests ≠ production readiness. |
| **Pending** | Candle **coverage measurement** in a durable ops environment (beyond local worker logs). |
| **Pending** | Production environment configuration review (auth fail-closed, secrets, Supabase RLS, worker schedules, `E2E_BYPASS_AUTH` never set in prod). |
| **Confirmed in code** | Dashboard metrics fields `volume_change_24h` / platform `*_change_24h` are still returned as **`null`** (not computed). |
| **Confirmed in code** | Live price-stream subscription loads at most **150** active markets per venue (`priceStream.ts`). |

P0 auth fail-closed behavior remains: production never honors `E2E_BYPASS_AUTH` (`frontend/src/lib/auth/authGate.ts`).

See also `LOCAL_READINESS_REPORT.md` and `P3_READINESS_REPORT.md` for the latest local regression / readiness evidence (including isolated `next start :3010` auth-redirect verification).

---

## 5. Match-sync rotation offset

| Status | Item |
|--------|------|
| **Confirmed** | `runMarketMatchSyncDetailed` advances an **in-memory** `matchSyncSourceOffset` for fair source paging. |
| **Confirmed limitation** | Offset **resets on process restart** (no DB persistence of the cursor). |
| **Not redesigned in P2** | Persisting the cursor would be a separate change; not required for local correctness of matching rules. |

**Pending (ops/client):** Whether restart-resilient rotation is required for production match coverage SLAs.

---

## Confirmed vs pending summary

| Topic | Confirmed fact | Pending decision |
|-------|----------------|------------------|
| Venue endpoints | Local Spada API smoke only | Authoritative defect list from client |
| Weekly candles | Epoch-aligned 7d buckets in code | Switch to ISO weeks? |
| Visitor info | PDF absent in repo | Provide PDF + requirements |
| Production | Local verification only | Coverage metrics + env hardening |
| Match-sync rotation | In-memory offset | Persist cursor across restarts? |

---

*Last updated as part of local P2 cleanup. No client decisions were fabricated.*
