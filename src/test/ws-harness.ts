/**
 * Simple WebSocket connection test harness
 * Tests connecting to Vowel Engine with proper token passing
 */

// Token from a successful Core token generation
const TEST_TOKEN = process.env.TEST_TOKEN || "";
const WS_URL = process.env.WS_URL || "wss://staging.prime.vowel.to/v1/realtime";

console.log("🔌 WebSocket Connection Test Harness\n");
console.log(`URL: ${WS_URL}`);
console.log(`Token: ${TEST_TOKEN.slice(0, 30)}...\n`);

if (!TEST_TOKEN) {
  console.error("❌ Please set TEST_TOKEN environment variable");
  console.log("\nUsage:");
  console.log("  TEST_TOKEN=ek_... bun run src/test/ws-harness.ts");
  process.exit(1);
}

// Method 1: Using WebSocket subprotocol (standard approach)
console.log("Method 1: WebSocket with subprotocol...");

const ws1 = new WebSocket(
  `${WS_URL}?model=moonshotai/kimi-k2-instruct-0905`,
  [`openai-insecure-api-key.${TEST_TOKEN}`]
);

let connected1 = false;

ws1.onopen = () => {
  console.log("✅ Method 1: WebSocket connected!");
  connected1 = true;
  
  // Send session update to trigger session.created
  ws1.send(JSON.stringify({
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      voice: "Ashley",
    }
  }));
};

ws1.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`📨 Received: ${data.type}`);
  
  if (data.type === "session.created") {
    console.log("✅ Session created successfully!");
    ws1.close();
  }
};

ws1.onerror = (error) => {
  console.log(`❌ Method 1 Error: ${error}`);
};

ws1.onclose = () => {
  console.log("🔒 Method 1: Connection closed\n");
  
  // Try method 2 after method 1 closes
  setTimeout(testMethod2, 1000);
};

// Method 2: Using fetch with upgrade header
function testMethod2() {
  console.log("Method 2: Fetch with Upgrade header...");
  
  fetch(WS_URL + "?model=moonshotai/kimi-k2-instruct-0905", {
    method: "GET",
    headers: {
      "Upgrade": "websocket",
      "Connection": "Upgrade",
      "Authorization": `Bearer ${TEST_TOKEN}`,
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version": "13",
    },
  }).then((response) => {
    console.log(`📊 Method 2 Response: ${response.status} ${response.statusText}`);
    console.log("Note: Fetch Upgrade doesn't actually establish WebSocket in Bun\n");
    
    testMethod3();
  }).catch((error) => {
    console.log(`❌ Method 2 Error: ${error.message}\n`);
    testMethod3();
  });
}

// Method 3: Native Bun WebSocket client (if available)
function testMethod3() {
  console.log("Method 3: Testing token format...");
  
  // Verify token format
  if (!TEST_TOKEN.startsWith("ek_")) {
    console.log("❌ Token should start with 'ek_'");
    return;
  }
  
  console.log("✅ Token format looks correct (starts with ek_)");
  
  // Try to decode JWT payload
  try {
    const jwtPart = TEST_TOKEN.slice(3); // Remove ek_ prefix
    const payload = JSON.parse(atob(jwtPart.split(".")[1]));
    console.log("✅ JWT payload decoded successfully:");
    console.log(`   - Model: ${payload.model}`);
    console.log(`   - Voice: ${payload.voice}`);
    console.log(`   - Expires: ${new Date(payload.exp * 1000).toISOString()}`);
    
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      console.log("❌ Token has expired!");
    } else {
      console.log(`✅ Token valid for ${payload.exp - now} more seconds`);
    }
  } catch (error) {
    console.log(`⚠️  Could not decode JWT: ${error}`);
  }
  
  console.log("\n🏁 Test complete");
  console.log("\nRecommendations:");
  console.log("- Use Method 1 (subprotocol) - it's the standard approach");
  console.log("- Make sure token hasn't expired (5 minute lifetime)");
  console.log("- Check that staging.prime.vowel.to is reachable from your network");
}

// Timeout after 15 seconds
setTimeout(() => {
  console.log("\n⏱️  Test timed out");
  if (!connected1) {
    console.log("❌ Could not establish WebSocket connection");
    console.log("\nPossible causes:");
    console.log("1. Token expired - generate a new one");
    console.log("2. Network connectivity to staging.prime.vowel.to");
    console.log("3. Vowel Engine staging environment is down");
    console.log("4. Token format issue");
  }
  process.exit(connected1 ? 0 : 1);
}, 15000);
