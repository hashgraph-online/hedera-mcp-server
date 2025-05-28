#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Deploying Hedera MCP Authentication System"
echo "============================================"

# Check for required environment variables
required_vars=("DB_PASSWORD" "ENCRYPTION_KEY" "SERVER_PRIVATE_KEY" "SERVER_PROFILE_TOPIC_ID")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "❌ Missing required environment variables:"
    printf '%s\n' "${missing_vars[@]}"
    echo ""
    echo "Please set these variables in your .env file or export them."
    exit 1
fi

# Build the services
echo "📦 Building Docker images..."
cd "$PROJECT_ROOT"
docker-compose -f admin-portal/docker-compose.auth.yml build

# Run database migrations
echo "🗄️  Running database migrations..."
docker-compose -f admin-portal/docker-compose.auth.yml run --rm mcp-server npm run migrate

# Start the services
echo "🚀 Starting services..."
docker-compose -f admin-portal/docker-compose.auth.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
timeout=60
elapsed=0

while [ $elapsed -lt $timeout ]; do
    if docker-compose -f admin-portal/docker-compose.auth.yml ps | grep -q "healthy"; then
        echo "✅ All services are healthy!"
        break
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    echo "   Waiting... ($elapsed/$timeout seconds)"
done

if [ $elapsed -ge $timeout ]; then
    echo "❌ Services failed to become healthy within $timeout seconds"
    docker-compose -f admin-portal/docker-compose.auth.yml logs
    exit 1
fi

# Display service URLs
echo ""
echo "🎉 Deployment complete!"
echo "======================"
echo "MCP Server: http://localhost:${FAST_MCP_PORT:-3000}"
echo "Admin Portal: http://localhost:3001"
echo "Redis: localhost:6379"
echo "PostgreSQL: localhost:5432"
echo ""
echo "View logs with: docker-compose -f admin-portal/docker-compose.auth.yml logs -f"
echo "Stop services with: docker-compose -f admin-portal/docker-compose.auth.yml down"

# Optional: Setup monitoring
if [ "$1" == "--with-monitoring" ]; then
    echo ""
    echo "📊 Setting up monitoring stack..."
    cd "$PROJECT_ROOT/admin-portal"
    
    # Create monitoring docker-compose
    cat > docker-compose.monitoring.yml << 'EOF'
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: hedera-mcp-prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alerts.yml:/etc/prometheus/rules/alerts.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - hedera-mcp-network

  grafana:
    image: grafana/grafana:latest
    container_name: hedera-mcp-grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
      GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH: /var/lib/grafana/dashboards/auth-dashboard.json
    volumes:
      - ./monitoring/grafana-dashboard.json:/var/lib/grafana/dashboards/auth-dashboard.json
      - grafana-data:/var/lib/grafana
    ports:
      - "3002:3000"
    networks:
      - hedera-mcp-network

  alertmanager:
    image: prom/alertmanager:latest
    container_name: hedera-mcp-alertmanager
    ports:
      - "9093:9093"
    networks:
      - hedera-mcp-network

  redis-exporter:
    image: oliver006/redis_exporter:latest
    container_name: hedera-mcp-redis-exporter
    environment:
      REDIS_ADDR: redis://redis:6379
    networks:
      - hedera-mcp-network

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: hedera-mcp-postgres-exporter
    environment:
      DATA_SOURCE_NAME: "postgresql://${DB_USER:-hedera}:${DB_PASSWORD}@postgres:5432/hedera_mcp?sslmode=disable"
    networks:
      - hedera-mcp-network

volumes:
  prometheus-data:
  grafana-data:

networks:
  hedera-mcp-network:
    external: true
EOF

    docker-compose -f docker-compose.monitoring.yml up -d
    
    echo "📊 Monitoring stack deployed!"
    echo "Prometheus: http://localhost:9090"
    echo "Grafana: http://localhost:3002 (admin/${GRAFANA_PASSWORD:-admin})"
    echo "AlertManager: http://localhost:9093"
fi

echo ""
echo "📝 Next steps:"
echo "1. Visit the Admin Portal at http://localhost:3001"
echo "2. Connect your Hedera wallet"
echo "3. Generate an API key"
echo "4. Use the API key in FastMCP Inspector or your application"

🦊