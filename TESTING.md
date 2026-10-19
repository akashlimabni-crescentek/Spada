# Spada automated tests

This workspace has two packages with different test layers. **Unit / mocked** tests never need a running server. **LIVE integration / E2E** tests need local services and real API data — they never invent synthetic candles or fake live prices.

## Layers

| Layer | Where | Mocked? | Needs |
|-------|--------|---------|--------|
| Backend unit | `backend/.../src/lib/*.test.ts` | Yes (pure logic / fixtures) | Node only |
| Backend mocked contracts | `backend/.../src/integration/api.contracts.mock.test.ts` | Yes | Node only |
| Backend LIVE integration | `backend/.../src/integration/api.live.integration.test.ts` | **No** | Fastify on `SPADA_API_BASE` (default `http://127.0.0.1:4000`) |
| Frontend unit | `frontend/src/lib/markets/marketTitle.test.ts` | Yes | Node / tsx |
| Frontend LIVE E2E | `frontend/e2e/*.spec.ts` (Playwright) | **No** | Next.js + Fastify |

## Backend commands

```bash
cd backend/Spada_Backend/fastify-backend
npm run test:unit              # ratios, matching, candles, orderbook helpers
npm run test:integration:mock  # response-shape helpers (no network)
npm run test:integration       # LIVE HTTP contracts (skips if API down unless SPADA_INTEGRATION_REQUIRE=1)
npm test                       # unit + mock + live
```

LIVE integration covers: market 404, market details + volume fields, candles for `5m/15m/1h/4h/1d/1w` with **no `_tempStatic`**, orderbook shape or honest error, ratios/matching payload.

Candle sync (backend worker, not a separate npm script): boot+20s then every 15m. Each cycle mixes watchlist + high-volume + fair catalogue rotation (`CANDLE_SYNC_MARKET_LIMIT`, default 40). Polymarket `/trades` dense windows bisect on the v1 offset=10000 cap. Unit coverage: `npm run test:candles` + `npm run test:poly-trades` + `npm run test:candle-sync-plan`.

Env:

- `SPADA_API_BASE` — API origin (default `http://127.0.0.1:4000`)
- `SPADA_INTEGRATION_REQUIRE=1` — fail if API unreachable (CI with a started backend)
- `CANDLE_SYNC_MARKET_LIMIT` — markets per candle-sync cycle (default 40, max 200)
- `CANDLE_SYNC_WATCH_SHARE` — fraction reserved for watchlist markets (default 0.25)
- `CANDLE_SYNC_VOLUME_SHARE` — fraction reserved for high-volume markets (default 0.35)

## Frontend commands

```bash
cd frontend
npm run test:market-title   # title helper + page hygiene (no fake simulator)
npm run test:auth-gate      # production fail-closed auth bypass
npm run test:landing-demo   # landing synthetic charts disclose non-live data
npm run test:api-base       # getApiBaseUrl + news URL builders
npm test                    # all of the above unit checks
# E2E uses system Google Chrome (channel: chrome). On macOS 13+ you may instead:
#   npm run test:e2e:install
npm run test:e2e            # LIVE browser journey (requires apps running)
```

Also see workspace docs: `PERSISTENCE.md`, `AUDIT_OUTSTANDING.md`, `LOCAL_READINESS_REPORT.md`, `P3_READINESS_REPORT.md`.

E2E journey: landing demo disclosure; open `/singleMarket/:id`, assert title, chart history (and candle responses without `_tempStatic`), orderbook or honest empty/unavailable, missing-market error state.

### Isolated auth-redirect E2E (without stopping `next dev`)

`next dev` locks the project directory (Next 16), so a second `next dev` cannot run. Use **`next start`** on another port instead (requires an existing `.next` build):

```bash
# Terminal C — leave `npm run dev` on :3000 alone
cd frontend
E2E_BYPASS_AUTH=false npx next start -p 3010

# Terminal D
cd frontend
SPADA_E2E_BASE_URL=http://localhost:3010 npm run test:e2e:auth-redirect
```

`next start` runs with `NODE_ENV=production`, so production fail-closed auth applies even if `E2E_BYPASS_AUTH` is set in `.env`.

Env:

- `SPADA_E2E_BASE_URL` — Next origin (default `http://localhost:3000`). Prefer `localhost` over `127.0.0.1` unless `next.config.ts` has `allowedDevOrigins` and the Next dev server was restarted after that change — otherwise Next 16 blocks `/_next` assets and the page stays on SSR “Loading…”.
- `SPADA_API_BASE` — used to discover a market id
- `SPADA_E2E_MARKET_ID` — optional fixed `canonical_id`
- `E2E_BYPASS_AUTH=true` — **non-production only**, explicit opt-in to skip login redirects for local/E2E (`npm run dev`). **Ignored in production** (`NODE_ENV=production` / `VERCEL_ENV=production` / `NEXT_PUBLIC_APP_ENV=production`) even if set to `true`.

## Local full pass

Terminal A:

```bash
cd backend/Spada_Backend/fastify-backend && npm run dev
```

Terminal B:

```bash
cd frontend && npm run dev
```

Then:

```bash
cd backend/Spada_Backend/fastify-backend && SPADA_INTEGRATION_REQUIRE=1 npm run test:integration
cd frontend && npm run test:e2e
```

## CI

See `.github/workflows/test.yml` in this review workspace. Unit + mocked jobs always run. LIVE jobs run when services are started in the workflow (or are skipped cleanly when not).
