/**
 * Single-market title + product-page hygiene checks (no test-runner install).
 * Run: npx tsx src/lib/markets/marketTitle.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveMarketTitle } from "./marketTitle";

const here = dirname(fileURLToPath(import.meta.url));
const singleMarketPagePath = join(
  here,
  "../../app/(core)/singleMarket/[id]/page.tsx"
);

function run() {
  assert.equal(resolveMarketTitle("Bitcoin above 100k?"), "Bitcoin above 100k?");
  assert.equal(resolveMarketTitle("  Trimmed title  "), "Trimmed title");
  assert.equal(resolveMarketTitle(""), null);
  assert.equal(resolveMarketTitle("   "), null);
  assert.equal(resolveMarketTitle(null), null);
  assert.equal(resolveMarketTitle(undefined), null);

  assert.equal(
    existsSync(singleMarketPagePath),
    true,
    "single-market page must exist"
  );

  const pageSource = readFileSync(singleMarketPagePath, "utf8");

  // Issue A — title must be rendered, not trapped in a comment with the old banner.
  assert.ok(
    pageSource.includes('data-testid="market-title"') &&
      pageSource.includes("{title}"),
    "page must render an h1 from resolveMarketTitle"
  );
  assert.ok(
    pageSource.includes("resolveMarketTitle"),
    "page must use resolveMarketTitle for safe title display"
  );

  // Issue B — fake live simulator must not remain in the product page.
  assert.equal(
    pageSource.includes("DEV_LIVE_TEST_STATIC"),
    false,
    "DEV_LIVE_TEST_STATIC must be removed from single-market page"
  );
  assert.equal(
    pageSource.includes("useDevLivePriceSimulator"),
    false,
    "useDevLivePriceSimulator must be removed from single-market page"
  );
  assert.equal(
    pageSource.includes("[DEV live simulator]"),
    false,
    "DEV live simulator logging must be removed"
  );
  assert.ok(
    pageSource.includes("useMarketSubscription"),
    "page must still subscribe to real WebSocket prices"
  );

  console.log("✓ resolveMarketTitle handles present / empty / missing titles");
  console.log("✓ single-market page renders title and has no fake price simulator");
  console.log("\nAll marketTitle tests passed.");
}

run();
