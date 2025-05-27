#!/usr/bin/env node
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import * as schema from '../db/schema';
import { Logger } from '@hashgraphonline/standards-sdk';
import { config } from 'dotenv';
import path from 'path';
import { DEFAULT_PRICING_CONFIG } from '../config/pricing-config';

config({ path: path.resolve(process.cwd(), '.env') });

const logger = new Logger({ module: 'initialize-pricing' });

/**
 * Initializes the database with default pricing configuration including
 * operation costs, pricing tiers, and pricing rules metadata.
 */
async function initializePricing() {
  const dbType = process.env.DATABASE_TYPE || 'sqlite';
  
  if (dbType === 'postgres') {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    const db = pgDrizzle(pool, { schema });
    
    try {
      logger.info('Initializing PostgreSQL pricing...');
      
      const operations = DEFAULT_PRICING_CONFIG.operations.map(op => ({
        operationName: op.operationName,
        baseCost: op.baseCost.toString(),
        description: op.description,
        active: true,
      }));
      
      for (const op of operations) {
        await db.insert(schema.pgOperationCosts)
          .values(op)
          .onConflictDoUpdate({
            target: schema.pgOperationCosts.operationName,
            set: {
              baseCost: op.baseCost,
              description: op.description,
            },
          });
      }
      
      logger.info(`Initialized ${operations.length} operation costs`);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pricing_metadata (
          id SERIAL PRIMARY KEY,
          key VARCHAR(100) UNIQUE NOT NULL,
          value JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await pool.query(`
        INSERT INTO pricing_metadata (key, value)
        VALUES ('purchase_tiers', $1::jsonb)
        ON CONFLICT (key) DO UPDATE
        SET value = $1::jsonb, updated_at = NOW()
      `, [JSON.stringify(DEFAULT_PRICING_CONFIG.purchaseTiers)]);
      
      await pool.query(`
        INSERT INTO pricing_metadata (key, value)
        VALUES ('pricing_rules', $1::jsonb)
        ON CONFLICT (key) DO UPDATE
        SET value = $1::jsonb, updated_at = NOW()
      `, [JSON.stringify(DEFAULT_PRICING_CONFIG.rules)]);
      
      logger.info('PostgreSQL pricing initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PostgreSQL pricing', { error });
      throw error;
    } finally {
      await pool.end();
    }
  } else {
    const dbPath = process.env.DATABASE_PATH || './data/credits.db';
    const sqlite = new Database(dbPath);
    
    try {
      logger.info('Initializing SQLite pricing...');
      
      const operations = DEFAULT_PRICING_CONFIG.operations.map(op => ({
        operationName: op.operationName,
        baseCost: op.baseCost,
        description: op.description,
        active: true,
      }));
      
      for (const op of operations) {
        sqlite.prepare(`
          INSERT INTO operation_costs (operation_name, base_cost, description, active)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(operation_name) DO UPDATE SET
            base_cost = excluded.base_cost,
            description = excluded.description
        `).run(op.operationName, op.baseCost, op.description, op.active ? 1 : 0);
      }
      
      logger.info(`Initialized ${operations.length} operation costs`);
      
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS pricing_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      sqlite.prepare(`
        INSERT INTO pricing_metadata (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `).run('purchase_tiers', JSON.stringify(DEFAULT_PRICING_CONFIG.purchaseTiers));
      
      sqlite.prepare(`
        INSERT INTO pricing_metadata (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `).run('pricing_rules', JSON.stringify(DEFAULT_PRICING_CONFIG.rules));
      
      logger.info('SQLite pricing initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SQLite pricing', { error });
      throw error;
    } finally {
      sqlite.close();
    }
  }
}

initializePricing()
  .then(() => {
    logger.info('Pricing initialization completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Failed to initialize pricing', { error });
    process.exit(1);
  });