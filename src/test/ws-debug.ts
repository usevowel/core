import { DEFAULT_TEST_MODEL } from "./default-model";

/**
 * Debug WebSocket connection
 */

const TEST_TOKEN = process.env.TEST_TOKEN || "";
const WS_URL = "wss://staging.prime.vowel.to/v1/realtime";

if (!TEST_TOKEN) {
  console.error("❌ Set TEST_TOKEN environment variable");
  process.exit(1);
}

console.log("🔍 WebSocket Debug Test\n");
console.log(`URL: ${WS_URL}?model=${DEFAULT_TEST_MODEL}`);
console.log(`Token: ${TEST_TOKEN.slice(0, 50)}...\n`);

// Try connecting with detailed logging
const ws = new WebSocket(
  `${WS_URL}?model=${DEFAULT_TEST_MODEL}`,
  [`openai-insecure-api-key.${TEST_TOKEN}`]
);

console.log("⏳ WebSocket connecting...");
console.log(`   readyState: ${ws.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);

ws.onopen = () => {
  console.log("✅ onopen fired!");
  console.log(`   readyState: ${ws.readyState}`);
  
  // Send session update
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      voice: "Ashley",
    }
  }));
  console.log("📤 Sent session.update");
};

ws.onmessage = (event) => {
  console.log(`📨 onmessage: ${event.data.slice(0, 200)}...`);
  try {
    const data = JSON.parse(event.data);
    console.log(`   type: ${data.type}`);
    if (data.type === "session.created") {
      console.log("\n🎉 SUCCESS! WebSocket connected and session created!");
      ws.close();
      process.exit(0);
    }
  } catch (e) {
    console.log("   (not JSON)");
  }
};

ws.onerror = (error) => {
  console.log("❌ onerror fired:");
  console.log(`   error: ${error}`);
  console.log(`   readyState: ${ws.readyState}`);
};

ws.onclose = (event) => {
  console.log("🔒 onclose fired:");
  console.log(`   code: ${event.code}`);
  console.log(`   reason: ${event.reason}`);
  console.log(`   wasClean: ${event.wasClean}`);
  console.log(`   readyState: ${ws.readyState}`);
};

// Log state changes
const logState = () => {
  console.log(`   [${new Date().toISOString().split('T')[1].slice(0,8)}] readyState: ${ws.readyState}`);
};

const interval = setInterval(logState, 1000);

// Timeout after 10 seconds
setTimeout(() => {
  clearInterval(interval);
  console.log("\n⏱️  Test complete");
  console.log(`Final readyState: ${ws.readyState}`);
  if (ws.readyState !== 1) {
    console.log("\n❌ Connection failed");
    console.log("\nTroubleshooting:");
    console.log("1. Check if staging.prime.vowel.to is reachable:");
    console.log("   curl -I https://staging.prime.vowel.to");
    console.log("2. Check WebSocket endpoint:");
    console.log("   curl -I -H 'Upgrade: websocket' -H 'Connection: Upgrade' https://staging.prime.vowel.to/v1/realtime");
    console.log("3. The token may have expired (5 min lifetime)");
    console.log("4. There may be network restrictions preventing WebSocket connections");
    process.exit(1);
  }
}, 10000);
