import {
  TransferTransaction,
  Hbar,
  AccountId,
  TransactionId,
} from '@hashgraph/sdk';
import { Logger } from '@hashgraphonline/standards-sdk';
import type { NetworkType } from '@hashgraphonline/standards-sdk';
import { CreditManagerBase } from '../db/credit-manager-base';
import { HederaMirrorNode } from '@hashgraphonline/standards-sdk';
import {
  calculateCreditsForHbar,
  getHbarToUsdRate,
} from '../config/pricing-config';

export interface PaymentRequest {
  payerAccountId: string;
  amount: number;
  memo?: string;
}

export interface PaymentResponse {
  transactionBytes: string;
  transactionId: string;
  amount: number;
  expectedCredits: number;
}

export class PaymentTools {
  private mirrorNode: HederaMirrorNode;

  constructor(
    private serverAccountId: string,
    private network: 'testnet' | 'mainnet',
    private creditManager: CreditManagerBase,
    private logger: Logger,
  ) {
    this.mirrorNode = new HederaMirrorNode(
      network as unknown as NetworkType,
      logger,
    );
  }

  /**
   * Creates a transfer transaction for HBAR payment to purchase credits
   */
  async createPaymentTransaction(
    request: PaymentRequest,
  ): Promise<PaymentResponse> {
    try {
      this.logger.debug('Creating payment transaction', { request });
      const { payerAccountId, amount, memo } = request;

      if (amount < 0.001) {
        throw new Error('Minimum payment is 0.001 HBAR');
      }
      if (amount > 10000) {
        throw new Error('Maximum payment is 10000 HBAR');
      }

      const payment = new Hbar(amount);
      const transaction = new TransferTransaction()
        .addHbarTransfer(
          AccountId.fromString(payerAccountId),
          payment.negated(),
        )
        .addHbarTransfer(AccountId.fromString(this.serverAccountId), payment)
        .setTransactionMemo(memo || `credits:${payerAccountId}`)
        .setTransactionId(TransactionId.generate(payerAccountId));

      if (this.network === 'testnet') {
        transaction.setNodeAccountIds([AccountId.fromString('0.0.3')]);
      } else {
        transaction.setNodeAccountIds([AccountId.fromString('0.0.3')]);
      }

      const frozenTx = transaction.freeze();
      const transactionBytes = Buffer.from(frozenTx.toBytes()).toString(
        'base64',
      );
      const transactionId = frozenTx.transactionId?.toString() || '';

      const networkType: NetworkType = this.network === 'testnet' ? 'testnet' : 'mainnet';
      this.logger.debug('Getting HBAR to USD rate', { networkType });
      const hbarToUsdRate = await getHbarToUsdRate(networkType);
      const expectedCredits = calculateCreditsForHbar(amount, hbarToUsdRate);

      this.logger.debug('Processing HBAR payment', { transactionId, payerAccountId, amount });
      await this.creditManager.processHbarPayment({
        transactionId,
        payerAccountId,
        targetAccountId: this.serverAccountId,
        hbarAmount: amount,
        creditsAllocated: 0,
        status: 'pending',
        timestamp: new Date().toISOString(),
      });

      this.logger.info('Payment transaction created', {
        transactionId,
        payerAccountId,
        amount,
        expectedCredits,
      });

      return {
        transactionBytes,
        transactionId,
        amount,
        expectedCredits,
      };
    } catch (error) {
      this.logger.error('Failed to create payment transaction', {
        error,
        request,
      });
      throw error;
    }
  }

  /**
   * Converts transaction ID from SDK format to Mirror Node format
   * SDK format: 0.0.123456@1234567890.123456789
   * Mirror format: 0.0.123456-1234567890-123456789
   */
  private convertTransactionIdFormat(transactionId: string): string {
    const parts = transactionId.split('@');
    if (parts.length !== 2) {
      return transactionId;
    }

    const accountId = parts[0];
    const timestampParts = parts[1]?.split('.') || [];
    if (timestampParts.length !== 2) {
      return transactionId;
    }

    return `${accountId}-${timestampParts[0]}-${timestampParts[1]}`;
  }

  /**
   * Verifies a payment transaction and allocates credits if successful
   */
  async verifyAndProcessPayment(transactionId: string): Promise<boolean> {
    try {
      this.logger.info('Verifying payment transaction', { transactionId });

      const mirrorTransactionId =
        this.convertTransactionIdFormat(transactionId);
      this.logger.info('Converted transaction ID for mirror node', {
        original: transactionId,
        converted: mirrorTransactionId,
      });

      const transaction =
        await this.mirrorNode.getTransaction(mirrorTransactionId);

      if (!transaction) {
        this.logger.warn('Transaction not found', { transactionId });
        return false;
      }

      if (transaction.result !== 'SUCCESS') {
        this.logger.warn('Transaction failed', {
          transactionId,
          result: transaction.result,
        });

        await this.updatePaymentStatus(transactionId, 'failed');
        return false;
      }

      this.logger.info('Transaction transfers', {
        transactionId,
        transfers: transaction.transfers,
        serverAccountId: this.serverAccountId,
      });

      const serverTransfer = transaction.transfers?.find(
        t => t.account === this.serverAccountId && t.amount > 0,
      );

      if (!serverTransfer) {
        this.logger.error('No transfer to server account found', {
          transactionId,
          serverAccountId: this.serverAccountId,
          transfers: transaction.transfers,
        });
        return false;
      }

      const payerTransfer = transaction.transfers?.find(
        t => t.amount < 0 && Math.abs(t.amount) >= serverTransfer.amount * 0.99,
      );

      if (!payerTransfer) {
        this.logger.error('Could not identify payer', {
          transactionId,
          serverTransferAmount: serverTransfer.amount,
          transfers: transaction.transfers,
        });
        return false;
      }

      const hbarAmount = serverTransfer.amount / 100000000;
      const networkType = this.network as unknown as NetworkType;
      const hbarToUsdRate = await getHbarToUsdRate(networkType);
      const creditsToAllocate = calculateCreditsForHbar(
        hbarAmount,
        hbarToUsdRate,
      );

      const processed = await this.creditManager.processHbarPayment({
        transactionId,
        payerAccountId: payerTransfer.account,
        hbarAmount,
        creditsAllocated: creditsToAllocate,
        status: 'COMPLETED',
        timestamp: transaction.consensus_timestamp,
      });

      if (processed) {
        this.logger.info('Payment verified and processed', {
          transactionId,
          payerAccountId: payerTransfer.account,
          hbarAmount,
          creditsAllocated: creditsToAllocate,
        });
      } else {
        this.logger.info('Payment already processed', {
          transactionId,
        });
      }

      return processed;
    } catch (error) {
      this.logger.error('Failed to verify payment', { error, transactionId });
      return false;
    }
  }

  /**
   * Gets the status of a payment transaction
   */
  async getPaymentStatus(transactionId: string): Promise<{
    status: 'pending' | 'completed' | 'failed';
    credits?: number;
    timestamp?: string;
  }> {
    try {
      const payment = await this.creditManager.getHbarPayment(transactionId);

      if (!payment) {
        return { status: 'pending' };
      }

      this.logger.debug('Payment status check', {
        transactionId,
        status: payment.status,
        creditsAllocated: payment.creditsAllocated,
      });

      const result: {
        status: 'pending' | 'completed' | 'failed';
        credits?: number;
        timestamp?: string;
      } = {
        status: payment.status.toLowerCase() as
          | 'pending'
          | 'completed'
          | 'failed',
      };

      if (payment.creditsAllocated && payment.creditsAllocated > 0) {
        result.credits = payment.creditsAllocated;
      }

      if (payment.timestamp) {
        result.timestamp = payment.timestamp;
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to get payment status', {
        error,
        transactionId,
      });
      return { status: 'pending' };
    }
  }

  /**
   * Gets pricing configuration including operation costs and tiers
   */
  async getPricingConfiguration(): Promise<{
    operations: Record<string, number>;
    currentHbarToUsdRate: number;
    tiers: Array<{
      tier: string;
      minCredits: number;
      maxCredits: number | null;
      creditsPerUSD: number;
      discount: number;
    }>;
    modifiers: {
      bulkDiscount: { threshold: number; discount: number };
      peakHours: { multiplier: number; hours: number[] };
      loyaltyTiers: Array<{ threshold: number; discount: number }>;
    };
  }> {
    try {
      const operationCostsArray = await this.creditManager.getOperationCosts();

      const operations: Record<string, number> = {};
      operationCostsArray.forEach(op => {
        operations[op.operationName] = op.baseCost;
      });

      const networkType = this.network as unknown as NetworkType;
      const hbarToUsdRate = await getHbarToUsdRate(networkType);

      return {
        operations,
        currentHbarToUsdRate: hbarToUsdRate,
        tiers: [
          {
            tier: 'starter',
            minCredits: 0,
            maxCredits: 10000,
            creditsPerUSD: 1000,
            discount: 0,
          },
          {
            tier: 'growth',
            minCredits: 10001,
            maxCredits: 100000,
            creditsPerUSD: 1111,
            discount: 10,
          },
          {
            tier: 'business',
            minCredits: 100001,
            maxCredits: 1000000,
            creditsPerUSD: 1250,
            discount: 20,
          },
          {
            tier: 'enterprise',
            minCredits: 1000001,
            maxCredits: null,
            creditsPerUSD: 1429,
            discount: 30,
          },
        ],
        modifiers: {
          bulkDiscount: { threshold: 10, discount: 20 },
          peakHours: {
            multiplier: 1.2,
            hours: [14, 15, 16, 17, 18, 19, 20, 21],
          },
          loyaltyTiers: [
            { threshold: 10000, discount: 5 },
            { threshold: 50000, discount: 10 },
            { threshold: 100000, discount: 15 },
            { threshold: 500000, discount: 20 },
          ],
        },
      };
    } catch (error) {
      console.error('Full error:', error);
      this.logger.error('Failed to get pricing configuration', { error });
      throw error;
    }
  }

  /**
   * Updates the status of a payment transaction
   * @param transactionId - The transaction ID to update
   * @param status - The new status
   * @private
   */
  private async updatePaymentStatus(
    transactionId: string,
    status: 'completed' | 'failed',
  ): Promise<void> {
    await this.creditManager.updatePaymentStatus(
      transactionId,
      status.toUpperCase() as 'COMPLETED' | 'FAILED',
    );
  }
}
