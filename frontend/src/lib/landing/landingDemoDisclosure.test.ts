/**
 * Landing-page synthetic chart disclosure.
 * Run: npm run test:landing-demo
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const DISCLOSURE = "Illustrative demo — not live market data.";

function run() {
  const landingPage = join(root, "app/page.tsx");
  const signalDemo = join(root, "components/custom/static/staticSignalDemo.tsx");
  const liveChart = join(root, "components/custom/static/LiveMarketChart.tsx");

  for (const path of [landingPage, signalDemo, liveChart]) {
    assert.equal(existsSync(path), true, `missing ${path}`);
  }

  const page = readFileSync(landingPage, "utf8");
  assert.ok(page.includes("SignalDemo"), "landing must still mount SignalDemo");
  assert.ok(page.includes("LiveMarketChart"), "landing must still mount LiveMarketChart");

  const signalSrc = readFileSync(signalDemo, "utf8");
  assert.ok(
    signalSrc.includes(DISCLOSURE),
    "SignalDemo must disclose illustrative demo data"
  );
  assert.ok(
    signalSrc.includes('data-testid="landing-demo-disclosure"'),
    "SignalDemo disclosure needs a stable test id"
  );
  assert.ok(
    signalSrc.includes('role="note"'),
    "SignalDemo disclosure should be announced as a note"
  );

  const liveSrc = readFileSync(liveChart, "utf8");
  assert.ok(
    liveSrc.includes(DISCLOSURE),
    "LiveMarketChart marketing demo must disclose illustrative data"
  );
  assert.ok(
    liveSrc.includes('data-testid="landing-demo-disclosure"'),
    "LiveMarketChart disclosure needs a stable test id"
  );

  console.log("✓ landing SignalDemo + LiveMarketChart disclose non-live demo data");
  console.log("\nAll landing demo disclosure tests passed.");
}

run();
