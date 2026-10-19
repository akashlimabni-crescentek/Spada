/**
 * Auth gate unit tests — fail-closed production bypass.
 * Run: npm run test:auth-gate
 */
import assert from "node:assert/strict";
import {
  isProductionDeployment,
  resolveAuthGate,
  shouldBypassAuth,
} from "./authGate.js";

function runProductionNeverBypasses() {
  assert.equal(shouldBypassAuth({ NODE_ENV: "production" }), false);
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "production", E2E_BYPASS_AUTH: "true" }),
    false
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "production", E2E_BYPASS_AUTH: "1" }),
    false
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "production", E2E_BYPASS_AUTH: "" }),
    false
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "production", E2E_BYPASS_AUTH: "false" }),
    false
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "production", E2E_BYPASS_AUTH: "yes" }),
    false
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "production", E2E_BYPASS_AUTH: "TRUE" }),
    false
  );
  assert.equal(
    shouldBypassAuth({ VERCEL_ENV: "production", E2E_BYPASS_AUTH: "true" }),
    false
  );
  assert.equal(
    shouldBypassAuth({
      NEXT_PUBLIC_APP_ENV: "production",
      E2E_BYPASS_AUTH: "1",
    }),
    false
  );
  console.log("✓ production never bypasses (unset/true/empty/invalid)");
}

function runNonProductionExplicitOptIn() {
  assert.equal(shouldBypassAuth({ NODE_ENV: "development" }), false);
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "development", E2E_BYPASS_AUTH: "" }),
    false
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "development", E2E_BYPASS_AUTH: "false" }),
    false
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "development", E2E_BYPASS_AUTH: "maybe" }),
    false
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "development", E2E_BYPASS_AUTH: "true" }),
    true
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "development", E2E_BYPASS_AUTH: "1" }),
    true
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "test", E2E_BYPASS_AUTH: "TRUE" }),
    true
  );
  assert.equal(
    shouldBypassAuth({ NODE_ENV: "development", E2E_BYPASS_AUTH: " true " }),
    true
  );
  console.log("✓ non-production requires explicit E2E_BYPASS_AUTH=true|1");
}

function runProductionDetection() {
  assert.equal(isProductionDeployment({ NODE_ENV: "production" }), true);
  assert.equal(isProductionDeployment({ NODE_ENV: "development" }), false);
  assert.equal(isProductionDeployment({ VERCEL_ENV: "preview" }), false);
  assert.equal(isProductionDeployment({ VERCEL_ENV: "production" }), true);
  console.log("✓ production deployment detection");
}

function runProtectedRouteUnauthenticated() {
  assert.equal(
    resolveAuthGate({
      pathname: "/singleMarket/abc",
      hasUser: false,
      bypassAuth: false,
    }),
    "redirect-login"
  );
  assert.equal(
    resolveAuthGate({
      pathname: "/dashboard",
      hasUser: false,
      bypassAuth: false,
    }),
    "redirect-login"
  );
  // Public routes stay open
  assert.equal(
    resolveAuthGate({
      pathname: "/",
      hasUser: false,
      bypassAuth: false,
    }),
    "allow"
  );
  assert.equal(
    resolveAuthGate({
      pathname: "/login",
      hasUser: false,
      bypassAuth: false,
    }),
    "allow"
  );
  console.log("✓ unauthenticated access redirects on protected routes");
}

function runAuthenticatedAccess() {
  assert.equal(
    resolveAuthGate({
      pathname: "/dashboard",
      hasUser: true,
      bypassAuth: false,
    }),
    "allow"
  );
  assert.equal(
    resolveAuthGate({
      pathname: "/singleMarket/xyz",
      hasUser: true,
      bypassAuth: false,
    }),
    "allow"
  );
  assert.equal(
    resolveAuthGate({
      pathname: "/login",
      hasUser: true,
      bypassAuth: false,
    }),
    "redirect-dashboard"
  );
  console.log("✓ authenticated users retain access; leave auth pages");
}

function runE2eBypassNonProduction() {
  assert.equal(
    resolveAuthGate({
      pathname: "/singleMarket/abc",
      hasUser: false,
      bypassAuth: true,
    }),
    "allow"
  );
  // Even with bypass, logged-in users still leave /login
  assert.equal(
    resolveAuthGate({
      pathname: "/login",
      hasUser: true,
      bypassAuth: true,
    }),
    "redirect-dashboard"
  );
  console.log("✓ authorized non-production E2E bypass allows protected routes");
}

function main() {
  runProductionNeverBypasses();
  runNonProductionExplicitOptIn();
  runProductionDetection();
  runProtectedRouteUnauthenticated();
  runAuthenticatedAccess();
  runE2eBypassNonProduction();
  console.log("\nAll authGate tests passed.");
}

main();
