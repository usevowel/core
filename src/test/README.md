# Vowel Core Tests

## E2E Tests

### Prerequisites

1. Install dependencies:
```bash
bun install
```

2. Set up environment:
```bash
# Tests use in-memory SQLite by default, but you can configure:
export TEST_API_URL=http://localhost:3000  # If server is running
export VOWEL_ENGINE_API_KEY=your-key  # For full WebSocket tests
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/test/e2e.test.ts

# Run with coverage
bun test --coverage
```

### Test Structure

- **e2e.test.ts** - Tests tRPC procedures (apps, apiKeys, providerKeys) and REST token endpoint
- **client-connection.test.ts** - Full flow test: app → API key → token → WebSocket connection

### Test Coverage

✅ **tRPC Procedures:**
- `apps.list/get/create/update/delete`
- `apiKeys.list/create/delete`
- `providerKeys.list/create/delete`

✅ **REST Token Endpoint:**
- Bearer auth validation
- Token generation with the self-hosted engine backend
- Scope enforcement

✅ **Full Integration:**
- Create app via tRPC
- Create provider key via tRPC
- Create API key via tRPC
- Generate token via REST
- Connect to Vowel Engine via WebSocket

### Expected Results

**If VOWEL_ENGINE_API_KEY is configured:**
- All tests should pass including WebSocket connection
- Full end-to-end flow verified

**If VOWEL_ENGINE_API_KEY is not configured:**
- tRPC tests will pass
- Token generation tests will be skipped
- WebSocket connection test will be skipped

### Troubleshooting

**Test fails with "Invalid API key":**
- Check that ENCRYPTION_KEY is set correctly
- Verify the database was initialized

**Token generation fails:**
- Check VOWEL_ENGINE_API_KEY is valid
- Verify network connectivity to staging.prime.vowel.to
- Check that provider key was created with correct environment

**WebSocket connection fails:**
- Vowel Engine staging environment may be down
- Token may be expired (generated with 5-min expiry)
- Check browser console for CORS issues (if testing from UI)
