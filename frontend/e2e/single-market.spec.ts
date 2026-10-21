/**
 * LIVE browser E2E — single-market user journey.
 * Uses the real Next.js app + Fastify API (no synthetic candles / fake price simulator).
 *
 * Prerequisites:
 *   - frontend: npm run dev  (port 3000) with E2E_BYPASS_AUTH=true for authenticated paths
 *   - backend:  npm run dev  (port 4000) with NEXT_PUBLIC_API_URL pointed at it
 *
 * Auth:
 *   - Login-redirect coverage runs WITHOUT bypass (separate describe).
 *   - Authenticated journey requires non-production E2E_BYPASS_AUTH=true|1.
 *   - Production never honors E2E_BYPASS_AUTH (see authGate.ts).
 */
import { expect, test, type Page } from "@playwright/test";

const API_BASE = (process.env.SPADA_API_BASE ?? "http://127.0.0.1:4000").replace(
  /\/$/,
  ""
);

async function resolveMarketId(): Promise<string> {
  if (process.env.SPADA_E2E_MARKET_ID?.trim()) {
    return process.env.SPADA_E2E_MARKET_ID.trim();
  }

  const events: string[] = [];
  for (const offset of [0, 100, 200, 300]) {
    const res = await fetch(
      `${API_BASE}/api/v1/markets?platform=polymarket&limit=100&offset=${offset}`
    );
    if (!res.ok) {
      throw new Error(
        `Cannot discover market id: API ${API_BASE} returned ${res.status}. Start the backend or set SPADA_E2E_MARKET_ID.`
      );
    }
    const body = (await res.json()) as { markets?: Array<{ canonical_id?: string }> };
    for (const market of body.markets ?? []) {
      const id = market.canonical_id;
      if (typeof id === "string" && id.includes("_event_")) events.push(id);
    }
    if (events.length >= 24) break;
  }

  // Stored history answers in about a second. A miss falls through to the
  // venue, so probe a few events at once and keep the first real series.
  const probe = async (id: string): Promise<string | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4_000);
    try {
      const candles = await fetch(
        `${API_BASE}/api/v1/markets/${encodeURIComponent(id)}/candles?resolution=1h`,
        { signal: ctrl.signal }
      );
      if (!candles.ok) return null;
      const json = (await candles.json()) as { candles?: unknown[] };
      return Array.isArray(json.candles) && json.candles.length > 0 ? id : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  for (let i = 0; i < events.length && i < 24; i += 6) {
    const found = (await Promise.all(events.slice(i, i + 6).map(probe))).find(Boolean);
    if (found) return found;
  }
  throw new Error(
    "No polymarket event with stored candles in the scanned pages. Set SPADA_E2E_MARKET_ID."
  );
}

async function assertNoSyntheticCandleResponses(page: Page) {
  const candleResponses: Array<{
    url: string;
    hasTempStatic: boolean;
    candleCount: number;
  }> = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/candles")) return;
    try {
      const json = (await response.json()) as {
        _tempStatic?: boolean;
        candles?: unknown[];
      };
      candleResponses.push({
        url,
        hasTempStatic: Boolean(json?._tempStatic),
        candleCount: Array.isArray(json?.candles) ? json.candles.length : 0,
      });
    } catch {
      // non-JSON / aborted — ignore
    }
  });

  return () => {
    expect(
      candleResponses.length,
      "expected at least one /candles network response for the chart"
    ).toBeGreaterThan(0);
    for (const hit of candleResponses) {
      expect(hit.hasTempStatic, `synthetic candles at ${hit.url}`).toBe(false);
    }
    return candleResponses;
  };
}

test.describe("auth gate (unauthenticated)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page is reachable for unauthenticated users", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("protected route redirects to login when server auth bypass is off", async ({
    page,
    context,
  }) => {
    // Isolated verification (does NOT stop `npm run dev` on :3000):
    //   cd frontend && E2E_BYPASS_AUTH=false npx next start -p 3010
    //   SPADA_E2E_BASE_URL=http://localhost:3010 npm run test:e2e:auth-redirect
    // `next start` uses NODE_ENV=production → E2E_BYPASS_AUTH is ignored (fail-closed).
    // When pointed at a bypass-enabled `next dev`, skip rather than weaken auth.
    await context.clearCookies();
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    if (!/\/login/.test(page.url())) {
      test.skip(
        true,
        "Next server allowed /dashboard without session (E2E_BYPASS_AUTH likely on); use next start :3010 — see TESTING.md"
      );
    }
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("single-market journey (LIVE)", () => {
  test("loads title, history, orderbook, and ratios (honest empty states OK)", async ({
    page,
  }) => {
    const marketId = await resolveMarketId();
    const finishCandleCheck = await assertNoSyntheticCandleResponses(page);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const httpErrors: string[] = [];
    const wsFrames: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (/favicon|Download the React DevTools/i.test(text)) return;
      // Chrome logs a resource failure with no URL. Those are judged from httpErrors.
      if (/^Failed to load resource:/i.test(text)) return;
      consoleErrors.push(text);
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const url = response.url();
      if (/favicon|chrome-extension:|manifest\.webmanifest/i.test(url)) return;
      // Bypass opens the page without a Supabase session, so profile and
      // watchlist stay 401. That is not a chart regression.
      if (response.status() === 401 && /supabase\.co|\/api\/v1\/me|\/api\/v1\/watchlist/i.test(url)) {
        return;
      }
      // Polymarket CLOB timeouts are a venue condition. The Kalshi book is
      // covered by the API integration test.
      if (/\/orderbook(?:\?|$)/.test(url) && (response.status() === 404 || response.status() >= 500)) {
        return;
      }
      httpErrors.push(`${response.status()} ${url}`);
    });
    page.on("websocket", (ws) => {
      ws.on("framereceived", (frame) => {
        const payload = String(frame.payload ?? "");
        if (payload) wsFrames.push(payload);
      });
    });

    await page.goto(`/singleMarket/${encodeURIComponent(marketId)}`);

    await expect(
      page.getByTestId("market-loading").or(page.getByTestId("single-market-page"))
    ).toBeVisible();

    // Loading must resolve to the page (not the error state) for a known market.
    await expect(page.getByTestId("single-market-page")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByTestId("market-error")).toHaveCount(0);

    const title = page.getByTestId("market-title");
    await expect(title).toBeVisible();
    await expect(title).not.toHaveText(/^\s*$/);

    await expect(page.getByTestId("market-volume")).toBeVisible();
    await expect(page.getByTestId("market-chart")).toBeVisible();

    // Chart either shows canvas history or an honest empty/error status — not a blank crash.
    // Empty history must NOT be treated as a successful populated-data assertion.
    let chartPopulated = false;
    await expect
      .poll(async () => {
        const chart = page.getByTestId("market-chart");
        const canvasCount = await chart.locator("canvas").count();
        const statusCount = await chart
          .getByText(
            /No .* history|Price history didn't load|This market has no historical|No .* candles|Failed to load chart/
          )
          .count();
        if (canvasCount > 0) {
          chartPopulated = true;
          return true;
        }
        return statusCount > 0;
      }, { timeout: 45_000 })
      .toBe(true);

    const candleHits = finishCandleCheck();
    if (chartPopulated) {
      const anyCandles = candleHits.some((h) => h.candleCount > 0);
      expect(
        anyCandles,
        "chart canvas present but all /candles responses were empty"
      ).toBe(true);
    }

    await page.getByRole("tab", { name: "OHLCV" }).click();
    for (const timeframe of ["15m", "1h"]) {
      await page.getByRole("tab", { name: timeframe, exact: true }).click();
      await expect(page.getByTestId("market-chart").locator("canvas").first()).toBeVisible({
        timeout: 45_000,
      });
    }
    await expect
      .poll(() => candleHits.some((hit) => hit.url.includes("resolution=1h")), {
        timeout: 20_000,
      })
      .toBe(true);

    await expect
      .poll(
        () =>
          wsFrames.some(
            (frame) => frame.includes("CONNECTED") || frame.includes("SUBSCRIBED")
          ),
        { timeout: 20_000 }
      )
      .toBe(true);
    await expect
      .poll(
        () => wsFrames.some((frame) => frame.includes("PRICE_UPDATE")),
        { timeout: 20_000 }
      )
      .toBe(true);

    expect(pageErrors, `uncaught page errors:\n${pageErrors.join("\n")}`).toEqual([]);
    expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
    expect(httpErrors, `unexpected HTTP errors:\n${httpErrors.join("\n")}`).toEqual([]);

    // Orderbook: levels, no-orders, or unavailable card — one of the honest states.
    const orderbook = page
      .getByTestId("market-orderbook")
      .or(page.getByTestId("market-orderbook-empty"))
      .or(page.getByTestId("orderbook-levels"))
      .or(page.getByTestId("orderbook-no-orders"));
    await expect(orderbook.first()).toBeVisible({ timeout: 45_000 });

    // Ratios: loaded panel, loading, empty, or error — never a crash.
    const ratios = page
      .getByTestId("market-ratios")
      .or(page.getByTestId("market-ratios-loading"))
      .or(page.getByTestId("market-ratios-empty"))
      .or(page.getByTestId("market-ratios-error"));
    await expect(ratios.first()).toBeVisible({ timeout: 45_000 });

    // Guard: fake DEV simulator must not be present in the product page source path.
    await expect(page.getByText(/DEV live simulator/i)).toHaveCount(0);
  });

  test("missing market shows error state", async ({ page }) => {
    await page.goto(`/singleMarket/does_not_exist_e2e_${Date.now()}`);
    await expect(page.getByTestId("market-error")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("single-market-page")).toHaveCount(0);
  });
});
