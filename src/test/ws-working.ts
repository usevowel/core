/**
 * Working WebSocket test using Bun TCP socket
 * This bypasses Bun's WebSocket HTTP/2 issue
 */

import { createApp } from "../db/apps";
import { createApiKey } from "../db/api-keys";
import { createProviderKey } from "../db/provider-keys";
import { handleGenerateToken } from "../server/token";
import { DEFAULT_TEST_MODEL } from "./default-model";

async function main() {
  console.log("🚀 WebSocket Connection Test (via TCP)\n");

  try {
    // Setup - create app, provider key, API key, and token
    const app = createApp({ name: "TCP WS Test" });
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
    const tokenData = await handleGenerateToken({
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

    console.log(`✅ Token generated: ${tokenData.tokenName.slice(0, 40)}...`);
    console.log(`   Expires: ${tokenData.expiresAt}\n`);

    // Create WebSocket connection via TCP
    console.log("🔌 Connecting to wss://staging.prime.vowel.to/v1/realtime...\n");
    
    let handshakeComplete = false;
    let receivedData = "";

    const socket = await Bun.connect({
      hostname: "staging.prime.vowel.to",
      port: 443,
      tls: true,
      socket: {
        open(socket) {
          // Send WebSocket upgrade request
          const key = "dGhlIHNhbXBsZSBub25jZQ=="; // Fixed key for testing
          const request = [
            `GET /v1/realtime?model=${DEFAULT_TEST_MODEL} HTTP/1.1`,
            "Host: staging.prime.vowel.to",
            "Upgrade: websocket",
            "Connection: Upgrade",
            `Sec-WebSocket-Key: ${key}`,
            "Sec-WebSocket-Version: 13",
            `Authorization: Bearer ${tokenData.tokenName}`,
            "",
            ""
          ].join("\r\n");
          
          socket.write(request);
        },

        data(socket, data) {
          receivedData += new TextDecoder().decode(data);
          
          if (!handshakeComplete) {
            // Check for HTTP 101 response
            if (receivedData.includes("HTTP/1.1 101")) {
              console.log("✅ WebSocket handshake successful!");
              console.log("   Server accepted the connection\n");
              handshakeComplete = true;
              
              // Send session.update to trigger session.created
              // WebSocket text frame: FIN=1, opcode=1 (text), mask=1 (client must mask)
              const message = JSON.stringify({
                type: "session.update",
                session: {
                  modalities: ["text", "audio"],
                  voice: "Ashley",
                }
              });
              
              // Build WebSocket text frame
              const frame = buildWebSocketFrame(message);
              socket.write(frame);
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
                  console.log("\n🎉 SUCCESS! Full connection established!");
                  console.log("   - Token validated");
                  console.log("   - WebSocket upgraded");
                  console.log("   - Session created");
                  socket.end();
                  process.exit(0);
                }
              } catch (e) {
                console.log("📨 Received (non-JSON):", frame.payload.slice(0, 100));
              }
            }
          }
        },

        close(socket) {
          if (!handshakeComplete) {
            console.log("❌ Connection closed before handshake");
          }
        },

        error(socket, error) {
          console.log("❌ Socket error:", error);
        },
      },
    });

    // Timeout
    setTimeout(() => {
      if (!handshakeComplete) {
        console.log("\n⏱️  Timeout - handshake not completed");
        console.log("Received data:");
        console.log(receivedData.slice(0, 500));
      } else {
        console.log("\n⏱️  Timeout - waiting for session.created");
      }
      socket.end();
      process.exit(1);
    }, 10000);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Build a WebSocket text frame (client must mask)
function buildWebSocketFrame(payload: string): Uint8Array {
  const text = new TextEncoder().encode(payload);
  const mask = crypto.getRandomValues(new Uint8Array(4));
  
  let frame: number[] = [];
  
  // First byte: FIN=1, opcode=1 (text)
  frame.push(0x81);
  
  // Second byte: MASK=1, length
  if (text.length < 126) {
    frame.push(0x80 | text.length);
  } else if (text.length < 65536) {
    frame.push(0x80 | 126);
    frame.push((text.length >> 8) & 0xFF);
    frame.push(text.length & 0xFF);
  } else {
    throw new Error("Payload too large");
  }
  
  // Mask key
  frame.push(...mask);
  
  // Masked payload
  for (let i = 0; i < text.length; i++) {
    frame.push(text[i] ^ mask[i % 4]);
  }
  
  return new Uint8Array(frame);
}

// Parse WebSocket frame (simplified)
function parseWebSocketFrame(data: Uint8Array): { payload: string } | null {
  if (data.length < 2) return null;
  
  const fin = (data[0] & 0x80) !== 0;
  const opcode = data[0] & 0x0F;
  const masked = (data[1] & 0x80) !== 0;
  let length = data[1] & 0x7F;
  
  let offset = 2;
  
  if (length === 126) {
    length = (data[2] << 8) | data[3];
    offset = 4;
  } else if (length === 127) {
    // 64-bit length - not handled for simplicity
    return null;
  }
  
  let mask: Uint8Array | null = null;
  if (masked) {
    mask = data.slice(offset, offset + 4);
    offset += 4;
  }
  
  const payload = data.slice(offset, offset + length);
  
  // Unmask if needed
  let unmasked = payload;
  if (mask) {
    unmasked = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) {
      unmasked[i] = payload[i] ^ mask[i % 4];
    }
  }
  
  return { payload: new TextDecoder().decode(unmasked) };
}

main();
