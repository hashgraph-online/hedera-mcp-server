import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Logger } from '@hashgraphonline/standards-sdk';
import type { CreditManagerBase } from '../db/credit-manager-base';
import type { ServerConfig } from '../config/server-config';
import { z } from 'zod';
import { calculateCreditsForHbar } from '../config/pricing-config';

/**
 * HTTP API server for credit operations
 * Provides RESTful endpoints for the admin portal to interact with credits
 */
export class HttpApiServer {
  private app: express.Application;
  private server: any;

  constructor(
    private creditManager: CreditManagerBase,
    private config: ServerConfig,
    private logger: Logger
  ) {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Configures Express middleware for CORS, JSON parsing, request logging, and error handling
   */
  private setupMiddleware(): void {
    this.app.use(cors({
      origin: process.env.ADMIN_PORTAL_URL || 'http://localhost:3001',
      credentials: true
    }));

    this.app.use(express.json());

    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      this.logger.debug(`HTTP ${req.method} ${req.path}`, {
        body: req.body,
        query: req.query
      });
      next();
    });

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      this.logger.error('HTTP API error', { error: err });
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Defines all HTTP API routes for credit operations including health check, balance queries,
   * payment processing, and configuration endpoints
   */
  private setupRoutes(): void {
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/api/credits/config', (_req: Request, res: Response) => {
      res.json({
        serverAccountId: this.config.SERVER_ACCOUNT_ID,
        network: this.config.HEDERA_NETWORK,
        conversionRate: this.config.CREDITS_CONVERSION_RATE,
        minimumPayment: this.config.CREDITS_MINIMUM_PAYMENT || 1,
        maximumPayment: this.config.CREDITS_MAXIMUM_PAYMENT || 10000
      });
    });

    this.app.get('/api/credits/pricing', async (_req: Request, res: Response) => {
      try {
        const operationCosts = await this.creditManager.getOperationCosts();
        res.json({
          operations: operationCosts,
          tiers: [
            { tier: 'starter', minCredits: 0, maxCredits: 10000, hbarPerCredit: 0.01, discount: 0 },
            { tier: 'growth', minCredits: 10001, maxCredits: 100000, hbarPerCredit: 0.009, discount: 10 },
            { tier: 'business', minCredits: 100001, maxCredits: 1000000, hbarPerCredit: 0.008, discount: 20 },
            { tier: 'enterprise', minCredits: 1000001, maxCredits: null, hbarPerCredit: 0.007, discount: 30 }
          ],
          modifiers: {
            bulkDiscount: { threshold: 100, discount: 0.05 },
            peakHours: { multiplier: 1.2, hours: [9, 10, 11, 14, 15, 16] },
            loyaltyTiers: [
              { threshold: 1000, discount: 0.02 },
              { threshold: 10000, discount: 0.05 },
              { threshold: 100000, discount: 0.10 }
            ]
          }
        });
      } catch (error) {
        this.logger.error('Failed to get pricing configuration', { error });
        res.status(500).json({ error: 'Failed to get pricing configuration' });
      }
    });

    this.app.get('/api/credits/balance/:accountId', async (req: Request, res: Response) => {
      try {
        const { accountId } = req.params;
        if (!accountId) {
          return res.status(400).json({ error: 'Account ID is required' });
        }
        const balance = await this.creditManager.getCreditBalance(accountId);

        if (!balance) {
          return res.json({
            balance: 0,
            totalPurchased: 0,
            totalConsumed: 0
          });
        }

        return res.json(balance);
      } catch (error) {
        this.logger.error('Failed to get credit balance', { error });
        return res.status(500).json({ error: 'Failed to get balance' });
      }
    });

    this.app.get('/api/credits/history/:accountId', async (req: Request, res: Response) => {
      try {
        const { accountId } = req.params;
        if (!accountId) {
          return res.status(400).json({ error: 'Account ID is required' });
        }
        const limit = parseInt(req.query.limit as string) || 50;

        const history = await this.creditManager.getCreditHistory(accountId, limit);
        return res.json(history);
      } catch (error) {
        this.logger.error('Failed to get credit history', { error });
        return res.status(500).json({ error: 'Failed to get history' });
      }
    });

    this.app.post('/api/credits/create-payment', async (req: Request, res: Response) => {
      try {
        const createPaymentSchema = z.object({
          payerAccountId: z.string(),
          amount: z.number().positive(),
          memo: z.string().optional()
        });

        const body = createPaymentSchema.parse(req.body);

        const expectedCredits = calculateCreditsForHbar(body.amount);

        return res.json({
          transaction_bytes: '',
          transaction_id: '',
          amount_hbar: body.amount,
          expected_credits: expectedCredits,
          server_account_id: this.config.SERVER_ACCOUNT_ID,
          memo: body.memo || `Credits purchase: ${expectedCredits} credits`
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: 'Invalid request data', details: error.errors });
        }
        this.logger.error('Failed to create payment transaction', { error });
        return res.status(500).json({ error: 'Failed to create payment transaction' });
      }
    });

    this.app.post('/api/credits/purchase', async (req: Request, res: Response) => {
      try {
        const purchaseSchema = z.object({
          accountId: z.string(),
          transactionId: z.string(),
          hbarAmount: z.number().positive(),
          amount: z.number().positive().int()
        });

        const body = purchaseSchema.parse(req.body);

        const existingPayment = await this.creditManager.getHbarPaymentByTransactionId(body.transactionId);
        if (existingPayment) {
          return res.status(400).json({
            error: 'Transaction already processed',
            transactionId: body.transactionId
          });
        }

        const success = await this.creditManager.processHbarPayment({
          transactionId: body.transactionId,
          payerAccountId: body.accountId,
          hbarAmount: body.hbarAmount,
          creditsAllocated: body.amount,
          memo: `MCP Credits Purchase: ${body.amount} credits`,
          status: 'PENDING'
        });

        if (success) {
          return res.json({
            success: true,
            message: 'Payment recorded, awaiting confirmation',
            transactionId: body.transactionId
          });
        } else {
          return res.status(500).json({ error: 'Failed to record payment' });
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: 'Invalid request data', details: error.errors });
        }
        this.logger.error('Failed to process purchase', { error });
        return res.status(500).json({ error: 'Failed to process purchase' });
      }
    });

    this.app.post('/api/credits/purchase/confirm', async (req: Request, res: Response) => {
      try {
        const { transactionId } = req.body;

        if (!transactionId) {
          return res.status(400).json({ error: 'Missing transaction ID' });
        }

        const payment = await this.creditManager.getHbarPaymentByTransactionId(transactionId);

        if (!payment) {
          return res.json({ status: 'pending' });
        }

        if (payment.status === 'COMPLETED') {
          return res.json({
            status: 'completed',
            amount: payment.hbarAmount,
            creditsAllocated: payment.creditsAllocated
          });
        } else if (payment.status === 'FAILED') {
          return res.json({
            status: 'failed',
            error: 'Transaction failed'
          });
        } else {
          return res.json({ status: 'pending' });
        }
      } catch (error) {
        this.logger.error('Failed to confirm purchase', { error });
        return res.status(500).json({ error: 'Failed to confirm purchase' });
      }
    });

    this.app.post('/api/credits/process-payment', async (req: Request, res: Response) => {
      try {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== process.env.ADMIN_API_KEY) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const paymentSchema = z.object({
          transactionId: z.string(),
          payerAccountId: z.string(),
          hbarAmount: z.number().positive(),
          memo: z.string().optional()
        });

        const payment = paymentSchema.parse(req.body);
        const creditsToAllocate = payment.hbarAmount * 100;
        const success = await this.creditManager.processHbarPayment({
          ...payment,
          creditsAllocated: creditsToAllocate,
          status: 'COMPLETED'
        });

        if (success) {
          const balance = await this.creditManager.getCreditBalance(payment.payerAccountId);
          return res.json({
            success: true,
            newBalance: balance?.balance || 0
          });
        } else {
          return res.status(500).json({ error: 'Failed to process payment' });
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: 'Invalid request data', details: error.errors });
        }
        this.logger.error('Failed to process manual payment', { error });
        return res.status(500).json({ error: 'Failed to process payment' });
      }
    });
  }

  /**
   * Start the HTTP API server
   */
  async start(port: number = 3002): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        this.logger.info(`HTTP API server listening on port ${port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP API server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('HTTP API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}