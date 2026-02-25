#!/usr/bin/env bun
/**
 * Run Core API and UI in parallel.
 *
 * Uses the existing dev:api and dev:ui scripts. If either service is already
 * running on its expected port, it will not be started again.
 */

import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "..");
const API_PORT = Number.parseInt(process.env.CORE_API_PORT ?? "3001", 10);
const UI_PORT = Number.parseInt(process.env.CORE_UI_PORT ?? "3000", 10);

const startProcess = (command: string[]) => {
  return Bun.spawn(command, {
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
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

const apiShouldStart = !(await isServiceRunning(`http://127.0.0.1:${API_PORT}/health`));
const uiShouldStart = !(await isServiceRunning(`http://127.0.0.1:${UI_PORT}/`));

const apiProcess = apiShouldStart ? startProcess(["bun", "run", "dev:api"]) : null;
const uiProcess = uiShouldStart ? startProcess(["bun", "run", "dev:ui"]) : null;

console.log("🚀 Core API + UI stack starting");
console.log(
  `API: ${apiShouldStart ? "bun run dev:api" : `already running on http://127.0.0.1:${API_PORT}`}`
);
console.log(
  `UI:  ${uiShouldStart ? "bun run dev:ui" : `already running on http://127.0.0.1:${UI_PORT}`}`
);
console.log("");

let isShuttingDown = false;
const shutdown = async (exitCode = 0) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log("");
  console.log("🛑 Shutting down Core stack...");
  await Promise.all([
    stopProcess(apiProcess, "API"),
    stopProcess(uiProcess, "UI"),
  ]);
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (!apiProcess && !uiProcess) {
  console.log("✅ API and UI already running; keeping orchestrator alive.");
  await new Promise(() => {});
}

const exitResult = await Promise.race([
  ...(apiProcess ? [apiProcess.exited.then((code) => ({ label: "API", code }))] : []),
  ...(uiProcess ? [uiProcess.exited.then((code) => ({ label: "UI", code }))] : []),
]);

console.log(
  `\n💥 ${exitResult.label} process exited with code ${exitResult.code ?? 0}.`
);

await shutdown(
  exitResult.code === undefined || exitResult.code === null || exitResult.code === 0
    ? 0
    : exitResult.code
);

