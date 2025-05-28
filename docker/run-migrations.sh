#!/bin/bash
set -e

echo "🔄 Running database migrations with Drizzle..."

# Run Drizzle migrations - it will automatically detect the database type from DATABASE_URL
npm run db:migrate

echo "✅ Migrations completed successfully"