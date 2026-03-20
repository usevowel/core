/**
 * Simple token generator - uses internal functions
 */

import { createApp } from "../db/apps";
import { createApiKey } from "../db/api-keys";
import { createProviderKey } from "../db/provider-keys";
import { handleGenerateToken } from "../server/token";
import { DEFAULT_TEST_MODEL } from "./default-model";

async function main() {
  console.log("🚀 Generating fresh token for WebSocket testing...\n");

  try {
    // Create app
    console.log("1. Creating app...");
    const app = createApp({ name: "WebSocket Test", description: "Testing WS" });
    console.log(`   ✅ App: ${app.id}`);

    // Add provider key
    console.log("2. Adding provider key...");
    await createProviderKey({
      appId: app.id,
      provider: "vowel-prime",
      apiKey: process.env.SNDBRD_API_KEY || "",
      vowelPrimeEnvironment: "staging",
    });
    console.log("   ✅ Provider key added");

    // Create API key
    console.log("3. Creating API key...");
    const apiKey = await createApiKey({
      appId: app.id,
      scopes: ["mint_ephemeral"],
    });
    console.log(`   ✅ API Key: ${apiKey.masked}`);

    // Generate ephemeral token
    console.log("4. Generating ephemeral token...");
    const token = await handleGenerateToken({
      appId: app.id,
      origin: "http://localhost",
      config: {
        provider: "vowel-prime",
        voiceConfig: {
          model: DEFAULT_TEST_MODEL,
          voice: "Ashley",
          vowelPrimeConfig: { environment: "staging" },
        },
      },
    }, apiKey.plaintext);

    console.log("   ✅ Token generated!");
    console.log(`\n🎉 Token (expires ${token.expiresAt}):`);
    console.log(`\n${token.tokenName}\n`);
    console.log(`Test with:`);
    console.log(`  TEST_TOKEN=${token.tokenName} bun run src/test/ws-harness.ts`);
    
    // Also run the harness automatically
    console.log("\n🧪 Running WebSocket harness now...\n");
    process.env.TEST_TOKEN = token.tokenName;
    await import("./ws-harness.ts");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
