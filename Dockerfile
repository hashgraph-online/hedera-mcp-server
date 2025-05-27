# syntax=docker/dockerfile:1.5

# ============= Base stage for common dependencies =============
FROM node:22-alpine AS base
RUN apk add --no-cache dumb-init libc6-compat
WORKDIR /app

# ============= Dependencies stage =============
FROM base AS deps
# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY drizzle*.config.ts ./

# Install production dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production && \
    cp -R node_modules /tmp/prod_node_modules

# Install all dependencies (including dev)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ============= Builder stage =============
FROM deps AS builder
# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# ============= Production stage =============
FROM base AS production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /tmp/prod_node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/drizzle*.config.ts ./

# Copy migration files
COPY --chown=nodejs:nodejs src/db/migrations ./src/db/migrations
COPY --chown=nodejs:nodejs src/db/migrations-postgres ./src/db/migrations-postgres

# Copy health check script
COPY --chown=nodejs:nodejs docker/healthcheck.sh ./healthcheck.sh
RUN chmod +x ./healthcheck.sh

# Create data directory for SQLite (if using local database)
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Create logs directory
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

USER nodejs

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

# ============= Development stage =============
FROM deps AS development
ENV NODE_ENV=development

# Install development tools
RUN npm install -g tsx nodemon

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy source code with proper ownership
COPY --chown=nodejs:nodejs . .

# Create data and logs directories
RUN mkdir -p /app/data /app/logs && chown -R nodejs:nodejs /app/data /app/logs

USER nodejs

# Expose application and debug ports
EXPOSE 3000 9229

# Start with hot reload
CMD ["npm", "run", "dev"]

# ============= Test stage =============
FROM deps AS test
ENV NODE_ENV=test

# Copy all source code for testing
COPY . .

# Run tests
RUN npm run typecheck && \
    npm run lint && \
    npm run test

# ============= CI stage for automated builds =============
FROM test AS ci
# Run coverage and generate reports
RUN npm run test:coverage

# Copy coverage reports to a specific location
RUN mkdir -p /coverage && cp -r coverage/* /coverage/