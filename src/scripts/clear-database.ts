#!/usr/bin/env node
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import * as schema from '../db/schema';
import { Logger } from '@hashgraphonline/standards-sdk';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const logger = new Logger({ module: 'clear-database' });

/**
 * Clears all data from the database tables in the correct order to respect
 * foreign key constraints. Resets auto-increment sequences for SQLite.
 */
async function clearDatabase() {
  const dbType = process.env.DATABASE_TYPE || 'sqlite';
  
  if (dbType === 'postgres') {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    const db = pgDrizzle(pool, { schema });
    
    try {
      logger.info('Clearing PostgreSQL database...');
      
      
      await db.delete(schema.pgCreditTransactions);
      logger.info('Cleared credit_transactions table');
      
      await db.delete(schema.pgHbarPayments);
      logger.info('Cleared hbar_payments table');
      
      await db.delete(schema.pgCreditBalances);
      logger.info('Cleared credit_balances table');
      
      await db.delete(schema.pgOperationCosts);
      logger.info('Cleared operation_costs table');
      
      await db.delete(schema.pgUserAccounts);
      logger.info('Cleared user_accounts table');
      
      logger.info('PostgreSQL database cleared successfully');
    } catch (error) {
      logger.error('Failed to clear PostgreSQL database', { error });
      throw error;
    } finally {
      await pool.end();
    }
  } else {
    const dbPath = process.env.DATABASE_PATH || './data/credits.db';
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });
    
    try {
      logger.info('Clearing SQLite database...');
      
      
      await db.delete(schema.sqliteCreditTransactions);
      logger.info('Cleared credit_transactions table');
      
      await db.delete(schema.sqliteHbarPayments);
      logger.info('Cleared hbar_payments table');
      
      await db.delete(schema.sqliteCreditBalances);
      logger.info('Cleared credit_balances table');
      
      await db.delete(schema.sqliteOperationCosts);
      logger.info('Cleared operation_costs table');
      
      await db.delete(schema.sqliteUserAccounts);
      logger.info('Cleared user_accounts table');
      
      sqlite.exec("DELETE FROM sqlite_sequence");
      logger.info('Reset SQLite auto-increment sequences');
      
      logger.info('SQLite database cleared successfully');
    } catch (error) {
      logger.error('Failed to clear SQLite database', { error });
      throw error;
    } finally {
      sqlite.close();
    }
  }
}

logger.warn('\n⚠️  WARNING: This will delete ALL data from the database!');
logger.info('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

setTimeout(() => {
  clearDatabase()
    .then(() => {
      logger.info('Database cleared successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Failed to clear database', { error });
      process.exit(1);
    });
}, 5000);