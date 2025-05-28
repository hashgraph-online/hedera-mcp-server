#!/usr/bin/env npx tsx
import { Logger } from '@hashgraphonline/standards-sdk';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { CreditService } from './src/db/credit-service';
import { loadServerConfig } from './src/config/server-config';
import * as schema from './src/db/schema';
import * as dotenv from 'dotenv';

dotenv.config();

async function testCrashScenario() {
  const logger = new Logger({ module: 'CrashTest', level: 'debug' });
  
  try {
    const config = loadServerConfig();
    const dbPath = 'test-crash.db';
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });
    
    const creditManager = new CreditService(db, false, config, null as any, logger);
    await creditManager.initialize();
    
    const testTxId = '0.0.5527744@1748297499.617863496';
    const testAccountId = '0.0.5527744';
    
    logger.info('=== TEST 1: Create pending payment ===');
    await creditManager.recordHbarPayment({
      transactionId: testTxId,
      payerAccountId: testAccountId,
      targetAccountId: config.SERVER_ACCOUNT_ID,
      hbarAmount: 1,
      creditsAllocated: 0,
      status: 'PENDING',
      timestamp: new Date().toISOString()
    });
    logger.info('Pending payment created');
    
    logger.info('=== TEST 2: Process payment (should update existing) ===');
    try {
      const result = await creditManager.processHbarPayment({
        transactionId: testTxId,
        payerAccountId: testAccountId,
        targetAccountId: config.SERVER_ACCOUNT_ID,
        hbarAmount: 1,
        creditsAllocated: 1000,
        status: 'COMPLETED',
        timestamp: new Date().toISOString()
      });
      logger.info('Process result', { result });
    } catch (error) {
      logger.error('PROCESS FAILED - This is the crash!', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
    
    logger.info('=== TEST 3: Try to process again (duplicate) ===');
    try {
      const result2 = await creditManager.processHbarPayment({
        transactionId: testTxId,
        payerAccountId: testAccountId,
        targetAccountId: config.SERVER_ACCOUNT_ID,
        hbarAmount: 1,
        creditsAllocated: 1000,
        status: 'COMPLETED',
        timestamp: new Date().toISOString()
      });
      logger.info('Second process result', { result2 });
    } catch (error) {
      logger.error('Second process failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
    
    const payment = await creditManager.getHbarPayment(testTxId);
    const balance = await creditManager.getCreditBalance(testAccountId);
    
    logger.info('Final payment state', payment);
    logger.info('Final balance', balance);
    
    sqlite.close();
    logger.info('TEST COMPLETE - No crash!');
    
  } catch (error) {
    logger.error('Test crashed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

testCrashScenario();