import { runMigrations } from '../db/migrate';
import { Logger } from '@hashgraphonline/standards-sdk';

async function main() {
  const databaseUrl = process.env.DATABASE_URL || 'sqlite://./data/credits.db';
  
  const logger = new Logger({ 
    module: 'DatabaseMigration',
    prettyPrint: true 
  });

  try {
    logger.info('Starting database migrations...');
    await runMigrations(databaseUrl, logger);
    logger.info('Database migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', { error });
    process.exit(1);
  }
}

main(); 