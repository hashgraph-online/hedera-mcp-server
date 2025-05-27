#!/bin/bash

echo "🚀 Starting MCP Server with HTTP API and Admin Portal..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Creating from env.example..."
    cp env.example .env
    echo "📝 Please update .env with your Hedera credentials and run this script again."
    exit 1
fi

# Install dependencies if needed
echo "📦 Installing MCP server dependencies..."
npm install

echo "📦 Installing admin portal dependencies..."
cd admin-portal
npm install
cd ..

# Start the MCP server in the background
echo "🚀 Starting MCP server with HTTP API..."
npm run dev &
MCP_PID=$!

# Wait for server to start
echo "⏳ Waiting for MCP server to start..."
sleep 5

# Check if server is running
if ! kill -0 $MCP_PID 2>/dev/null; then
    echo "❌ MCP server failed to start"
    exit 1
fi

# Start the admin portal
echo "🚀 Starting admin portal..."
cd admin-portal
npm run dev &
ADMIN_PID=$!

echo ""
echo "✅ Services started successfully!"
echo ""
echo "📍 MCP Server: http://localhost:3000"
echo "📍 HTTP API: http://localhost:3002"
echo "📍 Admin Portal: http://localhost:3001"
echo ""
echo "💡 To stop all services, press Ctrl+C"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $MCP_PID 2>/dev/null
    kill $ADMIN_PID 2>/dev/null
    exit 0
}

# Set up trap to cleanup on Ctrl+C
trap cleanup SIGINT

# Wait for processes
wait