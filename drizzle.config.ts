import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL || 'sqlite://./data/credits.db';
const isSqlite = databaseUrl.startsWith('sqlite://');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: isSqlite ? 'sqlite' : 'postgresql',
  dbCredentials: isSqlite
    ? { url: databaseUrl.replace('sqlite://', '') }
    : { url: databaseUrl },
});