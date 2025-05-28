import { drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import * as schema from './schema';
import { Logger } from '@hashgraphonline/standards-sdk';
import { DEFAULT_PRICING_CONFIG } from '../config/pricing-config';

const logger = new Logger({ module: 'db-seed' });

/**
 * Seeds the database with initial data
 */
export async function seed(databaseUrl: string) {
  logger.info('Starting database seed...');

  const operations = DEFAULT_PRICING_CONFIG.operations.map(op => ({
    operationName: op.operationName,
    baseCost: (op.baseCostUSD * DEFAULT_PRICING_CONFIG.baseCreditsPerUSD).toString(),
    description: op.description,
    active: true,
  }));

  const pricingMetadata = [
    {
      key: 'purchase_tiers',
      value: JSON.stringify(DEFAULT_PRICING_CONFIG.purchaseTiers),
    },
    {
      key: 'pricing_rules',
      value: JSON.stringify(DEFAULT_PRICING_CONFIG.rules),
    },
  ];

  const conversionRate = {
    hbarPerCredit: 0.001,
    creditsPerHbar: 1000,
    effectiveDate: new Date(),
    createdBy: 'system',
    notes: 'Initial conversion rate: 1000 credits per HBAR',
    isActive: true,
  };

  if (
    databaseUrl.startsWith('postgresql://') ||
    databaseUrl.startsWith('postgres://')
  ) {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzlePg(pool, { schema });

    try {
      for (const op of operations) {
        await db
          .insert(schema.pgOperationCosts)
          .values(op)
          .onConflictDoUpdate({
            target: schema.pgOperationCosts.operationName,
            set: {
              baseCost: op.baseCost,
              description: op.description,
              updatedAt: new Date(),
            },
          });
      }

      for (const metadata of pricingMetadata) {
        await db
          .insert(schema.pgPricingMetadata)
          .values(metadata)
          .onConflictDoUpdate({
            target: schema.pgPricingMetadata.key,
            set: {
              value: metadata.value,
              updatedAt: new Date(),
            },
          });
      }

      await db
        .insert(schema.pgConversionRates)
        .values({
          ...conversionRate,
          hbarPerCredit: conversionRate.hbarPerCredit.toString(),
          creditsPerHbar: conversionRate.creditsPerHbar.toString(),
        })
        .onConflictDoNothing();

      logger.info('PostgreSQL seed completed successfully');
    } finally {
      await pool.end();
    }
  } else if (databaseUrl.startsWith('sqlite://')) {
    const dbPath = databaseUrl.replace('sqlite://', '');
    let sqlite;
    try {
      sqlite = new Database(dbPath);
    } catch (error: any) {
      logger.error('Failed to open SQLite database', { dbPath, error: error.message });
      throw error;
    }
    const db = drizzle(sqlite, { schema });

    try {
      for (const op of operations) {
        await db
          .insert(schema.sqliteOperationCosts)
          .values({
            operationName: op.operationName,
            baseCost: parseInt(op.baseCost),
            description: op.description,
            active: op.active,
          })
          .onConflictDoUpdate({
            target: schema.sqliteOperationCosts.operationName,
            set: {
              baseCost: parseInt(op.baseCost),
              description: op.description,
              updatedAt: new Date().toISOString(),
            },
          });
      }

      for (const metadata of pricingMetadata) {
        await db
          .insert(schema.sqlitePricingMetadata)
          .values(metadata)
          .onConflictDoUpdate({
            target: schema.sqlitePricingMetadata.key,
            set: {
              value: metadata.value,
              updatedAt: new Date().toISOString(),
            },
          });
      }

      await db
        .insert(schema.sqliteConversionRates)
        .values({
          ...conversionRate,
          effectiveDate: conversionRate.effectiveDate.toISOString(),
        })
        .onConflictDoNothing();

      logger.info('SQLite seed completed successfully');
    } catch (error: any) {
      logger.error('Error during SQLite seed', { error: error.message, stack: error.stack });
      throw error;
    } finally {
      sqlite?.close();
    }
  } else {
    throw new Error(`Unsupported database URL: ${databaseUrl}`);
  }

  logger.info(
    `Seeded ${operations.length} operation costs, ${pricingMetadata.length} metadata entries, and initial conversion rate`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const databaseUrl = process.env.DATABASE_URL || 'sqlite://./data/credits.db';

  seed(databaseUrl)
    .then(() => {
      logger.info('Database seed completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Full error:', error);
      logger.error('Database seed failed', { error: error.message, stack: error.stack });
      process.exit(1);
    });
}
