# Spada Prediction Market

Single monorepo for the Fastify backend and Next.js frontend.

```
Spada/
├── README.md
├── backend/                  ← Fastify API + workers
│   └── Spada_Backend/
│       └── fastify-backend/  ← run backend from here
└── frontend/                 ← Next.js UI
```

## Git

Clone:

```bash
git clone https://github.com/akashlimabni-crescentek/Spada.git
cd Spada
```

Work in one repo: commit and push from the repo root. `frontend/` and `backend/` are normal folders (not separate remotes).

## Quick start (local)

**Backend** (port `4000`):

```bash
cd backend/Spada_Backend/fastify-backend
npm install
npm run dev
```

**Frontend** (port `3000`):

```bash
cd frontend
npm install
npm run dev
```

Point the frontend API base URL at `http://localhost:4000` (see `frontend/example.env`). Copy to `frontend/.env` locally — do not commit real `.env` files.

## Testing

See **[TESTING.md](./TESTING.md)** for unit vs LIVE integration/E2E commands.

Quick unit pass (no servers):

```bash
cd backend/Spada_Backend/fastify-backend && npm run test:unit && npm run test:integration:mock
cd frontend && npm run test:market-title
```

LIVE API + browser (apps must already be running):

```bash
cd backend/Spada_Backend/fastify-backend && SPADA_INTEGRATION_REQUIRE=1 npm run test:integration
cd frontend && npm run test:e2e
```

E2E uses system Google Chrome (`channel: chrome`). On macOS 13+ you can instead install Playwright’s Chromium with `npm run test:e2e:install`. After changing `allowedDevOrigins` in `next.config.ts`, restart `next dev`.

CI workflow: `.github/workflows/test.yml` (unit always; optional LIVE via `SPADA_RUN_LIVE_TESTS`).

## Review map

| Area              | Backend                                                         | Frontend                                      |
|-------------------|-----------------------------------------------------------------|-----------------------------------------------|
| Markets / detail  | `backend/Spada_Backend/fastify-backend/src/routes/market.ts`    | `frontend/src/components/custom/markets/`     |
| Candles / OHLCV   | `.../src/services/candleAggregator.ts`                          | `.../HistoricalOhlcvChart.tsx`, `lib/candles/` |
| Ratios            | `.../src/lib/ratios.ts`, `.../services/ratioEngine.ts`          | `.../MarketRatios` (under markets)            |
| Matching          | `.../src/services/marketMatching.ts`                            | unmatched / matched ratio UI                  |
| Orderbook         | `.../src/services/orderbookStore.ts`                            | orderbook components under markets            |
| WebSocket prices  | `.../src/workers/priceStream.ts`                                | live chart / price hooks                      |

## Notes

- Zip backups on Desktop (`*.zip`) were left in place and were not moved.
- Synthetic candle short-circuit was removed; LIVE tests assert responses never include `_tempStatic`.
- Open this folder in Cursor via `Spada.code-workspace` (frontend + backend roots).
