import { Logger, type NetworkType } from '@hashgraphonline/standards-sdk';
import { HederaAgentKit } from '@hashgraphonline/hedera-agent-kit';
import type { ServerConfig } from '../config/server-config';
import {
  calculateCreditsForHbar,
  getOperationCost,
  getHbarToUsdRate,
} from '../config/pricing-config';
import { PaymentTools } from '../tools/payment-tools';

export interface CreditBalance {
  accountId: string;
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
  updatedAt: string;
}

export interface HbarPayment {
  transactionId: string;
  payerAccountId: string;
  targetAccountId?: string | undefined;
  hbarAmount: number;
  creditsAllocated: number;
  conversionRate?: number;
  memo?: string | undefined;
  status:
    | 'PENDING'
    | 'COMPLETED'
    | 'FAILED'
    | 'REFUNDED'
    | 'pending'
    | 'completed'
    | 'failed'
    | 'refunded';
  timestamp?: string;
}

export interface OperationCost {
  operationName: string;
  baseCost: number;
  description: string;
  active: boolean;
}

export interface CreditTransaction {
  accountId: string;
  transactionType: 'purchase' | 'consumption' | 'refund' | 'admin_adjustment';
  amount: number;
  balanceAfter: number;
  description?: string | undefined;
  relatedOperation?: string | undefined;
  hbarPaymentId?: number | undefined;
  createdAt: string;
}

/**
 * Abstract base class for credit managers with shared business logic
 * Database operations are delegated to concrete implementations
 */
export abstract class CreditManagerBase {
  protected logger: Logger;
  protected hederaKit: HederaAgentKit;
  protected config: ServerConfig;
  protected operationCosts: Map<string, number>;

  constructor(config: ServerConfig, hederaKit: HederaAgentKit, logger: Logger) {
    this.config = config;
    this.hederaKit = hederaKit;
    this.logger = logger;
    this.operationCosts = new Map();
    this.initializeOperationCosts();
  }

  /**
   * Initialize default operation costs from pricing config
   */
  protected initializeOperationCosts(): void {
    this.operationCosts.set('health_check', 0);
    this.operationCosts.set('get_server_info', 0);
    this.operationCosts.set('check_credit_balance', 0);
    this.operationCosts.set('get_credit_history', 0);
    this.operationCosts.set('purchase_credits', 0);
    this.operationCosts.set('verify_payment', 0);
    this.operationCosts.set('check_payment_status', 0);
    this.operationCosts.set('get_payment_history', 0);
    this.operationCosts.set('get_pricing_configuration', 0);
    this.operationCosts.set('process_hbar_payment', 0);
    this.operationCosts.set('refresh_profile', 2);
    this.operationCosts.set('generate_transaction_bytes', 10);
    this.operationCosts.set('schedule_transaction', 20);
    this.operationCosts.set('execute_transaction', 50);
    this.operationCosts.set('request_auth_challenge', 0);
    this.operationCosts.set('verify_auth_signature', 0);
    this.operationCosts.set('get_api_keys', 0);
    this.operationCosts.set('rotate_api_key', 0);
    this.operationCosts.set('revoke_api_key', 0);
  }

  /**
   * Calculate credits from HBAR amount using tiered pricing
   */
  protected async calculateCredits(hbarAmount: number): Promise<number> {
    const networkType = this.config.HEDERA_NETWORK as NetworkType;
    const hbarToUsdRate = await getHbarToUsdRate(networkType);
    return calculateCreditsForHbar(hbarAmount, hbarToUsdRate);
  }

  /**
   * Gets operation cost by name with all applicable modifiers
   */
  async getOperationCost(
    operationName: string,
    options?: {
      network?: 'mainnet' | 'testnet';
      payloadSizeKB?: number;
      isBulkOperation?: boolean;
      accountId?: string;
    }
  ): Promise<number> {
    try {
      let userTotalCreditsUsed = 0;
      if (options?.accountId) {
      }

      return getOperationCost(operationName, {
        ...options,
        userTotalCreditsUsed,
      });
    } catch (error) {
      this.logger.warn(
        `Unknown operation: ${operationName}, returning 0 credits for invalid operation`
      );
      return 0;
    }
  }

  /**
   * Checks if account has sufficient credits for operation
   */
  async checkSufficientCredits(
    accountId: string,
    operationName: string,
    options?: {
      network?: 'mainnet' | 'testnet';
      payloadSizeKB?: number;
      isBulkOperation?: boolean;
    }
  ): Promise<{
    sufficient: boolean;
    currentBalance: number;
    requiredCredits: number;
    shortfall?: number;
  }> {
    const [balance, cost] = await Promise.all([
      this.getCreditBalance(accountId),
      this.getOperationCost(operationName, { ...options, accountId }),
    ]);

    const currentBalance = balance?.balance || 0;
    const sufficient = currentBalance >= cost;

    return {
      sufficient,
      currentBalance,
      requiredCredits: cost,
      ...(sufficient ? {} : { shortfall: cost - currentBalance }),
    };
  }

  /**
   * Consumes credits for an operation (shared business logic)
   */
  async consumeCredits(
    accountId: string,
    operationName: string,
    description?: string,
    options?: {
      network?: 'mainnet' | 'testnet';
      payloadSizeKB?: number;
      isBulkOperation?: boolean;
    }
  ): Promise<boolean> {
    const creditCheck = await this.checkSufficientCredits(
      accountId,
      operationName,
      options
    );

    if (!creditCheck.sufficient) {
      this.logger.warn('Insufficient credits for operation', {
        accountId,
        operationName,
        shortfall: creditCheck.shortfall,
      });
      return false;
    }

    if (creditCheck.requiredCredits === 0) {
      await this.recordCreditTransaction({
        accountId,
        transactionType: 'consumption',
        amount: 0,
        balanceAfter: creditCheck.currentBalance,
        description: description || `${operationName} operation (free)`,
        relatedOperation: operationName,
        createdAt: new Date().toISOString(),
      });

      this.logger.info('Free operation recorded', {
        accountId,
        operationName,
      });
      return true;
    }

    const newBalance = creditCheck.currentBalance - creditCheck.requiredCredits;

    await this.recordCreditTransaction({
      accountId,
      transactionType: 'consumption',
      amount: creditCheck.requiredCredits,
      balanceAfter: newBalance,
      description: description || `${operationName} operation`,
      relatedOperation: operationName,
      createdAt: new Date().toISOString(),
    });

    this.logger.info('Credits consumed successfully', {
      accountId,
      operationName,
      creditsConsumed: creditCheck.requiredCredits,
      newBalance,
    });

    return true;
  }

  /**
   * Processes HBAR payment and allocates credits (shared business logic)
   */
  async processHbarPayment(payment: HbarPayment): Promise<boolean> {
    try {
      if (payment.hbarAmount <= 0) {
        this.logger.warn('Rejected payment with non-positive amount', {
          transactionId: payment.transactionId,
          amount: payment.hbarAmount,
        });
        return false;
      }

      const creditsToAllocate =
        payment.creditsAllocated || await this.calculateCredits(payment.hbarAmount);

      await this.ensureUserAccount(payment.payerAccountId);

      const existingPayment = await this.getHbarPayment(payment.transactionId);
      if (existingPayment) {
        if (
          (existingPayment.status === 'PENDING' ||
            existingPayment.status === 'pending') &&
          (payment.status === 'COMPLETED' || payment.status === 'completed')
        ) {
          const currentBalance = await this.getCreditBalance(
            payment.payerAccountId
          );
          const newBalance = (currentBalance?.balance || 0) + creditsToAllocate;

          await this.recordHbarPaymentWithCredits(
            {
              ...existingPayment,
              ...payment,
              creditsAllocated: creditsToAllocate,
              status: 'COMPLETED',
            },
            {
              accountId: payment.payerAccountId,
              transactionType: 'purchase',
              amount: creditsToAllocate,
              balanceAfter: newBalance,
              description: `HBAR payment confirmed: ${payment.hbarAmount} HBAR → ${creditsToAllocate} credits`,
              createdAt: payment.timestamp || new Date().toISOString(),
            }
          );

          this.logger.info('Pending payment confirmed and credits allocated', {
            transactionId: payment.transactionId,
            creditsAllocated: creditsToAllocate,
          });
          return true;
        }

        if (existingPayment.status === 'COMPLETED' || existingPayment.status === 'completed') {
          this.logger.info('Payment already completed', {
            transactionId: payment.transactionId,
            existingStatus: existingPayment.status,
          });
          return true;
        }

        this.logger.warn('Payment exists in unexpected state', {
          transactionId: payment.transactionId,
          existingStatus: existingPayment.status,
          newStatus: payment.status,
        });
        return false;
      }

      if (payment.status === 'COMPLETED') {
        const currentBalance = await this.getCreditBalance(
          payment.payerAccountId
        );
        const newBalance = (currentBalance?.balance || 0) + creditsToAllocate;

        await this.recordHbarPaymentWithCredits(
          {
            ...payment,
            creditsAllocated: creditsToAllocate,
          },
          {
            accountId: payment.payerAccountId,
            transactionType: 'purchase',
            amount: creditsToAllocate,
            balanceAfter: newBalance,
            description: `HBAR payment: ${payment.hbarAmount} HBAR → ${creditsToAllocate} credits`,
            createdAt: payment.timestamp || new Date().toISOString(),
          }
        );

        this.logger.info('HBAR payment processed successfully', {
          transactionId: payment.transactionId,
          payerAccountId: payment.payerAccountId,
          hbarAmount: payment.hbarAmount,
          creditsAllocated: creditsToAllocate,
          newBalance,
        });
      } else {
        await this.recordHbarPaymentWithCredits(
          {
            ...payment,
            creditsAllocated: 0,
          },
          {
            accountId: payment.payerAccountId,
            transactionType: 'purchase',
            amount: 0,
            balanceAfter:
              (await this.getCreditBalance(payment.payerAccountId))?.balance ||
              0,
            description: `HBAR payment pending: ${payment.hbarAmount} HBAR`,
            createdAt: payment.timestamp || new Date().toISOString(),
          }
        );

        this.logger.info('HBAR payment recorded as pending', {
          transactionId: payment.transactionId,
          payerAccountId: payment.payerAccountId,
          hbarAmount: payment.hbarAmount,
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to process HBAR payment', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        payment,
      });
      return false;
    }
  }

  /**
   * Starts monitoring server account for incoming HBAR payments
   */
  async startPaymentMonitoring(): Promise<void> {
    this.logger.info('Starting HBAR payment monitoring...', {
      serverAccount: this.config.SERVER_ACCOUNT_ID,
      conversionRate: this.config.CREDITS_CONVERSION_RATE,
    });

    await this.checkForNewPayments();

    setInterval(async () => {
      try {
        await this.checkForNewPayments();
      } catch (error) {
        this.logger.error('Error checking for payments', { error });
      }
    }, 30000);
  }

  /**
   * Checks for pending HBAR payments and verifies them
   */
  protected async checkForNewPayments(): Promise<void> {
    try {
      this.logger.debug('Checking for pending HBAR payments...');

      const pendingPayments = await this.getPendingPayments();

      if (pendingPayments.length === 0) {
        this.logger.debug('No pending payments to verify');
        return;
      }

      this.logger.info(
        `Found ${pendingPayments.length} pending payments to verify`
      );

      const paymentTools = new PaymentTools(
        this.config.SERVER_ACCOUNT_ID,
        this.config.HEDERA_NETWORK,
        this,
        this.logger
      );

      for (const payment of pendingPayments) {
        try {
          this.logger.info('Verifying pending payment', {
            transactionId: payment.transactionId,
            payerAccountId: payment.payerAccountId,
            hbarAmount: payment.hbarAmount,
            timestamp: payment.timestamp,
          });

          if (payment.timestamp) {
            const paymentTime = new Date(payment.timestamp).getTime();
            const now = Date.now();
            const ageInSeconds = (now - paymentTime) / 1000;

            if (ageInSeconds > 300) {
              this.logger.warn('Payment is too old, marking as failed', {
                transactionId: payment.transactionId,
                ageInSeconds,
              });
              await this.updatePaymentStatus(payment.transactionId, 'FAILED');
              continue;
            }
          }

          const success = await paymentTools.verifyAndProcessPayment(
            payment.transactionId
          );

          if (success) {
            this.logger.info('Payment verified and credits allocated', {
              transactionId: payment.transactionId,
            });
          } else {
            this.logger.warn('Payment verification failed', {
              transactionId: payment.transactionId,
            });
          }
        } catch (error) {
          this.logger.error('Error verifying payment', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            transactionId: payment.transactionId,
          });

          continue;
        }
      }
    } catch (error) {
      this.logger.error('Failed to check for payments', { error });
    }
  }

  /**
   * Abstract database operations that must be implemented by subclasses
   */
  abstract initialize(): Promise<void>;
  abstract ensureUserAccount(accountId: string): Promise<void>;
  abstract getCreditBalance(accountId: string): Promise<CreditBalance | null>;
  abstract getCreditHistory(
    accountId: string,
    limit?: number
  ): Promise<CreditTransaction[]>;
  abstract getOperationCosts(): Promise<OperationCost[]>;
  abstract getHbarPayment(transactionId: string): Promise<HbarPayment | null>;
  abstract getHbarPaymentByTransactionId(
    transactionId: string
  ): Promise<HbarPayment | null>;
  abstract recordCreditTransaction(
    transaction: CreditTransaction
  ): Promise<void>;
  abstract recordHbarPaymentWithCredits(
    payment: HbarPayment,
    transaction: CreditTransaction
  ): Promise<void>;
  abstract updatePaymentStatus(
    transactionId: string,
    status: HbarPayment['status']
  ): Promise<void>;
  abstract getPendingPayments(): Promise<HbarPayment[]>;
  abstract getDatabase(): any;
  abstract close?(): Promise<void>;
}
