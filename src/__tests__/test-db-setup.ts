import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from '../db/schema';
import { Logger } from '@hashgraphonline/standards-sdk';
import { DEFAULT_PRICING_CONFIG } from '../config/pricing-config';
import path from 'path';

/**
 * Sets up a test database with schema and seed data using Drizzle migrations
 */
export async function setupTestDatabase(databaseUrl: string, logger: Logger): Promise<Database.Database | null> {
  if (!databaseUrl.startsWith('sqlite://')) {
    throw new Error('Test database must be SQLite');
  }

  const dbPath = databaseUrl.replace('sqlite://', '');
  
  logger.info(`Setting up test database at: ${dbPath}`);
  
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });
  
  try {
    const migrationsFolder = path.resolve(process.cwd(), 'src/db/migrations');
    await migrate(db, { migrationsFolder });
    logger.info('Database migrations completed');

    await db
      .insert(schema.sqlitePricingMetadata)
      .values([
        {
          key: 'purchase_tiers',
          value: JSON.stringify(DEFAULT_PRICING_CONFIG.purchaseTiers),
        },
        {
          key: 'pricing_rules',
          value: JSON.stringify(DEFAULT_PRICING_CONFIG.rules),
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.sqliteConversionRates)
      .values({
        hbarPerCredit: 0.001,
        creditsPerHbar: 1000,
        effectiveDate: new Date().toISOString(),
        createdBy: 'system',
        notes: 'Initial conversion rate: 1000 credits per HBAR',
        isActive: true,
      })
      .onConflictDoNothing();

    const operationCosts = DEFAULT_PRICING_CONFIG.operations.map(op => ({
      operationName: op.operationName,
      baseCost: Math.ceil(op.baseCostUSD * DEFAULT_PRICING_CONFIG.baseCreditsPerUSD),
      description: op.description,
      active: true,
    }));

    for (const cost of operationCosts) {
      await db
        .insert(schema.sqliteOperationCosts)
        .values(cost)
        .onConflictDoNothing();
    }

    logger.info('Test database setup completed');
    
    return sqlite;
  } catch (error) {
    logger.error('Failed to setup test database', error);
    if (sqlite) {
      try {
        sqlite.close();
      } catch (closeError) {
        logger.error('Failed to close database', closeError);
      }
    }
    throw error;
  }
}