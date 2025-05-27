# Hedera MCP Server Admin Portal

A Next.js-based admin portal for managing credits and monitoring transactions for the Hedera MCP Server.

## Features

- 🔐 **Wallet Authentication**: Connect with HashPack or other Hedera wallets via WalletConnect
- 💳 **Credit Purchase**: Buy credits using HBAR with real-time transaction monitoring
- 📊 **Balance Display**: View current credit balance and HBAR balance
- 📜 **Transaction History**: Track all credit purchases and consumption
- 🔄 **Real-time Updates**: Automatic balance refresh and transaction status monitoring
- 🔌 **MCP Protocol Integration**: Direct communication with MCP server tools

## Architecture

The admin portal follows a clean architecture where:
- **Frontend (Next.js)**: Handles UI and user interactions
- **API Routes**: Use MCP client to call server tools directly
- **MCP Client**: Communicates with MCP server using Model Context Protocol
- **MCP Server**: Manages all database operations and business logic
- **No Direct DB Access**: The admin portal never touches the database directly

## Setup

1. **Configure Environment Variables**

```bash
cp .env.local.example .env.local
```

Update the following in `.env.local`:
- `NEXT_PUBLIC_MCP_SERVER_URL`: URL of the MCP server's SSE endpoint (default: http://localhost:3000/stream)
- `NEXT_PUBLIC_MCP_API_URL`: URL of the MCP server's HTTP API (fallback, default: http://localhost:3002/api)
- `NEXT_PUBLIC_HEDERA_NETWORK`: Network to use (testnet or mainnet)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: Your WalletConnect project ID

2. **Install Dependencies**

```bash
npm install
```

3. **Start the Portal**

```bash
npm run dev
```

The portal will be available at http://localhost:3001

## Credit Purchase Flow

1. **User Initiates Purchase**
   - Selects credit package (100, 500, 1000, or 5000 credits)
   - Clicks "Purchase" button

2. **Wallet Transaction**
   - Admin portal creates HBAR transfer transaction
   - User approves in their wallet (HashPack, etc.)
   - Transaction is sent to Hedera network

3. **Transaction Recording**
   - Portal sends transaction ID to MCP server
   - MCP server records payment with PENDING status
   - Credits are NOT allocated yet

4. **Confirmation Monitoring**
   - Portal polls MCP server for transaction status
   - MCP server monitors Hedera network for confirmation
   - Once confirmed, status changes to COMPLETED

5. **Credit Allocation**
   - MCP server allocates credits when payment is COMPLETED
   - User's balance is updated
   - Portal shows success message

## API Endpoints

All API endpoints use MCP tools to communicate with the server:

- `GET /api/credits/config` - Get server configuration (uses `get_server_info` tool)
- `GET /api/balance?accountId={id}` - Get user balance (uses `check_credit_balance` and `execute_transaction` tools)
- `GET /api/credits/history?accountId={id}` - Get transaction history (uses `get_credit_history` tool)
- `POST /api/credits/purchase` - Process credit purchase (uses `process_hbar_payment` tool)
- `POST /api/credits/purchase/confirm` - Verify payment (uses `verify_payment` tool)

## MCP Tools Used

The admin portal communicates with these MCP server tools:

- **check_credit_balance**: Get credit balance for an account
- **execute_transaction**: Query Hedera network for HBAR balance
- **get_credit_history**: Get credit transaction history
- **process_hbar_payment**: Process HBAR payment and allocate credits
- **verify_payment**: Verify payment transaction status
- **get_server_info**: Get server configuration and capabilities
- **health_check**: Check server health status

## Components

### AuthProvider
- Manages wallet connection state
- Handles authentication flow
- Provides user context to all components

### CreditPurchase
- Credit package selection UI
- Transaction creation and signing
- Real-time status monitoring

### CreditHistory
- Displays transaction history
- Shows purchase and consumption records

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## Testing with MCP Server

Use the provided test script to run both services together:

```bash
cd ..  # Go to MCP server root
./test-admin-portal.sh
```

This will start:
- MCP Server on http://localhost:3000
- HTTP API on http://localhost:3002
- Admin Portal on http://localhost:3001

## Security Considerations

- Never store private keys in the frontend
- All sensitive operations go through the MCP server
- Use environment variables for configuration
- Validate all inputs on both frontend and backend
- Use HTTPS in production

## Troubleshooting

### Cannot connect to MCP server
- Ensure MCP server is running on the correct port
- Check NEXT_PUBLIC_MCP_API_URL in .env
- Verify CORS is enabled on MCP server

### Wallet connection issues
- Ensure NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is valid
- Check network configuration matches wallet
- Try disconnecting and reconnecting

### Credits not showing after purchase
- Check transaction status on Hedera network
- Verify MCP server payment monitoring is running
- Check server logs for any errors