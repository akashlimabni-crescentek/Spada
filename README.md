# Spada Prediction Market — Review Workspace

One folder for side-by-side review of the Fastify backend and Next.js frontend.

```
Spada-Prediction-Market/
├── README.md                 ← you are here
├── backend/                  ← Fastify API + workers (git repo)
│   └── Spada_Backend/
│       └── fastify-backend/  ← run backend from here
└── frontend/                 ← Next.js UI (git repo)
```

## Git setup

This folder is a **parent git repo**. `backend/` and `frontend/` are **submodules** pointing at their existing GitHub remotes (each keeps its own history).

| Folder       | GitHub repo | Role |
|--------------|-------------|------|
| `backend/`   | [prediction-market-pipeline-Spada-Fastify-Backend](https://github.com/akashlimabni-crescentek/prediction-market-pipeline-Spada-Fastify-Backend) | API, WS, candles, ratios |
| `frontend/`  | [masquantitative-web-Fastify-Frontend](https://github.com/akashlimabni-crescentek/masquantitative-web-Fastify-Frontend) | Market UI, charts, orderbook |
| *(parent)*   | [Spada-Prediction-Market](https://github.com/akashlimabni-crescentek/Spada-Prediction-Market) | Review workspace + submodule pointers |

**Clone everything in one step:**

```bash
git clone --recurse-submodules https://github.com/akashlimabni-crescentek/Spada-Prediction-Market.git
cd Spada-Prediction-Market
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

Work inside `backend/` or `frontend/` as usual (`git status`, commit, push to that repo’s `origin`).

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

Point the frontend API base URL at `http://localhost:4000` (see `frontend/example.env`).

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
- Reopen Cursor on this folder (`Spada-Prediction-Market`) or on `backend` / `frontend` as needed after the move.
