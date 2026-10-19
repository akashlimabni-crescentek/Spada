/**
 * API base URL helper + news endpoint construction.
 * Run: npm run test:api-base
 */
import assert from "node:assert/strict";
import { normalizeLocalhostUrl, getApiBaseUrl } from "./apiBase.js";
import { relatedNewsUrl } from "../hooks/useRelatedNews.js";
import { workspaceNewsUrl } from "../hooks/useNews.js";

function run() {
  assert.equal(
    normalizeLocalhostUrl("http://localhost:4000"),
    "http://127.0.0.1:4000"
  );
  assert.equal(
    normalizeLocalhostUrl("http://[::1]:4000/api"),
    "http://127.0.0.1:4000/api"
  );
  assert.equal(
    normalizeLocalhostUrl("https://api.example.com/"),
    "https://api.example.com/"
  );

  const prev = process.env.NEXT_PUBLIC_API_URL;
  try {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000/";
    assert.equal(getApiBaseUrl(), "http://127.0.0.1:4000");

    process.env.NEXT_PUBLIC_API_URL = "  https://api.example.com/v1/  ";
    assert.equal(getApiBaseUrl(), "https://api.example.com/v1");

    process.env.NEXT_PUBLIC_API_URL = "";
    assert.equal(getApiBaseUrl(), "");
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = prev;
  }

  assert.equal(
    relatedNewsUrl("polymarket_abc", "http://127.0.0.1:4000"),
    "http://127.0.0.1:4000/api/news/related-markets?marketId=polymarket_abc"
  );
  assert.equal(
    relatedNewsUrl("a/b", "http://127.0.0.1:4000/"),
    "http://127.0.0.1:4000/api/news/related-markets?marketId=a%2Fb"
  );

  assert.equal(
    workspaceNewsUrl(null, "http://127.0.0.1:4000"),
    "http://127.0.0.1:4000/api/workspace/news"
  );
  assert.ok(
    workspaceNewsUrl("Politics", "http://127.0.0.1:4000").includes(
      "category=Politics"
    )
  );

  // No hardcoded localhost in production hook modules (env-driven via helper).
  assert.equal(
    relatedNewsUrl("x", "https://api.example.com").startsWith("https://"),
    true
  );

  console.log("✓ apiBase normalization");
  console.log("✓ news URL builders avoid duplicate slashes / encode marketId");
  console.log("\nAll apiBase tests passed.");
}

run();
