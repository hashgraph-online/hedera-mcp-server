import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Logger, type NetworkType } from '@hashgraphonline/standards-sdk';
import type { CreditManagerBase } from '../db/credit-manager-base';
import type { ServerConfig } from '../config/server-config';
import { z } from 'zod';
import {
  calculateCreditsForHbar,
  getHbarToUsdRate,
} from '../config/pricing-config';
import { ChallengeService } from '../auth/challenge-service';
import { SignatureService } from '../auth/signature-service';
import { ApiKeyService } from '../auth/api-key-service';
import { createAuthRoutes } from '../auth/auth-endpoints';
import { RateLimiter } from './middleware/rate-limit';

/**
 * HTTP API server for credit operations
 * Provides RESTful endpoints for the admin portal to interact with credits
 */
export class HttpApiServer {
  private app: express.Application;
  private server: any;
  private challengeService: ChallengeService;
  private signatureService: SignatureService;
  private apiKeyService: ApiKeyService;
  private rateLimiter?: RateLimiter;

  constructor(
    private creditManager: CreditManagerBase,
    private config: ServerConfig,
    private logger: Logger,
  ) {
    this.app = express();
    const db = (this.creditManager as any).db;
    const isPostgres = (this.creditManager as any).isPostgres || false;

    this.challengeService = new ChallengeService(db, isPostgres);
    this.signatureService = new SignatureService(
      this.config.HEDERA_NETWORK,
      this.logger,
    );
    this.apiKeyService = new ApiKeyService(
      db,
      isPostgres,
      process.env.API_KEY_ENCRYPTION_SECRET ||
        'default-secret-change-in-production',
    );

    if (process.env.REDIS_URL) {
      this.rateLimiter = new RateLimiter(process.env.REDIS_URL, this.logger);
      this.setupRateLimiting();
    }

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Configures rate limiting rules for different endpoints
   */
  private setupRateLimiting(): void {
    if (!this.rateLimiter) return;

    this.rateLimiter.configureRules([
      {
        endpoint: '/api/auth/challenge',
        method: 'POST',
        windowMs: 60 * 1000,
        maxRequests: 10,
      },
      {
        endpoint: '/api/auth/authenticate',
        method: 'POST',
        windowMs: 60 * 1000,
        maxRequests: 5,
      },
      {
        endpoint: '/api/auth/key',
        method: 'GET',
        windowMs: 60 * 1000,
        maxRequests: 30,
      },
      {
        endpoint: '/api/credits/*',
        windowMs: 60 * 1000,
        maxRequests: 100,
      },
    ]);
  }

  /**
   * Configures Express middleware for CORS, JSON parsing, request logging, and error handling
   */
  private setupMiddleware(): void {
    this.app.use(
      cors({
        origin: process.env.ADMIN_PORTAL_URL || 'http://localhost:3001',
        credentials: true,
      }),
    );

    this.app.use(express.json());

    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      this.logger.debug(`HTTP ${req.method} ${req.path}`, {
        body: req.body,
        query: req.query,
      });
      next();
    });

    this.app.use(
      (err: Error, _req: Request, res: Response, _next: NextFunction) => {
        this.logger.error('HTTP API error', { error: err });
        res.status(500).json({ error: 'Internal server error' });
      },
    );
  }

  /**
   * Authentication middleware to check Bearer token in Authorization header
   * @param req - Express request
   * @param res - Express response
   * @param next - Next middleware function
   */
  private authMiddleware = async (
    req: Request & { user?: any },
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res
          .status(401)
          .json({ error: 'Missing or invalid authorization header' });
        return;
      }

      const apiKey = authHeader.substring(7);
      const keyDetails = await this.apiKeyService.verifyApiKey(apiKey);

      if (!keyDetails) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }

      req.user = {
        ...keyDetails,
        hederaAccountId:
          keyDetails.hederaAccountId || keyDetails.hedera_account_id,
      };

      await this.apiKeyService.logUsage({
        apiKeyId: keyDetails.id,
        endpoint: req.path,
        method: req.method,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      next();
    } catch (error) {
      this.logger.error('Auth middleware error', { error });
      res.status(500).json({ error: 'Authentication error' });
    }
  };

  /**
   * Defines all HTTP API routes for credit operations including health check, balance queries,
   * payment processing, and configuration endpoints
   */
  private setupRoutes(): void {
    const authRoutes = createAuthRoutes(
      this.challengeService,
      this.signatureService,
      this.apiKeyService,
    );

    this.app.use(authRoutes);

    this.app.post(
      '/api/auth/challenge',
      this.rateLimiter
        ? this.rateLimiter.getEndpointLimiter('/api/auth/challenge', 'POST')
        : (_, __, next) => next(),
      async (req: Request, res: Response) => {
        req.url = '/api/v1/auth/challenge';
        authRoutes(req, res, () => {});
      },
    );

    this.app.post(
      '/api/auth/authenticate',
      this.rateLimiter
        ? this.rateLimiter.getEndpointLimiter('/api/auth/authenticate', 'POST')
        : (_, __, next) => next(),
      async (req: Request, res: Response) => {
        req.url = '/api/v1/auth/verify';
        authRoutes(req, res, () => {});
      },
    );

    this.app.get(
      '/api/auth/key',
      this.rateLimiter
        ? this.rateLimiter.getEndpointLimiter('/api/auth/key', 'GET')
        : (_, __, next) => next(),
      this.authMiddleware.bind(this),
      async (req: Request & { user?: any }, res: Response) => {
        try {
          const keyInfo = await this.apiKeyService.getApiKeyById(req.user.id);
          if (!keyInfo) {
            res.status(404).json({ error: 'API key not found' });
            return;
          }
          res.json({
            id: keyInfo.id,
            hederaAccountId: keyInfo.hederaAccountId,
            name: keyInfo.name,
            lastUsed: keyInfo.lastUsed,
            usageCount: keyInfo.usageCount,
            expiresAt: keyInfo.expiresAt,
            createdAt: keyInfo.createdAt,
          });
        } catch (error) {
          this.logger.error('Failed to get API key info', { error });
          res.status(500).json({ error: 'Failed to get API key info' });
        }
      },
    );

    this.app.get(
      '/api/auth/keys',
      this.rateLimiter
        ? this.rateLimiter.getEndpointLimiter('/api/auth/keys', 'GET')
        : (_, __, next) => next(),
      async (req: Request, res: Response) => {
        req.url = '/api/v1/auth/keys';
        authRoutes(req, res, () => {});
      },
    );

    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/api/credits/config', (_req: Request, res: Response) => {
      res.json({
        serverAccountId: this.config.SERVER_ACCOUNT_ID,
        network: this.config.HEDERA_NETWORK,
        conversionRate: this.config.CREDITS_CONVERSION_RATE,
        minimumPayment: this.config.CREDITS_MINIMUM_PAYMENT || 1,
        maximumPayment: this.config.CREDITS_MAXIMUM_PAYMENT || 10000,
      });
    });

    this.app.get(
      '/api/credits/pricing',
      async (_req: Request, res: Response) => {
        try {
          const operationCosts = await this.creditManager.getOperationCosts();
          res.json({
            operations: operationCosts,
            tiers: [
              {
                tier: 'starter',
                minCredits: 0,
                maxCredits: 10000,
                hbarPerCredit: 0.01,
                discount: 0,
              },
              {
                tier: 'growth',
                minCredits: 10001,
                maxCredits: 100000,
                hbarPerCredit: 0.009,
                discount: 10,
              },
              {
                tier: 'business',
                minCredits: 100001,
                maxCredits: 1000000,
                hbarPerCredit: 0.008,
                discount: 20,
              },
              {
                tier: 'enterprise',
                minCredits: 1000001,
                maxCredits: null,
                hbarPerCredit: 0.007,
                discount: 30,
              },
            ],
            modifiers: {
              bulkDiscount: { threshold: 100, discount: 0.05 },
              peakHours: { multiplier: 1.2, hours: [9, 10, 11, 14, 15, 16] },
              loyaltyTiers: [
                { threshold: 1000, discount: 0.02 },
                { threshold: 10000, discount: 0.05 },
                { threshold: 100000, discount: 0.1 },
              ],
            },
          });
        } catch (error) {
          this.logger.error('Failed to get pricing configuration', { error });
          res
            .status(500)
            .json({ error: 'Failed to get pricing configuration' });
        }
      },
    );

    this.app.get(
      '/api/auth/key',
      this.authMiddleware.bind(this),
      async (req: Request & { user?: any }, res: Response) => {
        try {
          const user = req.user;
          res.json({
            keyId: user.id,
            hederaAccountId: user.hederaAccountId || user.hedera_account_id,
            permissions: user.permissions,
            rateLimit: user.rateLimit,
            createdAt: user.createdAt || user.created_at,
            lastUsedAt: user.lastUsedAt || user.last_used_at,
            expiresAt: user.expiresAt || user.expires_at,
            isActive:
              user.isActive !== undefined ? user.isActive : user.is_active,
          });
        } catch (error) {
          this.logger.error('Failed to get API key info', { error });
          res.status(500).json({ error: 'Failed to get API key information' });
        }
      },
    );

    this.app.get(
      '/api/credits/balance/:accountId',
      this.authMiddleware.bind(this),
      async (req: Request & { user?: any }, res: Response) => {
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
              totalConsumed: 0,
            });
          }

          return res.json(balance);
        } catch (error) {
          this.logger.error('Failed to get credit balance', { error });
          return res.status(500).json({ error: 'Failed to get balance' });
        }
      },
    );

    this.app.get(
      '/api/credits/history/:accountId',
      async (req: Request, res: Response) => {
        try {
          const { accountId } = req.params;
          if (!accountId) {
            return res.status(400).json({ error: 'Account ID is required' });
          }
          const limit = parseInt(req.query.limit as string) || 50;

          const history = await this.creditManager.getCreditHistory(
            accountId,
            limit,
          );
          return res.json(history);
        } catch (error) {
          this.logger.error('Failed to get credit history', { error });
          return res.status(500).json({ error: 'Failed to get history' });
        }
      },
    );

    this.app.post(
      '/api/credits/create-payment',
      async (req: Request, res: Response) => {
        try {
          const createPaymentSchema = z.object({
            payerAccountId: z.string(),
            amount: z.number().positive(),
            memo: z.string().optional(),
          });

          const body = createPaymentSchema.parse(req.body);

          const networkType = this.config.HEDERA_NETWORK as NetworkType;
          const hbarToUsdRate = await getHbarToUsdRate(networkType);
          const expectedCredits = calculateCreditsForHbar(
            body.amount,
            hbarToUsdRate,
          );

          return res.json({
            transaction_bytes: '',
            transaction_id: '',
            amount_hbar: body.amount,
            expected_credits: expectedCredits,
            server_account_id: this.config.SERVER_ACCOUNT_ID,
            memo: body.memo || `Credits purchase: ${expectedCredits} credits`,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return res
              .status(400)
              .json({ error: 'Invalid request data', details: error.errors });
          }
          this.logger.error('Failed to create payment transaction', { error });
          return res
            .status(500)
            .json({ error: 'Failed to create payment transaction' });
        }
      },
    );

    this.app.post(
      '/api/credits/purchase',
      this.authMiddleware.bind(this),
      async (req: Request & { user?: any }, res: Response) => {
        try {
          const purchaseSchema = z.object({
            accountId: z.string(),
            transactionId: z.string(),
            hbarAmount: z.number().positive(),
            amount: z.number().positive().int(),
          });

          const body = purchaseSchema.parse(req.body);

          const existingPayment =
            await this.creditManager.getHbarPaymentByTransactionId(
              body.transactionId,
            );
          if (existingPayment) {
            return res.status(400).json({
              error: 'Transaction already processed',
              transactionId: body.transactionId,
            });
          }

          const success = await this.creditManager.processHbarPayment({
            transactionId: body.transactionId,
            payerAccountId: body.accountId,
            hbarAmount: body.hbarAmount,
            creditsAllocated: body.amount,
            memo: `MCP Credits Purchase: ${body.amount} credits`,
            status: 'PENDING',
          });

          if (success) {
            return res.json({
              success: true,
              message: 'Payment recorded, awaiting confirmation',
              transactionId: body.transactionId,
            });
          } else {
            return res.status(500).json({ error: 'Failed to record payment' });
          }
        } catch (error) {
          if (error instanceof z.ZodError) {
            return res
              .status(400)
              .json({ error: 'Invalid request data', details: error.errors });
          }
          this.logger.error('Failed to process purchase', { error });
          return res.status(500).json({ error: 'Failed to process purchase' });
        }
      },
    );

    this.app.post(
      '/api/credits/purchase/confirm',
      this.authMiddleware.bind(this),
      async (req: Request & { user?: any }, res: Response) => {
        try {
          const { transactionId } = req.body;

          if (!transactionId) {
            return res.status(400).json({ error: 'Missing transaction ID' });
          }

          const payment =
            await this.creditManager.getHbarPaymentByTransactionId(
              transactionId,
            );

          if (!payment) {
            return res.json({ status: 'pending' });
          }

          if (payment.status === 'COMPLETED') {
            return res.json({
              status: 'completed',
              amount: payment.hbarAmount,
              creditsAllocated: payment.creditsAllocated,
            });
          } else if (payment.status === 'FAILED') {
            return res.json({
              status: 'failed',
              error: 'Transaction failed',
            });
          } else {
            return res.json({ status: 'pending' });
          }
        } catch (error) {
          this.logger.error('Failed to confirm purchase', { error });
          return res.status(500).json({ error: 'Failed to confirm purchase' });
        }
      },
    );

    this.app.post(
      '/api/credits/process-payment',
      async (req: Request, res: Response) => {
        try {
          const apiKey = req.headers['x-api-key'];
          if (apiKey !== process.env.ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
          }

          const paymentSchema = z.object({
            transactionId: z.string(),
            payerAccountId: z.string(),
            hbarAmount: z.number().positive(),
            memo: z.string().optional(),
          });

          const payment = paymentSchema.parse(req.body);
          const creditsToAllocate = payment.hbarAmount * 100;
          const success = await this.creditManager.processHbarPayment({
            transactionId: payment.transactionId,
            payerAccountId: payment.payerAccountId,
            hbarAmount: payment.hbarAmount,
            memo: payment.memo,
            creditsAllocated: creditsToAllocate,
            status: 'COMPLETED',
          });

          if (success) {
            const balance = await this.creditManager.getCreditBalance(
              payment.payerAccountId,
            );
            return res.json({
              success: true,
              newBalance: balance?.balance || 0,
            });
          } else {
            return res.status(500).json({ error: 'Failed to process payment' });
          }
        } catch (error) {
          if (error instanceof z.ZodError) {
            return res
              .status(400)
              .json({ error: 'Invalid request data', details: error.errors });
          }
          this.logger.error('Failed to process manual payment', { error });
          return res.status(500).json({ error: 'Failed to process payment' });
        }
      },
    );
  }

  /**
   * Start the HTTP API server
   */
  async start(port: number = 3002): Promise<void> {
    return new Promise(resolve => {
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
    if (this.rateLimiter) {
      await this.rateLimiter.close();
    }

    return new Promise(resolve => {
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
