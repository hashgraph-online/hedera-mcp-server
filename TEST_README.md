# Hedera MCP Server End-to-End Tests

This document describes the comprehensive end-to-end test suite for the Hedera MCP Server.

## Test Categories

### 1. HBAR Payment Flow Tests (`hbar-payment-e2e.test.ts`)
Tests the complete HBAR payment and credit allocation flow:
- Processing HBAR payments and allocating credits
- Multiple payments from same account
- Payment limits enforcement (minimum/maximum)
- Credit consumption via MCP tools
- Insufficient credits handling
- Payment monitoring automation

**Run:** `npm run test:hbar-payment`

### 2. MCP STDIO Transport Tests (`mcp-stdio-e2e.test.ts`)
Tests the stdio transport mode for MCP:
- Server initialization and info retrieval
- Tool listing and execution
- Error handling
- Concurrent requests
- Message ordering
- Stream lifecycle management

**Run:** `npm run test:mcp-stdio`

### 3. MCP HTTP/SSE Transport Tests (`mcp-http-e2e.test.ts`)
Tests the HTTP and Server-Sent Events transport:
- HTTP endpoint functionality
- JSON-RPC validation
- Concurrent HTTP requests
- Large payload handling
- CORS support
- SSE connections
- Batch requests

**Run:** `npm run test:mcp-http`

### 4. Hedera Tools Credit Tests (`hedera-tools-credits-e2e.test.ts`)
Tests all Hedera tools with credit consumption:
- Free operations (health_check, get_server_info)
- Low-cost operations (1-2 credits)
- Medium-cost operations (3-5 credits)
- High-cost operations (10-15 credits)
- Transaction history tracking
- Concurrent operation handling

**Run:** `npm run test:hedera-tools`

### 5. Credit System Edge Cases (`credits-edge-cases-e2e.test.ts`)
Tests edge cases and error conditions:
- Zero/negative payment amounts
- Min/max payment limits
- Fractional HBAR amounts
- Duplicate transaction IDs
- Race conditions
- Invalid inputs
- Overflow protection

**Run:** `npm run test:edge-cases`

### 6. PostgreSQL Integration Tests (`postgres-e2e.test.ts`)
Tests PostgreSQL-specific functionality:
- Database initialization
- Concurrent operations
- Transaction atomicity
- Large data volumes
- Data persistence

**Run:** `RUN_POSTGRES_TESTS=true npm run test:postgres`

## Running All E2E Tests

Run all end-to-end tests:
```bash
npm run test:e2e
```

## Environment Variables

Required for real Hedera network testing:
- `SERVER_ACCOUNT_ID`: Hedera account to receive payments
- `SERVER_PRIVATE_KEY`: Private key for server account

Optional:
- `DATABASE_URL`: Database connection string (defaults to SQLite)
- `HEDERA_NETWORK`: Network to use (testnet/mainnet)
- `CREDITS_CONVERSION_RATE`: HBAR to credits rate (default: 1000)
- `RUN_POSTGRES_TESTS`: Set to 'true' to run PostgreSQL tests

## Test Infrastructure

### Test Utilities (`test-utils.ts`)
Provides:
- Test environment setup/teardown
- Test account creation
- HBAR payment simulation
- Balance checking
- Database cleanup

### MCP Transport Utils (`mcp-transport-utils.ts`)
Provides:
- MCP client for stdio/HTTP transports
- Server process management
- Request/response handling
- Message queuing

### Extended Credit Managers
- `SqliteCreditManagerExtended`: SQLite with payment monitoring
- `PostgresCreditManagerExtended`: PostgreSQL with payment monitoring

## HBAR to Credits Model

Default conversion rate: **1 HBAR = 1,000 credits**

This provides:
- Fine-grained pricing (0.001 HBAR minimum)
- Reasonable costs for operations
- Simple mental model for users

Operation costs:
- Free: health_check, get_server_info
- 1 credit: get_account_balance, get_account_info
- 2 credits: refresh_profile, read_topic_messages
- 3 credits: submit_topic_message
- 5 credits: generate_transaction_bytes
- 10 credits: schedule_transaction
- 15 credits: execute_transaction

## Docker Support

PostgreSQL tests use Docker:
```bash
docker run -d --name hedera-mcp-test-postgres \
  -p 5433:5432 \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=hedera_mcp_test \
  postgres:15-alpine
```

## Troubleshooting

1. **Tests hanging**: Use `--detectOpenHandles --forceExit` flags
2. **Database errors**: Ensure migrations are run
3. **Network errors**: Check Hedera network connectivity
4. **Docker errors**: Ensure Docker daemon is running

## Future Enhancements

1. Add WebSocket transport tests
2. Implement real Mirror Node integration tests
3. Add performance benchmarks
4. Create load testing scenarios
5. Add multi-node testing