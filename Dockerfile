# syntax=docker/dockerfile:1.5
# Optimized Unified Dockerfile for Hedera MCP Server & Admin Portal

# ============= Global ARGs =============
ARG NODE_VERSION=22-alpine

# ============= Base stage =============
FROM node:${NODE_VERSION} AS base
# Install essential tools
RUN apk add --no-cache dumb-init libc6-compat
WORKDIR /app

# ============= Dependencies stage =============
FROM base AS deps

# Copy package files for both projects
COPY package*.json ./
COPY admin-portal/package*.json ./admin-portal/

# Install production dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev && \
    cp -R node_modules /tmp/prod_node_modules

# Install admin portal production dependencies
WORKDIR /app/admin-portal
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev && \
    cp -R node_modules /tmp/admin_prod_node_modules

# Install all dependencies for building
WORKDIR /app
RUN --mount=type=cache,target=/root/.npm \
    npm ci

WORKDIR /app/admin-portal
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ============= Server builder =============
FROM deps AS server-builder
COPY tsconfig.json drizzle*.config.ts ./
COPY src/ ./src/
WORKDIR /app
RUN npm run build

# ============= Admin builder =============
FROM deps AS admin-builder
WORKDIR /app/admin-portal

# Copy admin source
COPY admin-portal/ ./

# Build args for client-side env vars
ARG NEXT_PUBLIC_HEDERA_NETWORK=testnet
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3002
ARG NEXT_PUBLIC_APP_URL=http://localhost:3001

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============= Production runtime =============
FROM base AS production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install PM2 for process management
RUN npm install -g pm2@latest

# Copy server files
WORKDIR /app
COPY --from=deps --chown=nodejs:nodejs /tmp/prod_node_modules ./node_modules
COPY --from=server-builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=server-builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=server-builder --chown=nodejs:nodejs /app/drizzle*.config.ts ./

# Copy migrations
COPY --chown=nodejs:nodejs src/db/migrations ./src/db/migrations

# Copy admin portal
COPY --from=deps --chown=nodejs:nodejs /tmp/admin_prod_node_modules ./admin-portal/node_modules
COPY --from=admin-builder --chown=nodejs:nodejs /app/admin-portal/public ./admin-portal/public
COPY --from=admin-builder --chown=nodejs:nodejs /app/admin-portal/.next/standalone ./admin-portal/
COPY --from=admin-builder --chown=nodejs:nodejs /app/admin-portal/.next/static ./admin-portal/.next/static

# Copy PM2 ecosystem config
COPY --chown=nodejs:nodejs ecosystem.config.js ./

# Create required directories
RUN mkdir -p /app/data /app/logs /app/audit-logs && \
    chown -R nodejs:nodejs /app

# Copy and setup healthcheck
COPY --chown=nodejs:nodejs docker/healthcheck.sh ./healthcheck.sh
RUN chmod +x ./healthcheck.sh

USER nodejs
EXPOSE 3000 3001

# Single process manager for both apps
ENTRYPOINT ["dumb-init", "--"]
CMD ["pm2-runtime", "start", "ecosystem.config.js"]

# ============= Development stage =============
FROM deps AS development
ENV NODE_ENV=development

# Install dev tools globally
RUN npm install -g tsx nodemon concurrently @dotenvx/dotenvx

# Keep source code mounted via volumes
WORKDIR /app

# Create non-root user for development
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/data /app/logs && \
    chown -R nodejs:nodejs /app

# Development script
RUN cat > /app/dev.sh << 'EOF'
#!/bin/sh
echo "🚀 Starting development servers..."

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Start both services with hot reload
exec concurrently \
  --names "server,admin,tsc" \
  --prefix "[{name}]" \
  --prefix-colors "blue,green,yellow" \
  --handle-input \
  --kill-others \
  "nodemon --watch src --ext ts,json --exec 'tsx src/index.ts' --legacy-watch" \
  "cd admin-portal && npm run dev" \
  "tsc --watch --preserveWatchOutput --noEmit"
EOF

RUN chmod +x /app/dev.sh

USER nodejs
EXPOSE 3000 3001 9229

CMD ["/app/dev.sh"]

# ============= Test stage =============
FROM deps AS test
ENV NODE_ENV=test
COPY . .
RUN npm run typecheck && \
    npm run lint && \
    npm run test