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

  const res = await fetch(`${API_BASE}/api/v1/markets?platform=polymarket&limit=20`);
  if (!res.ok) {
    throw new Error(
      `Cannot discover market id: API ${API_BASE} returned ${res.status}. Start the backend or set SPADA_E2E_MARKET_ID.`
    );
  }
  const body = (await res.json()) as { markets?: Array<{ canonical_id?: string }> };
  const markets = body.markets ?? [];
  const binary = markets.find((m) => m.canonical_id && !m.canonical_id.includes("_event_"));
  const id = binary?.canonical_id ?? markets[0]?.canonical_id;
  if (!id) {
    throw new Error("No markets returned from API — cannot run single-market E2E.");
  }
  return id;
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
