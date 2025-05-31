# Hedera MCP Server

A production-ready **Model Context Protocol (MCP) server** that brings Hedera hashgraph operations to AI agents and LLMs through natural language. Execute transactions, check balances, manage tokens, and more - all by simply describing what you want to do in plain English.

> **🚀 New to MCP?** The Model Context Protocol lets AI assistants like Claude interact with external systems. This server makes Hedera network operations available to any MCP-compatible AI tool. It also supports HCS-10 for direct agent-to-agent communication on Hedera.

## ✨ What Can You Do?

- **Natural Language Transactions**: "Transfer 5 HBAR from my account to 0.0.123456"
- **Token Operations**: "Create a new token called MyToken with symbol MTK"
- **Smart Contracts**: "Deploy a contract and call the mint function"
- **Account Management**: "Check my account balance and transaction history"
- **Scheduled Transactions**: "Schedule a transfer for next week"
- **Credit System**: Pay-per-use model with HBAR payments
- **Secure Authentication**: API key-based auth with Hedera signature verification, managed via MCP tools.
- **HCS-10 Agent Registration**: Register and operate as an HCS-10 compliant agent.

## 🚀 Quick Start (5 Minutes)

### Automated Setup (Recommended)

```bash
git clone https://github.com/hashgraph-online/hedera-mcp-server.git
cd hedera-mcp-server
cp env.example .env # Create .env file from example
# Edit .env with your Hedera credentials (see below)
npm install # Install dependencies
npm run db:setup # Setup the database (SQLite by default)
npm run dev:full # Start the full development server (recommended)
```

Edit the `.env` file. Key fields to update:
```bash
# Required: Your Hedera account (get free testnet HBAR at portal.hedera.com)
HEDERA_OPERATOR_ID=0.0.YOUR_ACCOUNT_ID
HEDERA_OPERATOR_KEY=your-private-key-here

# Required: Server account for HBAR payments and HCS-10 Identity
SERVER_ACCOUNT_ID=0.0.YOUR_SERVER_ACCOUNT_ID
SERVER_PRIVATE_KEY=your_server_private_key_here

# Required: OpenAI API key for natural language processing
OPENAI_API_KEY=sk-your-openai-key-here

# Optional: Network (testnet is default)
HEDERA_NETWORK=testnet

# Optional: Authentication (enabled by default, API_KEY_ENCRYPTION_KEY also needed for production)
REQUIRE_AUTH=true
API_KEY_ENCRYPTION_KEY=your-strong-secret-key-for-encrypting-api-keys # Set for production

# Optional: Enable HCS-10 Agent Mode (default is true)
ENABLE_HCS10=true
```

Start the server using the full development setup:
```bash
npm run dev:full
```

🎉 **That's it!** Your MCP server is running. Key services:
- **MCP Server (SSE)**: `http://localhost:3000/stream` (Primary endpoint for MCP clients using Server-Sent Events)
- **MCP Server (JSON-RPC/HTTP POST)**: `http://localhost:3000/` (For MCP clients using plain HTTP POST requests)
- **Metrics API**: `http://localhost:3003/metrics` (Prometheus metrics, if `ENABLE_METRICS=true`. Port `AUTH_API_PORT` in `.env`)
- **Admin Portal**: `http://localhost:3001` (Web interface for credit management, user lookup, etc. `ADMIN_PORTAL_URL` in `.env`)

### Manual Setup

<details>
<summary>Click to expand manual installation steps</summary>

```bash
# 1. Clone and install dependencies
git clone https://github.com/hashgraph-online/hedera-mcp-server.git
cd hedera-mcp-server
npm install

# 2. Configure environment
cp env.example .env
# Edit .env with your credentials (see example above, ensure OPENAI_API_KEY is set)

# 3. Setup database and start
npm run db:setup    # One-time database setup
npm run dev:full    # Start the server, admin portal, and other services
```

</details>

## 🔧 Available Tools & Commands

The server provides a suite of powerful MCP tools for Hedera operations. These are accessed via an MCP client connected to the main MCP server on port 3000 (`http://localhost:3000/` for JSON-RPC or `http://localhost:3000/stream` for SSE). Key tools include:

### 🏥 Health & System
- **`health_check`**: Check server status, connectivity, and HCS-10 registration status.
- **`get_server_info`**: Get server configuration, capabilities, and list of available tools.
- **`refresh_profile`**: (If HCS-10 enabled) Update server's HCS-10 profile registration on Hedera.

### 💰 Transaction Operations
- **`execute_transaction`**: Execute any Hedera transaction based on a natural language request (requires OpenAI).
  ```json
  { "name": "execute_transaction", "arguments": { "request": "Transfer 10 HBAR to 0.0.123456 with memo 'payment'" } }
  ```
- **`schedule_transaction`**: Schedule transactions for future execution based on a natural language request (requires OpenAI).
  ```json
  { "name": "schedule_transaction", "arguments": { "request": "Schedule a token transfer for next Friday" } }
  ```
- **`generate_transaction_bytes`**: Generate unsigned transaction bytes from a natural language request (requires OpenAI).
  ```json
  { "name": "generate_transaction_bytes", "arguments": { "request": "Create transaction bytes for deploying a smart contract" } }
  ```
- **`execute_query`**: Perform read-only queries (balances, token info, NFT details, etc.) using natural language (requires OpenAI).
  ```json
  { "name": "execute_query", "arguments": { "request": "Get my account balance and token list" } }
  ```

### 💳 Credit & Payment System
- **`purchase_credits`**: Initiates a credit purchase, returning an unsigned HBAR transfer transaction.
- **`verify_payment`**: Verifies an HBAR payment transaction and allocates credits to the user's account.
- **`check_payment_status`**: Checks the status of a payment transaction.
- **`get_payment_history`**: Retrieves the payment history for an account.
- **`check_credit_balance`**: Checks the current credit balance for an account.
- **`get_credit_history`**: Retrieves the credit usage history for an account.
- **`process_hbar_payment`**: (Admin) Manually process HBAR payments and allocate credits.

### 🔐 Authentication Tools (Called via MCP on Port 3000)
- **`request_auth_challenge`**: Requests an authentication challenge for a Hedera account to initiate API key generation.
- **`verify_auth_signature`**: Verifies a signed challenge (provided by `request_auth_challenge`) and returns an API key.
- **`get_api_keys`**: Views active API keys for the authenticated account.
- **`rotate_api_key`**: Creates a new API key and revokes the old one for the authenticated account.
- **`revoke_api_key`**: Permanently disables a specific API key for the authenticated account.

### ⚙️ Configuration & Management
- **`get_pricing_configuration`**: View current operation costs and pricing tiers.

_(Note: The `get_server_info` tool provides the most up-to-date list of tools and their schemas.)_

## 📖 Usage Examples

### With Claude Desktop (MCP Client using stdio)

Ensure `MCP_TRANSPORT=stdio` in your `.env` when configuring for Claude Desktop.
Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "hedera": {
      "command": "node",
      "args": ["/path/to/hedera-mcp-server/dist/index.js"], // Adjust path as needed
      "env": {
        "HEDERA_OPERATOR_ID": "0.0.YOUR_ACCOUNT",
        "HEDERA_OPERATOR_KEY": "your-private-key",
        "SERVER_ACCOUNT_ID": "0.0.YOUR_SERVER_ACCOUNT",
        "SERVER_PRIVATE_KEY": "your_server_private_key",
        "OPENAI_API_KEY": "sk-your-key", // OpenAI key is required
        "MCP_TRANSPORT": "stdio", // Important for Claude Desktop
        "REQUIRE_AUTH": "false" // For ease of local development with Claude Desktop
      }
    }
  }
}
```

Then in Claude Desktop:
```
You: "Check my Hedera account balance on testnet using account 0.0.YOUR_ACCOUNT"
Claude: [Uses health_check and execute_query tools] "Your account 0.0.YOUR_ACCOUNT has X.Y HBAR"

You: "Transfer 5 HBAR to 0.0.789012 with memo 'coffee payment' from 0.0.YOUR_ACCOUNT"
Claude: [Uses execute_transaction] "Transaction successful! TX ID: 0.0.YOUR_ACCOUNT@timestamp"
```

### Via MCP Protocol (HTTP JSON-RPC with Authentication)

API keys are obtained by calling MCP tools on the main server (port 3000).

First, get an API key:
```bash
# 1. Request challenge (using MCP tool via JSON-RPC POST to root path on port 3000)
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-challenge-1",
    "method": "tools/call",
    "params": {
      "name": "request_auth_challenge",
      "arguments": {
        "hederaAccountId": "0.0.123456"
      }
    }
  }'
# This will return a JSON object with `result` containing a JSON string. Parse `result` to get: 
# { "challengeId": "...", "challenge": "...", "expiresAt": "..." }

# 2. Sign the `challenge` string from the response with your Hedera private key.

# 3. Verify signature and get API key (using MCP tool via JSON-RPC POST to root path on port 3000)
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-verify-1",
    "method": "tools/call",
    "params": {
      "name": "verify_auth_signature",
      "arguments": {
        "challengeId": "the-challenge-id-from-step-1-response",
        "signature": "your-hex-encoded-signature-of-the-challenge"
      }
    }
  }'
# The `result` in the response (a JSON string) will contain your API key if successful: 
# { "apiKey": "...", "accountId": "...", ... }
```

Then use the API key for subsequent MCP requests to the main server (port 3000):
```bash
# Execute transaction (example using JSON-RPC POST to root path)
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-from-previous-step" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-mcp-tx-1",
    "method": "tools/call",
    "params": {
      "name": "execute_transaction",
      "arguments": {
        "request": "Transfer 1 HBAR to 0.0.123456",
        "accountId": "0.0.123456" // Account making the request (should match API key or be authorized)
      }
    }
  }'
```

### With Admin Portal

Ensure the server is running with `npm run dev:full`.

Visit:
- **Admin Portal**: `http://localhost:3001` (web interface for credit management, user lookup, etc. Check `ADMIN_PORTAL_URL` in `.env`)
- **MCP Server (SSE)**: `http://localhost:3000/stream`
- **MCP Server (JSON-RPC via POST)**: `http://localhost:3000/`
- **Metrics API**: `http://localhost:3003/metrics` (Prometheus metrics if `ENABLE_METRICS=true`. Check `AUTH_API_PORT` in `.env`)
- **MCP Inspector**: URL and port for the MCP inspector can be configured via `NEXT_PUBLIC_MCP_INSPECTOR_URL` and `MCP_INSPECTOR_PORT` in `.env`. Default is often `http://127.0.0.1:6274` if enabled.

## 🔐 Authentication & Credits

### API Key Authentication

When `REQUIRE_AUTH=true` (default), an API key is needed for most MCP tool calls to the server on port 3000.

1.  **Request Challenge**: Use the `request_auth_challenge` MCP tool (via port 3000) with your Hedera Account ID.
2.  **Sign Challenge**: Sign the received `challenge` string using the private key associated with your Hedera Account ID.
3.  **Verify & Get API Key**: Use the `verify_auth_signature` MCP tool (via port 3000) with the `challengeId` and your hex-encoded `signature`. If successful, an API key is returned.
4.  **Use API Key**: Include the API key in the `Authorization: Bearer your-api-key` header for MCP requests to the main server (port 3000).

The `API_KEY_ENCRYPTION_KEY` in your `.env` file is **critical** for production. It encrypts API keys stored in the database. Set this to a strong, unique secret.

### Credit System

Operations consume credits, purchased with HBAR. Natural language processing tools (like `execute_transaction`, `execute_query`) require OpenAI and will have associated credit costs.

| Operation Category    | Cost Range    | Examples                                                               |
| :-------------------- | :------------ | :--------------------------------------------------------------------- |
| **Free Operations**   | 0 credits     | `health_check`, `get_server_info`, `check_credit_balance` (for self) |
| **Auth Operations**   | 0-5 credits   | `request_auth_challenge`, `verify_auth_signature`                      |
| **Basic Operations**  | 2-10 credits  | `refresh_profile`, `get_api_keys`, `get_payment_history`             |
| **Standard Queries**  | 10-50 credits | `execute_query` (cost varies by complexity, requires OpenAI)           |
| **Transactions**      | 50+ credits   | `execute_transaction`, `schedule_transaction` (cost varies, requires OpenAI) |

**Dynamic Pricing**: Base rate: `CREDITS_CONVERSION_RATE` (e.g., 1000) credits per 1 USD worth of HBAR. The HBAR cost for credits fluctuates based on the HBAR/USD exchange rate. Operation costs are in `src/db/seed-data/default-pricing-tiers.ts`.

Purchase credits:
1.  **Call `purchase_credits` tool**: Provide `payerAccountId`, `amountInHbar`, and optionally `beneficiaryAccountId` and `memo`. It returns `unsignedTransactionBytes` for an HBAR transfer.
    ```json
    { 
      "name": "purchase_credits", 
      "arguments": {
        "payerAccountId": "0.0.YOUR_PAYING_ACCOUNT",
        "amountInHbar": 10.0,
        "beneficiaryAccountId": "0.0.YOUR_BENEFICIARY_ACCOUNT" 
      }
    }
    ```
2.  **Sign and submit** this transaction to the Hedera network.
3.  **Call `verify_payment` tool**: Provide the `transactionId` of your HBAR payment. Credits are then allocated.
    ```json
    { 
      "name": "verify_payment", 
      "arguments": { "transactionId": "0.0.YOUR_PAYING_ACCOUNT@timestamp.nanoseconds" }
    }
    ```

## 🗄️ Database Support

### SQLite (Default - Perfect for Development)
Used by default with `npm run dev` or `npm run dev:full` if `DATABASE_URL` points to a SQLite file.
```bash
# .env setting for SQLite:
DATABASE_URL=sqlite://./data/credits.db
```

### PostgreSQL (Production Recommended)
For production or team development.
```bash
# Option 1: Docker (using provided docker-compose files like docker-compose.postgres.yml or part of dev:full)
# docker-compose.yml might include a PostgreSQL service.
# Example command if using a dedicated postgres compose file:
# docker compose -f docker-compose.postgres.yml up -d

# Option 2: Local or Hosted PostgreSQL
# Update .env to point to your PostgreSQL instance:
# DATABASE_URL=postgresql://user:pass@localhost:5432/hedera_mcp_db
# Then run the server (e.g., `npm run dev:pg` or `npm run dev:full` which might use this .env config)

# npm run dev:pg (script to specifically target PostgreSQL if available)
```

### Database Commands
```bash
npm run db:setup      # Initialize database (creates tables based on schema, seeds data)
npm run db:seed       # Reload seed data (pricing tiers, etc.)
npm run db:clear      # Clear all data from the database (use with caution!)
npm run db:push       # (Drizzle Kit) Push schema changes from src/db/schema.ts to the database
npm run db:studio     # (Drizzle Kit) Open Drizzle Studio (web GUI for database management)
npm run migrate       # Run pending migrations based on files in drizzle migration folder
npm run migrate:generate # Generate new migration files based on schema changes
```

## 🧪 Testing

### Run Tests
```bash
npm test                    # Run all Jest tests (unit and some integration)
npm run test:integration    # Run integration tests (requires DB and Hedera connection)
npm run test:auth           # Run authentication specific tests
npm run test:coverage       # Run tests and generate a coverage report
```

### Test Requirements
For integration tests, ensure `.env` is configured with valid Hedera testnet credentials and `OPENAI_API_KEY`:
```bash
# In your .env file or as environment variables:
HEDERA_OPERATOR_ID=0.0.YOUR_TESTNET_ACCOUNT
HEDERA_OPERATOR_KEY=YOUR_TESTNET_PRIVATE_KEY
SERVER_ACCOUNT_ID=0.0.YOUR_SERVER_TESTNET_ACCOUNT
SERVER_PRIVATE_KEY=YOUR_SERVER_TESTNET_PRIVATE_KEY
OPENAI_API_KEY=sk-YOUR_VALID_OPENAI_KEY
```

### Test Specific Features
(Refer to `package.json` scripts section for the most up-to-date list of specific test commands like `test:credits`, `test:mcp-e2e`, etc.)
```bash
# Example: Test credit system (integration)
npm run test:credits

# Enable debug output for tests:
DEBUG=* npm test
```

## 🐳 Docker Support

Development and production Docker setups are managed via `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.prod.yml`, and specific override files like `docker-compose.postgres.yml`.

### Development with Docker
```bash
# Ensure your .env file is configured, especially for Hedera keys and OPENAI_API_KEY.

# Start development environment with SQLite (often a profile in docker-compose.dev.yml)
npm run docker:dev:sqlite # Uses SQLite, mounts local code

# Start development environment with PostgreSQL (often a profile in docker-compose.dev.yml)
npm run docker:dev # Uses PostgreSQL, mounts local code

# Start full development stack (server, admin portal, local db, inspector, etc.)
npm run docker:dev:full

# Stop and remove containers for a specific compose setup (e.g., dev)
docker compose -f docker-compose.dev.yml down -v
```

### Production Deployment
```bash
# 1. Ensure .env is configured for production (mainnet, strong API_KEY_ENCRYPTION_KEY, etc.)
# 2. Build production images (if not using pre-built ones from a registry)
# npm run docker:build # Might be a general build script, or specific to prod compose

# 3. Run production setup using docker-compose.prod.yml or a similar main compose file.
# This typically includes the app, database, and potentially other services like Redis.
npm run docker:prod # Uses docker-compose.prod.yml (or equivalent main compose file)

# Example for a full stack with specific compose files (if not covered by npm run docker:prod)
# docker compose -f docker-compose.yml -f docker-compose.postgres.yml -f docker-compose.redis.yml up -d
```

### Environment Variables for Docker
Your `.env` file is the primary source for environment variables when using `docker-compose`. For production, manage secrets securely (e.g., Docker secrets, cloud provider secret managers).
Key variables for Docker (ensure these are in `.env`):
```bash
DATABASE_URL=postgresql://mcpuser:mcppass@db:5432/mcpserver # 'db' is often the service name in docker-compose
HEDERA_NETWORK=mainnet # or testnet
HEDERA_OPERATOR_ID=0.0.YOUR_ACCOUNT
HEDERA_OPERATOR_KEY=your-private-key
SERVER_ACCOUNT_ID=0.0.YOUR_SERVER_ACCOUNT
SERVER_PRIVATE_KEY=your_server_private_key
OPENAI_API_KEY=sk-your-openai-key # Required
REQUIRE_AUTH=true
API_KEY_ENCRYPTION_KEY=a-very-strong-and-unique-secret-key # CRITICAL for production
# ... other variables from env.example, ensure PORT, AUTH_API_PORT are suitable for Docker environment.
```

## ⚡ Development Workflows

### Standard Development (using `dev:full` with SQLite or PostgreSQL)
This is the most common and recommended workflow.
```bash
cp env.example .env   # Configure .env (Hedera keys, OPENAI_API_KEY, DB connection)
npm install
npm run db:setup      # Initialize database (SQLite or PostgreSQL based on .env) and seed data
npm run dev:full      # Starts all services: server, admin portal, metrics API, often with DB via Docker.
                      # Auto-reloads on code changes.
# In another terminal:
npm test              # Run tests as you develop
```
Access points:
-   Admin Portal: `http://localhost:3001`
-   MCP Server (SSE): `http://localhost:3000/stream`
-   MCP Server (JSON-RPC): `http://localhost:3000/`
-   Metrics API: `http://localhost:3003/metrics`

### Available Scripts (See `package.json` for full list and details)
```bash
# Development
npm run dev                 # Start server (SQLite by default, uses src/scripts/dev-server.ts)
npm run dev:pg              # Start server (PostgreSQL, uses src/scripts/dev-server.ts with specific DATABASE_URL)
npm run dev:full            # Start all services (server, portal, etc., uses src/scripts/dev-full.ts)
npm run admin               # Start admin portal only

# Database (Drizzle ORM & Drizzle Kit)
npm run db:setup            # Initialize database (creates schema, seeds data)
npm run db:seed             # Seed data only
npm run db:push             # Push schema changes to DB
npm run db:studio           # Open Drizzle Studio GUI
npm run migrate             # Run pending database migrations
npm run migrate:generate    # Create new migration files from schema changes

# Testing
npm test                    # Run all tests
npm run test:integration    # Integration tests

# Production
npm run build               # Build for production (TypeScript compilation to dist/)
npm run start               # Start production server (uses built files from dist/)
npm run docker:prod         # Run production Docker setup (uses docker-compose.prod.yml or similar)

# Utilities
npm run typecheck           # Check TypeScript types
npm run lint                # Lint code using ESLint
npm run format              # Format code using Prettier
```

## 🔧 Configuration Reference

### Key Environment Variables (from `env.example`)

| Variable                  | Default (`env.example`)           | Description                                                                                                |
| :------------------------ | :-------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | `postgresql://mcpuser:mcppass@localhost:5432/mcpserver` | Database connection string (supports `sqlite:` or `postgresql:`)                                       |
| `HEDERA_NETWORK`          | `testnet`                         | Hedera network (`testnet` or `mainnet`)                                                                    |
| `HEDERA_OPERATOR_ID`      | `0.0.123456`                      | Your primary Hedera account ID (for operations, fee payments if not overridden)                            |
| `HEDERA_OPERATOR_KEY`     | `your_operator_private_key_here`  | Private key for `HEDERA_OPERATOR_ID`                                                                       |
| `SERVER_ACCOUNT_ID`       | `0.0.789012`                      | Server's Hedera account for receiving payments and HCS-10 identity. **Must be funded.**                      |
| `SERVER_PRIVATE_KEY`      | `your_server_account_private_key_here` | Private key for `SERVER_ACCOUNT_ID`.                                                                     |
| `OPENAI_API_KEY`          | `(must be set)`                   | **Required.** OpenAI API key for natural language processing features.                                         |
| `ENABLE_HCS10`            | `true`                            | Enable HCS-10 agent registration and functionality.                                                        |
| `AGENT_NAME`              | `Hedera MCP Server`               | Name for HCS-10 agent profile.                                                                             |
| `MCP_TRANSPORT`           | `both`                            | MCP transport mode (`http`, `sse`, `stdio`, `both`). `both` enables HTTP and SSE for the main server.        |
| `PORT`                    | `3000`                            | Main server port for MCP (HTTP/SSE at `/` and `/stream`).                                                      |
| `REQUIRE_AUTH`            | `true`                            | Enable API key authentication for MCP tools.                                                               |
| `API_KEY_ENCRYPTION_KEY`  | `(must be set for prod)`          | **CRITICAL for Production**: Secret key for encrypting API keys. Set a strong random key.                  |
| `AUTH_API_PORT`           | `3003`                            | Port for the separate **Metrics API only** (`/metrics`).                                                     |
| `CREDITS_CONVERSION_RATE` | `1000`                            | Base credits per 1 USD equivalent of HBAR (used for dynamic pricing).                                      |
| `LOG_LEVEL`               | `info`                            | Logging level (`debug`, `info`, `warn`, `error`).                                                          |
| `ADMIN_PORTAL_URL`        | `http://localhost:3001`           | URL for the admin portal.                                                                                  |

_Refer to `env.example` for a comprehensive list of all available environment variables and their descriptions._

### Database URLs
```bash
# SQLite (development, testing)
DATABASE_URL=sqlite://./data/credits.db
DATABASE_URL=sqlite://:memory: # In-memory, for some tests

# PostgreSQL (production, staging)
# Example for default docker-compose PostgreSQL service named 'db':
DATABASE_URL=postgresql://mcpuser:mcppass@db:5432/mcpserver 
# For external PostgreSQL:
# DATABASE_URL=postgresql://user:password@your-postgres-host:port/your-database-name
```

### Authentication Configuration
-   `REQUIRE_AUTH=true`: Enables API key authentication for MCP tool calls on the main server (port 3000).
-   `API_KEY_ENCRYPTION_KEY`: **Must be set to a strong secret in production.** Used to encrypt API keys at rest.
-   Authentication flow (challenge, signature verification, key issuance) is handled via MCP tools like `request_auth_challenge` and `verify_auth_signature` on port 3000.
-   The server on `AUTH_API_PORT` (default 3003) is **only for Prometheus metrics** at the `/metrics` endpoint.

Optional Redis integration for rate limiting and anomaly detection (see `env.example` for `REDIS_URL`).

## 🚨 Troubleshooting

### Common Issues

**❌ "Database not found" / "relation ... does not exist" / "table ... has no column named ..."**
```bash
# 1. Ensure DATABASE_URL in .env is correct for your setup (SQLite file path or PostgreSQL connection string).
# 2. Run database setup and migrations:
npm run db:setup    # Initializes schema and seeds data. Good first step.
# If you've changed src/db/schema.ts:
npm run migrate:generate # Create new Drizzle migration files
npm run migrate          # Apply pending migrations to your database
# For simpler dev with Drizzle Kit (can be destructive if schema changes are complex):
# npm run db:push
```

**❌ "Port already in use" (e.g., for 3000, 3001, 3003)**
```bash
# Find and kill process on the port. Example for port 3000:
# macOS / Linux: sudo lsof -ti:3000 | sudo xargs kill -9
# Windows: netstat -ano | findstr :3000 (find PID), then taskkill /PID <PID> /F
# Or, change the conflicting port in .env (e.g., PORT=3005) and restart.
```

**❌ "Invalid private key format" / "Error: private key ... does not match public key ..."**
-   Ensure `HEDERA_OPERATOR_KEY` and `SERVER_PRIVATE_KEY` are correct, validly formatted (usually PKCS8 DER-encoded hex for Ed25519), and correspond to their respective Account IDs on the Hedera network specified by `HEDERA_NETWORK`.

**❌ "INSUFFICIENT_ACCOUNT_BALANCE" / "INSUFFICIENT_PAYER_BALANCE"**
-   Ensure `HEDERA_OPERATOR_ID` and `SERVER_ACCOUNT_ID` are funded with sufficient HBAR on the target `HEDERA_NETWORK`.
-   For testnet, use a faucet like https://portal.hedera.com/.

**❌ "OPENAI_API_KEY environment variable is required" / OpenAI API errors**
-   `OPENAI_API_KEY` **is required** and must be set in your `.env` file.
-   Verify the key is valid, has credits/quota on OpenAI, and necessary permissions.

**❌ "Authentication required" / 401 Unauthorized errors for MCP calls (port 3000)**
-   If `REQUIRE_AUTH=true`, ensure you provide a valid API key: `Authorization: Bearer your-api-key` header.
-   Obtain an API key via the MCP authentication tools (`request_auth_challenge`, `verify_auth_signature`) on port 3000.
-   Ensure `API_KEY_ENCRYPTION_KEY` is correctly set in `.env` (especially if keys were created with a different one or it's missing).
-   For development, you can temporarily set `REQUIRE_AUTH=false` in `.env` to bypass auth for the MCP server.

**❌ Docker container issues (won't start, errors in logs)**
```bash
docker compose -f <your-compose-file.yml> logs <service-name> # e.g., docker compose -f docker-compose.dev.yml logs app
docker system prune -a --volumes # Drastic: Clean ALL unused Docker data.
docker compose -f <your-compose-file.yml> down -v # Stop and remove volumes for the project.
docker compose -f <your-compose-file.yml> up --build # Rebuild and start.
```

### Debug Mode
Set `LOG_LEVEL=debug` in `.env` for detailed server logs.
```bash
# Start server with debug logging enabled in .env
npm run dev:full

# For more specific library debugging (e.g., fastmcp, database queries):
# DEBUG=fastmcp* npm run dev:full
```

### Reset Everything (Local Development Only - Destructive)
```bash
# 1. Stop server and any Docker containers.
# 2. Clear database:
#    - SQLite: Delete the .db file (e.g., data/credits.db).
#    - Dockerized PostgreSQL: docker compose -f <your-pg-compose-file.yml> down -v
# 3. Remove dependencies and build artifacts:
rm -rf node_modules dist coverage .turbo
npm run db:clear # If this script handles specific DB clearing logic beyond file deletion
# 4. Reinstall and reinitialize:
npm install
npm run db:setup
npm run dev:full # Start fresh
```

## 📚 API Reference

### MCP Tools Reference

Tools are called via an MCP client using JSON-RPC (POST to `http://localhost:3000/`) or SSE (connected to `http://localhost:3000/stream`).
Use the `get_server_info` tool to get a live list of tools and their Zod schemas for parameters.

<details>
<summary>Examples of key tool schemas (parameters are in `arguments` object)</summary>

**`execute_transaction`** (Natural Language to Transaction - Requires OpenAI)
```json
{
  "name": "execute_transaction",
  "arguments": {
    "request": "Transfer 5 HBAR from my account to 0.0.123456 and set memo 'payment for goods'",
    "accountId": "0.0.YOUR_ACTING_ACCOUNT" // Optional: Account context for the transaction
  }
}
```

**`execute_query`** (Natural Language to Query - Requires OpenAI)
```json
{
  "name": "execute_query",
  "arguments": {
    "request": "What is the balance of account 0.0.98765?",
    "accountId": "0.0.YOUR_CALLING_ACCOUNT" // Optional: Account context
  }
}
```

**`request_auth_challenge`** (Get challenge for API key generation)
```json
{
  "name": "request_auth_challenge",
  "arguments": {
    "hederaAccountId": "0.0.123456" // Hedera account ID requesting authentication
  }
}
```

**`verify_auth_signature`** (Verify signed challenge, get API key)
```json
{
  "name": "verify_auth_signature",
  "arguments": {
    "challengeId": "the-uuid-challenge-id-received",
    "signature": "hex-encoded-signature-of-the-challenge-string"
  }
}
```

**`purchase_credits`** (Initiate credit purchase)
```json
{
  "name": "purchase_credits",
  "arguments": {
    "payerAccountId": "0.0.PAYER_ACCOUNT",
    "amountInHbar": 10.5,
    "beneficiaryAccountId": "0.0.BENEFICIARY_ACCOUNT", // Optional, defaults to payer
    "memo": "Credits purchase" // Optional
  }
}
```

**`check_credit_balance`**
```json
{
  "name": "check_credit_balance",
  "arguments": {
    // "accountId": "0.0.TARGET_ACCOUNT" // Optional, defaults to authenticated API key's account.
  }
}
```

</details>

### HTTP API Endpoints

**Main MCP Server (Port: `3000` or as per `PORT` in `.env`)**

*   **JSON-RPC MCP Endpoint**
    *   **URL**: `/` (e.g., `http://localhost:3000/`)
    *   **Method**: `POST`
    *   **Headers**: `Content-Type: application/json`, `Authorization: Bearer your-api-key` (if `REQUIRE_AUTH=true`)
    *   **Body**: Standard JSON-RPC 2.0 for `tools/call` (see MCP client examples).
*   **SSE (Server-Sent Events) MCP Endpoint**
    *   **URL**: `/stream` (e.g., `http://localhost:3000/stream`)
    *   **Method**: `GET`
    *   **Authentication**: API key often passed as query parameter `?apiKey=your-api-key` or handled by initial handshake, depending on `FastMCP` client/server.
*   **Health Check**
    *   **URL**: `/health` (e.g., `http://localhost:3000/health`)
    *   **Method**: `GET`
    *   **Response**: `{"status": "healthy", ...}`

**Metrics API Server (Port: `3003` or as per `AUTH_API_PORT` in `.env`)**

*   `/metrics`: `GET`. Prometheus-formatted metrics (if `ENABLE_METRICS=true`).

_Note: All authentication operations (requesting challenges, verifying signatures, managing API keys) are handled via MCP tools on the main server (port 3000)._

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

### Quick Contribution Guide

1.  **Fork** the repository.
2.  **Create** your feature branch: `git checkout -b feature/my-new-feature`.
3.  **Implement** your changes following project coding standards.
4.  **Add tests** (unit, integration) for your changes.
5.  **Ensure all tests pass**: `npm test` (and `npm run test:integration` if applicable).
6.  **Lint and format**: `npm run lint` and `npm run format`.
7.  **Commit** your changes: `git commit -m 'feat: Add some amazing feature'`. (Consider Conventional Commits).
8.  **Push** to the branch: `git push origin feature/my-new-feature`.
9.  Create a new **Pull Request** against the `main` or relevant development branch.

### Development Standards
-   JSDoc comments for all public functions and complex logic.
-   TypeScript strict mode utilized.
-   Comprehensive tests for new features and bug fixes.
-   Drizzle ORM for database interactions; schema in `src/db/schema.ts`.
-   Adherence to ESLint and Prettier configurations (run `npm run lint -- --fix` and `npm run format`).

## 📄 License

MIT License - see the [LICENSE](./LICENSE) file for details.

## 🔗 Links

-   **GitHub Repository**: https://github.com/hashgraph-online/hedera-mcp-server
-   **GitHub Issues**: https://github.com/hashgraph-online/hedera-mcp-server/issues
-   **Hedera Portal**: https://portal.hedera.com/ (Get testnet HBAR, explore network)
-   **FastMCP Library**: https://github.com/punkpeye/fastmcp
-   **Hashgraph Online**: https://hashgraphonline.com

---

**Made with ❤️ by the Hashgraph Online**

*Bringing Hedera to AI, one conversation at a time* 🚀