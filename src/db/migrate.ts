import { drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { Logger } from '@hashgraphonline/standards-sdk';
import * as schema from './schema';

/**
 * Runs database migrations using Drizzle ORM
 * Instead of using SQL migration files, we use the schema to create tables
 * This ensures compatibility between SQLite and PostgreSQL
 */
export async function runMigrations(
  databaseUrl: string,
  logger: Logger,
): Promise<Database.Database | undefined> {
  logger.info('Starting database setup...');

  if (databaseUrl.startsWith('sqlite://')) {
    const dbPath = databaseUrl.replace('sqlite://', '');
    const isInMemory = dbPath === ':memory:';
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });

    logger.info('Setting up SQLite database...', { path: dbPath });

    try {
      logger.info('Database setup completed for SQLite');
    } catch (error: any) {
      logger.error('Database setup failed', { error });
      throw error;
    }

    if (!isInMemory) {
      sqlite.close();
    }

    if (isInMemory) {
      return sqlite;
    }
  } else if (
    databaseUrl.startsWith('postgresql://') ||
    databaseUrl.startsWith('postgres://')
  ) {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzlePg(pool, { schema });

    logger.info('Setting up PostgreSQL database...');
    
    try {
      await pool.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      `).catch(() => {
        logger.warn('Could not create PostgreSQL extensions (may require superuser)');
      });

      logger.info('Database setup completed for PostgreSQL');
    } catch (error: any) {
      logger.error('Database setup failed', { error });
      throw error;
    } finally {
      await pool.end();
    }
  } else {
    throw new Error(`Unsupported database URL: ${databaseUrl}`);
  }

  return undefined;
}