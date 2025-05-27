import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Logger } from '@hashgraphonline/standards-sdk';
import { HederaAgentKit, ServerSigner } from '@hashgraphonline/hedera-agent-kit';
import { CreditManagerFactory } from '../../db/credit-manager-factory';
import { PaymentTools } from '../../tools/payment-tools';
import { Client, PrivateKey, Transaction } from '@hashgraph/sdk';
import { loadServerConfig } from '../../config/server-config';
import { runMigrations } from '../../db/migrate';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Payment Crash Investigation', () => {
  let creditManager: any;
  let paymentTools: PaymentTools;
  let hederaKit: HederaAgentKit;
  let testConfig: any;
  let logger: Logger;
  let client: Client;
  let testDbPath: string;

  beforeAll(async () => {
    logger = Logger.getInstance({ module: 'PaymentCrashTest', level: 'info' });
    logger.info('Initializing Credit Service...');
    
    // Setup test database
    testDbPath = path.join(process.cwd(), `test-crash-${Date.now()}.db`);
    const dbUrl = `sqlite://${testDbPath}`;
    process.env.DATABASE_URL = dbUrl;
    process.env.LOG_LEVEL = 'info';
    
    testConfig = loadServerConfig();
    
    try {
      // Run migrations first
      await runMigrations(dbUrl, logger);
      
      // Initialize HederaAgentKit
      const signer = new ServerSigner(
        testConfig.HEDERA_OPERATOR_ID,
        testConfig.HEDERA_OPERATOR_KEY,
        testConfig.HEDERA_NETWORK
      );
      hederaKit = new HederaAgentKit(signer, {}, 'directExecution');
      await hederaKit.initialize();
      
      // Use CreditManagerFactory to create credit manager
      creditManager = await CreditManagerFactory.create(
        testConfig,
        hederaKit,
        logger
      );
      
      paymentTools = new PaymentTools(
        testConfig.SERVER_ACCOUNT_ID,
        'testnet',
        creditManager,
        logger,
        testConfig.CREDITS_CONVERSION_RATE
      );
      
      // Setup Hedera client
      client = Client.forTestnet();
      client.setOperator(testConfig.HEDERA_OPERATOR_ID, testConfig.HEDERA_OPERATOR_KEY);
    } catch (error) {
      logger.error('Failed to initialize Credit Service', error);
      throw error;
    }
  });

  afterAll(async () => {
    logger.info('Closing Credit Service...');
    await creditManager?.close?.();
    try {
      await fs.unlink(testDbPath);
    } catch (e) {
      // Ignore
    }
  });

  it('should handle payment flow without crashing', async () => {
    const paymentAmount = 0.1; // 0.1 HBAR
    
    try {
      // Step 1: Create payment transaction
      logger.info('Creating payment transaction...');
      const paymentRequest = {
        payerAccountId: testConfig.HEDERA_OPERATOR_ID,
        amount: paymentAmount,
        memo: `Crash test ${Date.now()}`
      };
      
      const paymentResponse = await paymentTools.createPaymentTransaction(paymentRequest);
      logger.info('Payment created', {
        transactionId: paymentResponse.transactionId,
        expectedCredits: paymentResponse.expectedCredits
      });
      
      // Check pending payment was created
      const pendingPayment = await creditManager.getHbarPayment(paymentResponse.transactionId);
      expect(pendingPayment).toBeDefined();
      expect(pendingPayment.status).toMatch(/pending|PENDING/i);
      
      // Step 2: Execute transaction EXACTLY like frontend
      logger.info('Executing transaction from bytes...');
      const transactionBytes = Buffer.from(paymentResponse.transactionBytes, 'base64');
      const transaction = Transaction.fromBytes(transactionBytes);
      
      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);
      
      expect(receipt.status.toString()).toBe('SUCCESS');
      logger.info('Transaction executed', {
        status: receipt.status.toString(),
        txId: txResponse.transactionId?.toString()
      });
      
      // Step 3: Wait for mirror node
      logger.info('Waiting 15 seconds for mirror node...');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Step 4: Verify payment - THIS IS WHERE IT CRASHES
      logger.info('Verifying payment...');
      let verifyError: any = null;
      let verifyResult = false;
      
      try {
        verifyResult = await paymentTools.verifyAndProcessPayment(paymentResponse.transactionId);
      } catch (error) {
        verifyError = error;
        logger.error('Verify failed with error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
      
      // Check what happened
      if (verifyError) {
        throw new Error(`Payment verification crashed: ${verifyError.message}`);
      }
      
      expect(verifyResult).toBe(true);
      
      // Check credits were allocated
      const balance = await creditManager.getCreditBalance(testConfig.HEDERA_OPERATOR_ID);
      logger.info('Final balance', balance);
      expect(balance.balance).toBeGreaterThan(0);
      
    } catch (error) {
      logger.error('Test failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }, 30000);

  it('should not crash when processing duplicate payment', async () => {
    // This tests the specific crash scenario
    const testTxId = '0.0.5527744@1748297499.617863496';
    
    logger.info('Testing duplicate payment processing...');
    
    // Create a payment record
    await creditManager.recordHbarPayment({
      transactionId: testTxId,
      payerAccountId: testConfig.HEDERA_OPERATOR_ID,
      hbarAmount: 1,
      creditsAllocated: 0,
      status: 'PENDING',
      timestamp: new Date().toISOString()
    });
    
    // Try to process it twice - this might be causing the crash
    let processError: any = null;
    
    try {
      // First process
      await creditManager.processHbarPayment({
        transactionId: testTxId,
        payerAccountId: testConfig.HEDERA_OPERATOR_ID,
        hbarAmount: 1,
        creditsAllocated: 1000,
        status: 'COMPLETED',
        timestamp: new Date().toISOString()
      });
      
      // Second process - this might crash
      await creditManager.processHbarPayment({
        transactionId: testTxId,
        payerAccountId: testConfig.HEDERA_OPERATOR_ID,
        hbarAmount: 1,
        creditsAllocated: 1000,
        status: 'COMPLETED',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      processError = error;
      logger.error('Process failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
    
    // Should not crash
    expect(processError).toBeNull();
  });
});