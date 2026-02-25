#!/usr/bin/env bun
/**
 * Run Core API + UI development servers and Cloudflare Tunnel together.
 *
 * Usage:
 *   bun run scripts/dev-tunnel.ts [environment]
 *
 * Arguments:
 *   environment - Optional: testing, dev, staging, production (default: testing)
 */

import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "..");
const validEnvironments = ["testing", "dev", "staging", "production"] as const;
const API_PORT = Number.parseInt(process.env.CORE_API_PORT ?? "3001", 10);
const UI_PORT = Number.parseInt(process.env.CORE_UI_PORT ?? "3000", 10);

const env = process.argv[2] || "testing";
if (!validEnvironments.includes(env as (typeof validEnvironments)[number])) {
  console.error(`❌ Unknown environment: ${env}`);
  console.error("   Valid options: testing, dev, staging, production");
  process.exit(1);
}

const startProcess = (command: string[]) => {
  return Bun.spawn(command, {
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
};

const isServiceRunning = async (url: string): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });

    return response.status >= 100 && response.status < 600;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const stopProcess = async (
  proc: ReturnType<typeof Bun.spawn> | null,
  label: string
) => {
  if (!proc) {
    return;
  }

  if (!proc.pid) {
    return;
  }

  try {
    proc.kill();
  } catch (error) {
    console.warn(`⚠️  Unable to stop ${label} process:`, String(error));
  }

  try {
    await proc.exited;
  } catch {
    // Ignore process exit errors while shutting down.
  }
};

const apiShouldStart = !(await isServiceRunning(`http://127.0.0.1:${API_PORT}/health`));
const uiShouldStart = !(await isServiceRunning(`http://127.0.0.1:${UI_PORT}/`));

const apiProcess = apiShouldStart
  ? startProcess(["bun", "run", "dev:api"])
  : null;
const uiProcess = uiShouldStart
  ? startProcess(["bun", "run", "dev:ui"])
  : null;
let tunnelProcess: ReturnType<typeof Bun.spawn> | null = null;

let isShuttingDown = false;
const shutdown = async (exitCode = 0) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log("");
  console.log("🛑 Shutting down Core dev + tunnel...");
  await Promise.all([
    stopProcess(apiProcess, "API"),
    stopProcess(uiProcess, "UI"),
    stopProcess(tunnelProcess, "Tunnel"),
  ]);
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Give UI/API a short head-start before checking tunnel target availability.
await new Promise((resolve) => setTimeout(resolve, 1200));

tunnelProcess = Bun.spawn(
  ["bun", "run", "scripts/start-tunnel.ts", env, "3000"],
  {
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  }
);

console.log(`🌐 Dev + tunnel stack starting for environment: ${env}`);
console.log(
  `   API:      ${apiShouldStart ? "bun run dev:api" : `already running on ${API_PORT}`}`
);
console.log(
  `   UI:       ${uiShouldStart ? "bun run dev:ui" : `already running on ${UI_PORT}`}`
);
console.log("   Tunnel:   bun run scripts/start-tunnel.ts {env} 3000");
console.log("");

const exitResult = await Promise.race([
  ...(apiProcess ? [apiProcess.exited.then((code) => ({ label: "API", code }))] : []),
  ...(uiProcess ? [uiProcess.exited.then((code) => ({ label: "UI", code }))] : []),
  tunnelProcess.exited.then((code) => ({ label: "Tunnel", code })),
]);

console.log(
  `\n💥 ${exitResult.label} process exited with code ${exitResult.code ?? 0}.`
);

await shutdown(
  exitResult.code === undefined || exitResult.code === null || exitResult.code === 0
    ? 0
    : exitResult.code
);

