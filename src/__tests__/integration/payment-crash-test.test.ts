import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Logger } from '@hashgraphonline/standards-sdk';
import { HederaAgentKit, ServerSigner } from '@hashgraphonline/hedera-agent-kit';
import { CreditManagerFactory } from '../../db/credit-manager-factory';
import { PaymentTools } from '../../tools/payment-tools';
import { Client, PrivateKey, Transaction } from '@hashgraph/sdk';
import { loadServerConfig } from '../../config/server-config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { setupTestDatabase } from '../test-db-setup';

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
    
    testDbPath = path.join(process.cwd(), `test-crash-${Date.now()}.db`);
    const dbUrl = `sqlite://${testDbPath}`;
    process.env.DATABASE_URL = dbUrl;
    process.env.LOG_LEVEL = 'info';
    
    testConfig = loadServerConfig();
    
    try {
      await setupTestDatabase(dbUrl, logger);
      
      const signer = new ServerSigner(
        testConfig.HEDERA_OPERATOR_ID,
        testConfig.HEDERA_OPERATOR_KEY,
        testConfig.HEDERA_NETWORK
      );
      hederaKit = new HederaAgentKit(signer, {}, 'directExecution');
      await hederaKit.initialize();
      
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
    }
  });

  it('should handle payment flow without crashing', async () => {
    const paymentAmount = 0.1;
    
    try {
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
      
      const pendingPayment = await creditManager.getHbarPayment(paymentResponse.transactionId);
      expect(pendingPayment).toBeDefined();
      expect(pendingPayment.status).toMatch(/pending|PENDING/i);
      
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
      
      logger.info('Waiting 15 seconds for mirror node...');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
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
      
      if (verifyError) {
        throw new Error(`Payment verification crashed: ${verifyError.message}`);
      }
      
      expect(verifyResult).toBe(true);
      
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
    const testTxId = '0.0.5527744@1748297499.617863496';
    
    logger.info('Testing duplicate payment processing...');
    
    await creditManager.recordHbarPayment({
      transactionId: testTxId,
      payerAccountId: testConfig.HEDERA_OPERATOR_ID,
      hbarAmount: 1,
      creditsAllocated: 0,
      status: 'PENDING',
      timestamp: new Date().toISOString()
    });
    
    let processError: any = null;
    
    try {
      await creditManager.processHbarPayment({
        transactionId: testTxId,
        payerAccountId: testConfig.HEDERA_OPERATOR_ID,
        hbarAmount: 1,
        creditsAllocated: 1000,
        status: 'COMPLETED',
        timestamp: new Date().toISOString()
      });
      
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
    
    expect(processError).toBeNull();
  });
});