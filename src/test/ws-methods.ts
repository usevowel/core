import { DEFAULT_TEST_MODEL } from "./default-model";

/**
 * Debug WebSocket connection - try different auth methods
 */

const TEST_TOKEN = process.env.TEST_TOKEN || "";
const WS_URL = "wss://staging.prime.vowel.to/v1/realtime";

if (!TEST_TOKEN) {
  console.error("❌ Set TEST_TOKEN environment variable");
  process.exit(1);
}

console.log("🔍 WebSocket Auth Method Test\n");

// Method 1: Subprotocol with openai-insecure-api-key prefix
function testMethod1() {
  return new Promise((resolve) => {
    console.log("\n📡 Method 1: Subprotocol with openai-insecure-api-key...");
    const ws = new WebSocket(
      `${WS_URL}?model=${DEFAULT_TEST_MODEL}`,
      [`openai-insecure-api-key.${TEST_TOKEN}`]
    );

    ws.onopen = () => {
      console.log("✅ Method 1: Connected!");
      ws.close();
      resolve(true);
    };

    ws.onerror = (error) => {
      console.log(`❌ Method 1: Error - ${error}`);
    };

    ws.onclose = (event) => {
      console.log(`🔒 Method 1: Closed - code=${event.code}, reason=${event.reason}`);
      resolve(false);
    };

    setTimeout(() => {
      console.log("⏱️  Method 1: Timeout");
      ws.close();
      resolve(false);
    }, 5000);
  });
}

// Method 2: Subprotocol without prefix (just the token)
function testMethod2() {
  return new Promise((resolve) => {
    console.log("\n📡 Method 2: Subprotocol with just token...");
    const ws = new WebSocket(
      `${WS_URL}?model=${DEFAULT_TEST_MODEL}`,
      [TEST_TOKEN]
    );

    ws.onopen = () => {
      console.log("✅ Method 2: Connected!");
      ws.close();
      resolve(true);
    };

    ws.onerror = (error) => {
      console.log(`❌ Method 2: Error - ${error}`);
    };

    ws.onclose = (event) => {
      console.log(`🔒 Method 2: Closed - code=${event.code}, reason=${event.reason}`);
      resolve(false);
    };

    setTimeout(() => {
      console.log("⏱️  Method 2: Timeout");
      ws.close();
      resolve(false);
    }, 5000);
  });
}

// Method 3: Subprotocol with additional accepted protocol
function testMethod3() {
  return new Promise((resolve) => {
    console.log("\n📡 Method 3: Subprotocol with token + json...");
    const ws = new WebSocket(
      `${WS_URL}?model=${DEFAULT_TEST_MODEL}`,
      [`openai-insecure-api-key.${TEST_TOKEN}`, "json"]
    );

    ws.onopen = () => {
      console.log("✅ Method 3: Connected!");
      ws.close();
      resolve(true);
    };

    ws.onerror = (error) => {
      console.log(`❌ Method 3: Error - ${error}`);
    };

    ws.onclose = (event) => {
      console.log(`🔒 Method 3: Closed - code=${event.code}, reason=${event.reason}`);
      resolve(false);
    };

    setTimeout(() => {
      console.log("⏱️  Method 3: Timeout");
      ws.close();
      resolve(false);
    }, 5000);
  });
}

// Method 4: No subprotocol, token in query param
function testMethod4() {
  return new Promise((resolve) => {
    console.log("\n📡 Method 4: Token in query param...");
    const ws = new WebSocket(
      `${WS_URL}?model=${DEFAULT_TEST_MODEL}&token=${encodeURIComponent(TEST_TOKEN)}`
    );

    ws.onopen = () => {
      console.log("✅ Method 4: Connected!");
      ws.close();
      resolve(true);
    };

    ws.onerror = (error) => {
      console.log(`❌ Method 4: Error - ${error}`);
    };

    ws.onclose = (event) => {
      console.log(`🔒 Method 4: Closed - code=${event.code}, reason=${event.reason}`);
      resolve(false);
    };

    setTimeout(() => {
      console.log("⏱️  Method 4: Timeout");
      ws.close();
      resolve(false);
    }, 5000);
  });
}

async function main() {
  const results = [];
  
  results.push(await testMethod1());
  results.push(await testMethod2());
  results.push(await testMethod3());
  results.push(await testMethod4());
  
  console.log("\n📊 Results:");
  console.log(`  Method 1 (openai-insecure-api-key): ${results[0] ? '✅' : '❌'}`);
  console.log(`  Method 2 (just token): ${results[1] ? '✅' : '❌'}`);
  console.log(`  Method 3 (token + json): ${results[2] ? '✅' : '❌'}`);
  console.log(`  Method 4 (query param): ${results[3] ? '✅' : '❌'}`);
  
  if (!results.some(r => r)) {
    console.log("\n💡 All methods failed. Possible reasons:");
    console.log("   - Token expired (5 min lifetime)");
    console.log("   - Network connectivity issues");
    console.log("   - Vowel Engine staging is down");
    console.log("   - The subprotocol format doesn't match what sndbrd expects");
    console.log("\n   The browser you tested with may use a different WebSocket implementation");
    console.log("   or the token format in the browser was slightly different.");
  }
}

main();
