import { drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

interface SimpleLogger {
  info: (msg: string, ...args: any[]) => void;
  error: (msg: string, ...args: any[]) => void;
  warn: (msg: string, ...args: any[]) => void;
}

/**
 * Gets the directory containing migration files
 * @returns Path to the migrations directory
 */
const getMigrationsDir = () => {
  const currentFileUrl = import.meta.url;
  const currentFilePath = fileURLToPath(currentFileUrl);
  return dirname(currentFilePath);
};

/**
 * Runs database migrations for either SQLite or PostgreSQL
 * @param databaseUrl - Database connection URL (sqlite:// or postgresql://)
 * @param logger - Logger instance for migration status
 * @throws {Error} If database URL is not supported
 */
export async function runMigrations(databaseUrl: string, logger: SimpleLogger): Promise<void> {
  if (databaseUrl.startsWith('sqlite://')) {
    const dbPath = databaseUrl.replace('sqlite://', '');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    
    logger.info('Running SQLite migrations...');
    const migrationsFolder = join(getMigrationsDir(), 'migrations');
    await migrate(db, { migrationsFolder });
    sqlite.close();
    logger.info('SQLite migrations completed');
  } else if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzlePg(pool);
    
    logger.info('Running PostgreSQL migrations...');
    const migrationsFolder = join(getMigrationsDir(), 'migrations-postgres');
    await migratePg(db, { migrationsFolder });
    await pool.end();
    logger.info('PostgreSQL migrations completed');
  } else {
    logger.warn('Unsupported database URL for migrations:', databaseUrl);
  }
} 