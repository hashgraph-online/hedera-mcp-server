#!/bin/sh

# Health check script for MCP server
# Checks if the server is responding and database is connected

set -e

# Health check endpoint
HEALTH_URL="http://localhost:${PORT:-3000}/health"
DB_HEALTH_URL="http://localhost:${PORT:-3000}/health/db"

# Function to check HTTP endpoint
check_endpoint() {
    local url=$1
    local name=$2
    
    if command -v curl >/dev/null 2>&1; then
        if curl -f -s --max-time 5 "$url" >/dev/null 2>&1; then
            echo "✅ $name check passed"
            return 0
        else
            echo "❌ $name check failed"
            return 1
        fi
    elif command -v wget >/dev/null 2>&1; then
        if wget -q --timeout=5 -O /dev/null "$url" >/dev/null 2>&1; then
            echo "✅ $name check passed"
            return 0
        else
            echo "❌ $name check failed"
            return 1
        fi
    else
        echo "❌ Neither curl nor wget available for health check"
        return 1
    fi
}

# Check if server is responding
echo "🔍 Checking MCP server health..."
if ! check_endpoint "$HEALTH_URL" "Server health"; then
    exit 1
fi

# Check if server can connect to database
echo "🗄️  Checking database connectivity..."
if ! check_endpoint "$DB_HEALTH_URL" "Database health"; then
    exit 1
fi

# Check if server process is actually running
if ! pgrep -f "node.*dist/index.js" >/dev/null 2>&1; then
    echo "❌ MCP server process not found"
    exit 1
fi

echo "✅ All health checks passed"
exit 0 