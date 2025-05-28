#!/bin/bash

echo "🚀 Hedera MCP Server - First Run Setup"
echo "======================================"

# Check if .env exists
if [ ! -f .env ]; then
    if [ -f env.example ]; then
        echo "📋 Creating .env from env.example..."
        cp env.example .env
        echo "✅ Created .env file"
        echo "⚠️  Please edit .env with your Hedera credentials before running the server"
    else
        echo "❌ No env.example found. Please create a .env file manually."
        exit 1
    fi
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

# Create data directory for SQLite
mkdir -p data
echo "✅ Data directory ready"

# Setup database
echo "🗄️  Setting up database..."
npm run db:setup

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your Hedera credentials"
echo "2. Run 'npm run dev' to start the server"
echo ""
echo "For PostgreSQL development:"
echo "- Run 'docker compose -f docker-compose.dev.yml --profile local-db up -d'"
echo "- Then 'npm run dev:pg'"