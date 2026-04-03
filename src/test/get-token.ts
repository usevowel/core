/**
 * Simple token generator using fetch
 */

import { DEFAULT_TEST_MODEL } from "./default-model";

async function main() {
  console.log("🚀 Generating fresh token for WebSocket testing...\n");

  const API_URL = "http://localhost:3000";

  try {
    // Create app
    console.log("1. Creating app...");
    const appRes = await fetch(`${API_URL}/trpc/apps.create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "0": { name: "WebSocket Test", description: "Testing WS connection" }
      }),
    });
    const appData = await appRes.json();
    const appId = appData.result?.data?.json?.id;
    console.log(`   ✅ App: ${appId}`);

    // Add provider key
    console.log("2. Adding provider key...");
    await fetch(`${API_URL}/trpc/providerKeys.create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "0": {
          appId,
          provider: "engine",
          apiKey: process.env.VOWEL_ENGINE_API_KEY,
          vowelPrimeEnvironment: "staging",
        }
      }),
    });
    console.log("   ✅ Provider key added");

    // Create API key
    console.log("3. Creating API key...");
    const keyRes = await fetch(`${API_URL}/trpc/apiKeys.create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "0": { appId, scopes: ["mint_ephemeral"] }
      }),
    });
    const keyData = await keyRes.json();
    const apiKey = keyData.result?.data?.json?.plaintext;
    console.log(`   ✅ API Key: ${keyData.result?.data?.json?.masked}`);

    // Generate ephemeral token
    console.log("4. Generating ephemeral token...");
    const tokenRes = await fetch(`${API_URL}/vowel/api/generateToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        appId,
        origin: "http://localhost",
        config: {
          provider: "engine",
          voiceConfig: {
            model: DEFAULT_TEST_MODEL,
            voice: "Ashley",
            vowelPrimeConfig: { environment: "staging" },
          },
        },
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`HTTP ${tokenRes.status}`);
    }

    const token = await tokenRes.json();
    console.log("   ✅ Token generated!");
    console.log(`\n🎉 Token (expires ${token.expiresAt}):`);
    console.log(`\n${token.tokenName}\n`);
    console.log(`Test with:`);
    console.log(`  TEST_TOKEN=${token.tokenName} bun run src/test/ws-harness.ts`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
