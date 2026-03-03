/**
 * E2E Test: Full flow with WebSocket using Bun TCP socket
 * This works around Bun's WebSocket HTTP/2 limitation
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { initDb } from "../db/init";
import { createApp } from "../db/apps";
import { createApiKey } from "../db/api-keys";
import { createProviderKey } from "../db/provider-keys";
import { handleGenerateToken } from "../server/token";

describe("Vowel Core Full Flow E2E", () => {
  beforeAll(() => {
    process.env.DB_PATH = ":memory:";
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long-ok";
    initDb();
  });

  test("complete flow: app → API key → token → WebSocket connection", async () => {
    // Skip if no sndbrd API key
    if (!process.env.SNDBRD_API_KEY) {
      console.log("⚠️  Skipping: SNDBRD_API_KEY not configured");
      return;
    }

    console.log("\n🚀 Starting Full Flow E2E Test\n");

    // Step 1: Create an app
    console.log("Step 1: Creating app...");
    const app = createApp({
      name: "Full Flow Test App",
      description: "End-to-end test application",
    });
    console.log(`✅ App created: ${app.id}`);

    // Step 2: Add provider key for vowel-prime
    console.log("\nStep 2: Adding Vowel Prime provider key...");
    await createProviderKey({
      appId: app.id,
      provider: "vowel-prime",
      apiKey: process.env.SNDBRD_API_KEY,
      label: "Staging Environment",
      vowelPrimeEnvironment: "staging",
    });
    console.log("✅ Provider key added");

    // Step 3: Create API key for Bearer auth
    console.log("\nStep 3: Creating API key...");
    const apiKeyResult = await createApiKey({
      appId: app.id,
      scopes: ["mint_ephemeral"],
      label: "Test Key",
    });
    console.log(`✅ API key created: ${apiKeyResult.masked}`);

    // Step 4: Generate ephemeral token
    console.log("\nStep 4: Generating ephemeral token...");
    const tokenData = await handleGenerateToken({
      appId: app.id,
      origin: "http://localhost:5173",
      config: {
        provider: "vowel-prime",
        voiceConfig: {
          model: "moonshotai/kimi-k2-instruct-0905",
          voice: "Ashley",
          vowelPrimeConfig: {
            environment: "staging",
          },
        },
      },
    }, apiKeyResult.plaintext);

    console.log(`✅ Token generated (expires: ${tokenData.expiresAt})`);
    console.log(`   Provider: ${tokenData.provider}`);
    console.log(`   Model: ${tokenData.model}`);
    console.log(`   WebSocket URL: ${tokenData.metadata?.baseUrl}`);

    expect(tokenData.tokenName).toBeDefined();
    expect(tokenData.metadata?.baseUrl).toBeDefined();

    // Step 5: Connect to Vowel Engine via WebSocket using TCP socket
    console.log("\nStep 5: Connecting to Vowel Engine via WebSocket...");
    
    const connected = await testWebSocketViaTCP(
      tokenData.metadata!.baseUrl as string,
      tokenData.tokenName
    );

    expect(connected).toBe(true);
    console.log("\n🎉 Full flow test PASSED!");
    console.log("\n📋 Summary:");
    console.log("   ✅ App created via Core");
    console.log("   ✅ Provider key stored in Core");
    console.log("   ✅ API key generated for Bearer auth");
    console.log("   ✅ Ephemeral token generated via Core REST API");
    console.log("   ✅ Token valid for Vowel Engine WebSocket connection");
    console.log("   ✅ Session created successfully");
  }, 30000);
});

/**
 * Test WebSocket connection using Bun's TCP socket with HTTP/1.1
 * This bypasses Bun's WebSocket HTTP/2 limitation
 */
function testWebSocketViaTCP(wsUrl: string, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(wsUrl);
    console.log(`   Host: ${url.hostname}`);
    console.log(`   Token: ${token.slice(0, 40)}...\n`);

    let handshakeComplete = false;
    let receivedData = "";
    let socket: any;

    const timeout = setTimeout(() => {
      if (!handshakeComplete) {
        console.log("⏱️  Timeout: Handshake not completed");
      } else {
        console.log("⏱️  Timeout: Waiting for session.created");
      }
      socket?.end();
      resolve(false);
    }, 15000);

    Bun.connect({
      hostname: url.hostname,
      port: 443,
      tls: true,
      socket: {
        open(s) {
          socket = s;
          
          // Send HTTP/1.1 WebSocket upgrade request
          const wsKey = "dGhlIHNhbXBsZSBub25jZQ==";
          const request = [
            `GET /v1/realtime?model=moonshotai/kimi-k2-instruct-0905 HTTP/1.1`,
            `Host: ${url.hostname}`,
            `Upgrade: websocket`,
            `Connection: Upgrade`,
            `Sec-WebSocket-Key: ${wsKey}`,
            `Sec-WebSocket-Version: 13`,
            `Authorization: Bearer ${token}`,
            ``,
            ``
          ].join("\r\n");
          
          s.write(request);
        },

        data(s, data) {
          receivedData += new TextDecoder().decode(data);
          
          if (!handshakeComplete) {
            // Check for HTTP 101 response
            if (receivedData.includes("HTTP/1.1 101")) {
              console.log("✅ WebSocket handshake successful!");
              handshakeComplete = true;
              
              // Send session.update
              const message = JSON.stringify({
                type: "session.update",
                session: {
                  modalities: ["text", "audio"],
                  voice: "Ashley",
                }
              });
              
              const frame = buildWebSocketFrame(message);
              s.write(frame);
              console.log("📤 Sent: session.update");
            }
          } else {
            // Parse WebSocket frames
            const frame = parseWebSocketFrame(new Uint8Array(data));
            if (frame) {
              try {
                const msg = JSON.parse(frame.payload);
                console.log(`📨 Received: ${msg.type}`);
                
                if (msg.type === "session.created") {
                  console.log("✅ Session created!");
                  clearTimeout(timeout);
                  s.end();
                  resolve(true);
                }
              } catch (e) {
                // Binary data or non-JSON
              }
            }
          }
        },

        close() {
          if (!handshakeComplete) {
            // Closed before handshake - check what we received
            if (receivedData.includes("401")) {
              console.log("❌ Authentication failed (401)");
            } else if (receivedData.includes("404")) {
              console.log("❌ Endpoint not found (404)");
            } else {
              console.log("❌ Connection closed before handshake");
            }
            clearTimeout(timeout);
            resolve(false);
          }
        },

        error(_s, error) {
          console.log("❌ Socket error:", error);
          clearTimeout(timeout);
          resolve(false);
        },
      },
    });
  });
}

// Build a WebSocket text frame (client must mask)
function buildWebSocketFrame(payload: string): Uint8Array {
  const text = new TextEncoder().encode(payload);
  const mask = crypto.getRandomValues(new Uint8Array(4));
  
  const frame: number[] = [];
  frame.push(0x81); // FIN=1, opcode=1 (text)
  
  if (text.length < 126) {
    frame.push(0x80 | text.length);
  } else if (text.length < 65536) {
    frame.push(0x80 | 126);
    frame.push((text.length >> 8) & 0xFF);
    frame.push(text.length & 0xFF);
  } else {
    throw new Error("Payload too large");
  }
  
  frame.push(...mask);
  
  for (let i = 0; i < text.length; i++) {
    frame.push(text[i] ^ mask[i % 4]);
  }
  
  return new Uint8Array(frame);
}

// Parse WebSocket frame (simplified)
function parseWebSocketFrame(data: Uint8Array): { payload: string } | null {
  if (data.length < 2) return null;
  
  const masked = (data[1] & 0x80) !== 0;
  let length = data[1] & 0x7F;
  let offset = 2;
  
  if (length === 126) {
    length = (data[2] << 8) | data[3];
    offset = 4;
  } else if (length === 127) {
    return null; // 64-bit length not handled
  }
  
  let mask: Uint8Array | null = null;
  if (masked) {
    mask = data.slice(offset, offset + 4);
    offset += 4;
  }
  
  const payload = data.slice(offset, offset + length);
  
  if (mask) {
    const unmasked = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) {
      unmasked[i] = payload[i] ^ mask[i % 4];
    }
    return { payload: new TextDecoder().decode(unmasked) };
  }
  
  return { payload: new TextDecoder().decode(payload) };
}
