#!/usr/bin/env node
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { dirname } from 'path';
import { Logger } from '@hashgraphonline/standards-sdk';

const logger = new Logger({ module: 'db-setup' });

/**
 * Unified database setup script
 * Automatically detects SQLite vs PostgreSQL and sets up the database
 */
async function setupDatabase() {
  const databaseUrl = process.env.DATABASE_URL || 'sqlite://./data/credits.db';
  const isSqlite = databaseUrl.startsWith('sqlite://');
  const force = process.argv.includes('--force');

  logger.info(`Setting up ${isSqlite ? 'SQLite' : 'PostgreSQL'} database...`);

  try {
    if (isSqlite) {
      const dbPath = databaseUrl.replace('sqlite://', '');
      const dbDir = dirname(dbPath);

      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
        logger.info(`Created directory: ${dbDir}`);
      }

      if (force && existsSync(dbPath)) {
        logger.info(`Removing existing database: ${dbPath}`);
        try {
          rmSync(dbPath, { force: true, maxRetries: 3 });
          
          const walPath = `${dbPath}-wal`;
          const shmPath = `${dbPath}-shm`;
          
          if (existsSync(walPath)) {
            rmSync(walPath, { force: true });
            logger.info('Removed WAL file');
          }
          
          if (existsSync(shmPath)) {
            rmSync(shmPath, { force: true });
            logger.info('Removed SHM file');
          }
        } catch (error: any) {
          logger.warn(`Failed to remove database file: ${error.message}`);
          logger.info('Attempting to overwrite existing database...');
        }
      }
    }

    logger.info('Syncing database schema...');
    try {
      execSync('npx drizzle-kit push', {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
    } catch (error: any) {
      if (!force && error.toString().includes('already exists')) {
        logger.info('Database schema already exists. Use --force to recreate.');
      } else {
        throw error;
      }
    }

    logger.info('Seeding database...');
    execSync('tsx src/db/seed.ts', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    logger.info('Database setup completed successfully!');

    if (!force && isSqlite) {
      logger.info(
        'Tip: Use "npm run db:setup -- --force" to recreate the database from scratch',
      );
    }
  } catch (error) {
    console.error('Database setup failed', error);
    logger.error('Database setup failed', { error });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase();
}
