#!/usr/bin/env bun
/**
 * Start Cloudflare Tunnel for Vowel Core
 *
 * Tunnels local Core server (Elysia + vinext) to a public URL for testing.
 * Requires Core to be running on CORE_PORT (default 3000).
 *
 * Usage:
 *   bun run scripts/start-tunnel.ts [environment] [localPort]
 *
 * Arguments:
 *   environment - Optional: testing, dev, staging, production (default: testing)
 *   localPort   - Optional tunnel target port (defaults to env-specific port)
 *
 * Prerequisites:
 *   - cloudflared installed
 *   - CLOUDFLARE_TUNNEL_TOKEN in .env (get from Cloudflare Zero Trust dashboard)
 *
 * Examples:
 *   bun run scripts/start-tunnel.ts          # testing -> testing-core.vowel.to
 *   bun run scripts/start-tunnel.ts dev      # dev -> core-dev.vowel.to
 */

import { existsSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");
const PROJECT_ROOT = join(__dirname, "..");

const env = process.argv[2] || "testing";
const parsedPort =
  process.argv[3] !== undefined ? Number.parseInt(process.argv[3], 10) : null;

const ENV_CONFIG: Record<string, { port: number; domain: string }> = {
  testing: { port: 3000, domain: "testing-core.vowel.to" },
  dev: { port: 3001, domain: "core-dev.vowel.to" },
  staging: { port: 3002, domain: "staging-core.vowel.to" },
  production: { port: 3003, domain: "core.vowel.to" },
};

if (!ENV_CONFIG[env]) {
  console.error(`❌ Unknown environment: ${env}`);
  console.error("   Valid options: testing, dev, staging, production");
  process.exit(1);
}

const config = ENV_CONFIG[env];
const hasExplicitPort = parsedPort !== null;
const explicitPort =
  hasExplicitPort &&
  Number.isInteger(parsedPort) &&
  parsedPort > 0 &&
  parsedPort <= 65535
    ? parsedPort
    : null;
if (hasExplicitPort && explicitPort === null) {
  console.error("❌ Invalid tunnel port argument.");
  console.error("   Provide a valid port number between 1 and 65535.");
  process.exit(1);
}
const localPort = explicitPort ?? config.port;

if (env === "production") {
  console.warn("⚠️  WARNING: Using production environment for local testing");
  console.warn("   Press Ctrl+C to cancel, or wait 5 seconds to continue...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

console.log("🚀 Starting Cloudflare Tunnel for Vowel Core");
console.log("=============================================");
console.log(`Environment: ${env}`);
console.log(`Port: ${localPort}`);
console.log(`Tunnel Domain: ${config.domain}`);
console.log("");

const envPath = join(PROJECT_ROOT, ".env");
if (existsSync(envPath)) {
  console.log(`📄 Loading environment from ${envPath}`);
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        const value = valueParts.join("=").replace(/^["']|["']$/g, "");
        process.env[key.trim()] = value;
      }
    }
  }
} else {
  console.warn(`⚠️  No .env file found at ${envPath}`);
}

try {
  await Bun.spawn(["cloudflared", "--version"]).exited;
} catch {
  console.error("❌ cloudflared not found.");
  console.error("   Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/");
  process.exit(1);
}

if (!process.env.CLOUDFLARE_TUNNEL_TOKEN) {
  console.error("❌ CLOUDFLARE_TUNNEL_TOKEN not set.");
  console.error(`   Add to ${envPath}:`);
  console.error("   CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token_here");
  console.error("");
  console.error("   Get token from Cloudflare Zero Trust dashboard");
  process.exit(1);
}

console.log("✅ Configuration validated");
console.log("");

const logDir = join(PROJECT_ROOT, ".logs");
mkdirSync(logDir, { recursive: true });
const tunnelLog = join(logDir, `tunnel-core-${env}.log`);

console.log("📝 Logs: " + tunnelLog);
console.log("");

try {
  const response = await fetch(`http://localhost:${localPort}/health`);
  if (!response.ok) throw new Error("Not ok");
  console.log(`✅ Core already running at http://localhost:${localPort}`);
} catch {
  console.warn(`⚠️  Core not running at http://localhost:${localPort}`);
  console.warn("   Start Core first: bun run dev (or docker run)");
  console.warn("   Tunnel will connect when Core is available.");
  console.log("");
}

console.log("🌐 Starting Cloudflare tunnel...");
console.log(`   localhost:${localPort} -> https://${config.domain}`);
console.log("");

const tunnelProcess = Bun.spawn(
  [
    "cloudflared",
    "tunnel",
    "--no-autoupdate",
    "--url",
    `http://localhost:${localPort}`,
    "run",
    "--token",
    process.env.CLOUDFLARE_TUNNEL_TOKEN!,
  ],
  {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  }
);

(async () => {
  const reader = tunnelProcess.stdout.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = new TextDecoder().decode(value);
    appendFileSync(tunnelLog, text);
    process.stdout.write(text);
  }
})();

(async () => {
  const reader = tunnelProcess.stderr.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = new TextDecoder().decode(value);
    appendFileSync(tunnelLog, text);
    process.stderr.write(text);
  }
})();

const cleanup = async () => {
  console.log("\n🛑 Shutting down tunnel...");
  tunnelProcess.kill();
  await tunnelProcess.exited;
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

await new Promise((resolve) => setTimeout(resolve, 3000));

console.log("=============================================");
console.log("✅ Tunnel Running");
console.log("=============================================");
console.log(`   Local:  http://localhost:${localPort}`);
console.log(`   Public: https://${config.domain}`);
console.log("");
console.log("🛑 Press Ctrl+C to stop");
console.log("");

await tunnelProcess.exited;
await cleanup();
