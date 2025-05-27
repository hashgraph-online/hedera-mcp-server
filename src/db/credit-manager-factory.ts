import { drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { Logger } from '@hashgraphonline/standards-sdk';
import { HederaAgentKit } from '@hashgraphonline/hedera-agent-kit';
import type { ServerConfig } from '../config/server-config';
import { CreditManagerBase } from './credit-manager-base';
import { CreditService } from './credit-service';
import { runMigrations } from './migrate';
import * as schema from './schema';

export class CreditManagerFactory {
  /**
   * Creates a CreditManager instance based on the database configuration
   * @param config - Server configuration including database URL
   * @param hederaKit - Hedera Agent Kit instance for blockchain operations
   * @param logger - Logger instance for logging
   * @returns CreditManagerBase instance configured for the specified database
   * @throws {Error} If database URL is not supported
   */
  static async create(
    config: ServerConfig,
    hederaKit: HederaAgentKit,
    logger: Logger
  ): Promise<CreditManagerBase> {
    const dbUrl = config.DATABASE_URL;

    await runMigrations(dbUrl, logger);

    if (dbUrl.startsWith('sqlite://')) {
      const dbPath = dbUrl.replace('sqlite://', '');
      logger.info('Creating Credit Service (SQLite mode)', { path: dbPath });
      const sqlite = new Database(dbPath);
      const db = drizzle(sqlite, { schema });
      return new CreditService(db, false, config, hederaKit, logger);
    } else if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
      logger.info('Creating Credit Service (PostgreSQL mode)', { url: dbUrl.replace(/\/\/.*@/, '//<redacted>@') });
      const pool = new Pool({ connectionString: dbUrl });
      const db = drizzlePg(pool, { schema });
      return new CreditService(db, true, config, hederaKit, logger);
    } else {
      throw new Error(`Unsupported database URL: ${dbUrl}. Use sqlite:// or postgresql://`);
    }
  }
} 