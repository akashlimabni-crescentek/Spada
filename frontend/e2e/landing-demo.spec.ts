/**
 * Landing page — synthetic marketing charts must disclose non-live data.
 * Public route; does not require API or auth bypass.
 */
import { expect, test } from "@playwright/test";

test.describe("landing demo disclosure", () => {
  test("shows illustrative-demo labels on synthetic charts", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/?$/);

    const disclosures = page.getByTestId("landing-demo-disclosure");
    await expect(disclosures.first()).toBeVisible({ timeout: 20_000 });
    await expect(disclosures).toHaveCount(2);

    for (const el of await disclosures.all()) {
      await expect(el).toContainText(/Illustrative demo/i);
      await expect(el).toContainText(/not live market data/i);
    }

    await expect(page.getByTestId("landing-signal-demo")).toBeVisible();
    await expect(page.getByTestId("landing-live-chart-demo")).toBeVisible();
  });
});
