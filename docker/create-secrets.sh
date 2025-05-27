#!/bin/bash
set -e

# Script to create Docker secrets for production deployment
# Usage: ./create-secrets.sh

echo "🔐 Creating Docker secrets for Hedera MCP Server..."

# Check if running in Docker Swarm mode
if ! docker info 2>/dev/null | grep -q "Swarm: active"; then
    echo "❌ Docker is not in Swarm mode. Initializing Swarm..."
    docker swarm init || echo "Swarm already initialized or failed to initialize"
fi

# Function to create or update a secret
create_secret() {
    local secret_name=$1
    local secret_value=$2
    
    # Remove existing secret if it exists
    docker secret rm "$secret_name" 2>/dev/null || true
    
    # Create new secret
    echo -n "$secret_value" | docker secret create "$secret_name" -
    echo "✅ Created secret: $secret_name"
}

# Load environment variables
if [ -f .env ]; then
    source .env
else
    echo "❌ .env file not found. Please create it from .env.example"
    exit 1
fi

# Create secrets
echo "Creating Hedera operator key secret..."
create_secret "hedera_operator_key" "$HEDERA_OPERATOR_KEY"

echo "Creating server private key secret..."
create_secret "server_private_key" "$SERVER_PRIVATE_KEY"

echo "Creating database password secret..."
create_secret "db_password" "$POSTGRES_PASSWORD"

echo "Creating WalletConnect project ID secret..."
create_secret "walletconnect_project_id" "$WALLETCONNECT_PROJECT_ID"

echo ""
echo "✅ All secrets created successfully!"
echo ""
echo "To list secrets: docker secret ls"
echo "To remove a secret: docker secret rm <secret_name>"
echo ""
echo "⚠️  Remember to remove sensitive values from .env file after creating secrets"