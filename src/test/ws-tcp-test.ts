/**
 * WebSocket test with proper HTTP/1.1 handling
 */

import { createApp } from "../db/apps";
import { createApiKey } from "../db/api-keys";
import { createProviderKey } from "../db/provider-keys";
import { handleGenerateToken } from "../server/token";

async function main() {
  console.log("🚀 Generating token and testing WebSocket...\n");

  try {
    // Create app
    const app = createApp({ name: "WS Test" });
    await createProviderKey({
      appId: app.id,
      provider: "vowel-prime",
      apiKey: process.env.SNDBRD_API_KEY || "",
      vowelPrimeEnvironment: "staging",
    });
    const apiKey = await createApiKey({
      appId: app.id,
      scopes: ["mint_ephemeral"],
    });
    const token = await handleGenerateToken({
      appId: app.id,
      origin: "http://localhost",
      config: {
        provider: "vowel-prime",
        voiceConfig: {
          model: "moonshotai/kimi-k2-instruct-0905",
          voice: "Ashley",
          vowelPrimeConfig: { environment: "staging" },
        },
      },
    }, apiKey.plaintext);

    console.log(`✅ Token: ${token.tokenName.slice(0, 50)}...\n`);

    // Test WebSocket with manual HTTP/1.1 upgrade first
    console.log("Testing connection...");
    
    // Use Bun's TCP socket to do a manual WebSocket handshake with HTTP/1.1
    const socket = await Bun.connect({
      hostname: "staging.prime.vowel.to",
      port: 443,
      tls: true,
      socket: {
        data(socket, data) {
          const response = new TextDecoder().decode(data);
          console.log("📨 Response:");
          console.log(response.slice(0, 500));
          socket.end();
        },
        open(socket) {
          console.log("✅ TCP connected");
          
          // Send HTTP/1.1 WebSocket upgrade request
          const request = [
            "GET /v1/realtime?model=moonshotai/kimi-k2-instruct-0905 HTTP/1.1",
            "Host: staging.prime.vowel.to",
            "Upgrade: websocket",
            "Connection: Upgrade",
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
            "Sec-WebSocket-Version: 13",
            `Authorization: Bearer ${token.tokenName}`,
            "",
            ""
          ].join("\r\n");
          
          socket.write(request);
          console.log("📤 Sent upgrade request");
        },
        close(socket) {
          console.log("🔒 Connection closed");
        },
        error(socket, error) {
          console.log("❌ Error:", error);
        },
      },
    });

    // Also try the standard WebSocket
    console.log("\n\n📡 Trying standard WebSocket...");
    const ws = new WebSocket(
      `wss://staging.prime.vowel.to/v1/realtime?model=moonshotai/kimi-k2-instruct-0905`,
      [`openai-insecure-api-key.${token.tokenName}`]
    );

    ws.onopen = () => {
      console.log("✅ WebSocket connected!");
      ws.send(JSON.stringify({ type: "session.update", session: {} }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log(`📨 ${data.type}`);
      if (data.type === "session.created") {
        console.log("🎉 SUCCESS!");
        ws.close();
      }
    };

    ws.onerror = (e) => console.log("❌ WS Error:", e);
    ws.onclose = (e) => console.log(`🔒 WS Closed: ${e.code} ${e.reason}`);

    setTimeout(() => {
      console.log("\n⏱️  Test complete");
      process.exit(0);
    }, 10000);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
