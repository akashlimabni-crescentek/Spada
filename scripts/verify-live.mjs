/**
 * Run unit checks, required LIVE API tests, and Playwright against
 * a reachable backend and frontend.
 *
 * Fails if either service is not ready. Does not kill servers it did not start.
 *
 *   node scripts/verify-live.mjs
 *
 * From frontend: npm run test:verify
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = join(root, "backend/Spada_Backend/fastify-backend");
const frontendDir = join(root, "frontend");
const apiBase = (process.env.SPADA_API_BASE ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const webBase = (process.env.SPADA_E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const started = [];

async function isReady(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
}

async function waitUntilReady(url, label, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReady(url)) {
      console.log(`ready: ${label} ${url}`);
      return;
    }
    await delay(1_000);
  }
  throw new Error(`${label} was not ready at ${url} after ${timeoutMs}ms`);
}

function startDev(cwd, label) {
  const child = spawn("npm", ["run", "dev"], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  started.push({ child, label });
  console.log(`started ${label} (pid ${child.pid})`);
}

function stopStarted() {
  for (const { child, label } of started) {
    if (!child.pid) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
      console.log(`stopped ${label} (pid ${child.pid})`);
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  }
}

function run(cmd, args, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code} in ${cwd}`));
    });
  });
}

async function main() {
  const apiUrl = `${apiBase}/api/v1/markets/metrics`;
  const apiUp = await isReady(apiUrl);
  const webUp = await isReady(webBase);
  if (!apiUp) startDev(backendDir, "backend");
  if (!webUp) startDev(frontendDir, "frontend");
  await waitUntilReady(apiUrl, "backend", 90_000);
  await waitUntilReady(webBase, "frontend", 90_000);

  console.log("\n== backend unit + mocked contracts ==");
  await run("npm", ["test"], backendDir);
  console.log("\n== backend LIVE API (fails if the API is down) ==");
  await run("npm", ["run", "test:integration"], backendDir);
  console.log("\n== frontend unit ==");
  await run("npm", ["test"], frontendDir);
  console.log("\n== Playwright ==");
  await run("npm", ["run", "test:e2e"], frontendDir, {
    SPADA_API_BASE: apiBase,
    SPADA_E2E_BASE_URL: webBase,
  });
  console.log("\nverify-live: all required checks passed");
}

main()
  .catch((err) => {
    console.error("\nverify-live FAILED:", err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => {
    stopStarted();
  });
