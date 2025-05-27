# Docker Setup for Hedera MCP Server

This directory contains optimized Docker configurations for both development and production environments.

## Features

- **Multi-stage builds** for optimized image sizes
- **Layer caching** for faster builds
- **Non-root users** for security
- **Health checks** for all services
- **Resource limits** to prevent resource exhaustion
- **Secrets management** for sensitive data
- **Database flexibility** (SQLite for dev, external DB for production)
- **Monitoring support** (Prometheus, Grafana, Datadog)
- **Load balancing** with Nginx
- **Production-ready** with external database support

## Quick Start

### Development

```bash
# Start basic services
docker compose -f docker-compose.dev.yml up

# Start with admin portal
docker compose -f docker-compose.dev.yml --profile full up

# Start with local PostgreSQL (development only)
docker compose -f docker-compose.dev.yml --profile local-db up

# Start with MCP Inspector
docker compose -f docker-compose.dev.yml --profile inspector up
```

### Production (Recommended)

1. Set up an external database service:
   - **Supabase**: Free tier available, PostgreSQL-compatible
   - **Neon**: Serverless PostgreSQL with generous free tier
   - **Cloud SQL**: Google Cloud managed PostgreSQL
   - **AWS RDS**: Amazon managed PostgreSQL
   - **Azure Database**: Microsoft managed PostgreSQL

2. Copy and configure environment variables:
```bash
cp .env.example .env
# Edit .env with your database URL and Hedera credentials
```

3. For standalone deployment (recommended):
```bash
# Single container with external database
docker compose -f docker-compose.standalone.yml up -d
```

4. For full deployment with monitoring:
```bash
# Start services
docker compose -f docker-compose.prod.yml up -d

# With monitoring
docker compose -f docker-compose.prod.yml --profile monitoring up -d
```

## Architecture

### Services

- **mcp-server**: Main MCP server application
- **admin-portal**: Next.js admin interface
- **postgres**: PostgreSQL database (development only - use external DB for production)
- **redis**: Cache and session storage
- **nginx**: Reverse proxy and load balancer
- **prometheus**: Metrics collection
- **grafana**: Metrics visualization
- **datadog**: APM and logging (optional)

### Build Optimization

The Dockerfiles use multi-stage builds:

1. **Base stage**: Common dependencies
2. **Deps stage**: Node modules installation
3. **Builder stage**: TypeScript compilation
4. **Production stage**: Minimal runtime image
5. **Development stage**: Hot reload support
6. **Test stage**: CI/CD integration

### Security

- Non-root user execution
- Docker secrets for sensitive data
- Network isolation
- Resource limits
- Security headers in Nginx

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

- `DATABASE_URL`: Database connection string (SQLite or PostgreSQL)
  - Development: `sqlite:///app/data/credits.db`
  - Production: `postgresql://user:pass@host:5432/dbname`
- `HEDERA_NETWORK`: Hedera network (testnet/mainnet)
- `HEDERA_OPERATOR_ID`: Your Hedera account ID
- `HEDERA_OPERATOR_KEY`: Your Hedera private key
- `SERVER_ACCOUNT_ID`: Server's Hedera account for payments
- `SERVER_PRIVATE_KEY`: Server's private key
- `WALLETCONNECT_PROJECT_ID`: WalletConnect project ID

### Optional Variables

- `ENABLE_METRICS`: Enable Prometheus metrics
- `SENTRY_DSN`: Sentry error tracking
- `DD_API_KEY`: Datadog API key
- `REDIS_PASSWORD`: Redis authentication

## Monitoring

### Prometheus Metrics

Access at `http://localhost:9090`

### Grafana Dashboards

Access at `http://localhost:3002` (default: admin/admin)

### Health Checks

- MCP Server: `http://localhost:3000/health`
- Admin Portal: `http://localhost:3001`
- Database: Automatic health checks via docker-compose

## Troubleshooting

### Build Issues

```bash
# Clean build cache
docker builder prune

# Rebuild without cache
docker compose build --no-cache
```

### Container Logs

```bash
# View logs
docker compose logs -f mcp-server

# View specific number of lines
docker compose logs --tail=100 mcp-server
```

### Resource Issues

```bash
# Check resource usage
docker stats

# Adjust limits in docker-compose files
```

## Production Deployment

### SSL Certificates

1. Place certificates in `docker/nginx/ssl/`
2. Update nginx.conf with your domain
3. Restart nginx service

### Scaling

```bash
# Scale MCP server instances
docker compose up -d --scale mcp-server=3
```

### Database Management

#### Development (SQLite)
```bash
# Data persists in ./data/credits.db
# Backup: Simply copy the file
cp ./data/credits.db ./data/credits.db.backup
```

#### Production (External Database)
- Use your database provider's backup features
- Supabase: Automatic daily backups
- Cloud SQL: Automated backup policies
- Most providers offer point-in-time recovery

## Best Practices

1. **Always use specific image tags in production**
2. **Never commit .env files**
3. **Regularly update base images**
4. **Monitor resource usage**
5. **Set up log rotation**
6. **Use Docker secrets for sensitive data**
7. **Implement proper backup strategies**