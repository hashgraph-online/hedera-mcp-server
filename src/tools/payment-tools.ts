import {
  TransferTransaction,
  Hbar,
  AccountId,
  TransactionId,
} from '@hashgraph/sdk';
import { Logger } from '@hashgraphonline/standards-sdk';
import { CreditManagerBase } from '../db/credit-manager-base';
import { HederaMirrorNode } from '@hashgraphonline/standards-sdk';
import { calculateCreditsForHbar } from '../config/pricing-config';

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
    private logger: Logger
  ) {
    this.mirrorNode = new HederaMirrorNode(network, logger);
  }

  /**
   * Creates a transfer transaction for HBAR payment to purchase credits
   */
  async createPaymentTransaction(
    request: PaymentRequest
  ): Promise<PaymentResponse> {
    try {
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
          payment.negated()
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
        'base64'
      );
      const transactionId = frozenTx.transactionId?.toString() || '';

      const expectedCredits = calculateCreditsForHbar(amount);

      await this.creditManager.processHbarPayment({
        transactionId,
        payerAccountId,
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
        (t) => t.account === this.serverAccountId && t.amount > 0
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
        (t) =>
          t.amount < 0 && Math.abs(t.amount) >= serverTransfer.amount * 0.99
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
      const creditsToAllocate = calculateCreditsForHbar(hbarAmount);

      await this.creditManager.processHbarPayment({
        transactionId,
        payerAccountId: payerTransfer.account,
        hbarAmount,
        creditsAllocated: creditsToAllocate,
        status: 'COMPLETED',
        timestamp: transaction.consensus_timestamp,
      });

      this.logger.info('Payment verified and processed', {
        transactionId,
        payerAccountId: payerTransfer.account,
        hbarAmount,
        creditsAllocated: creditsToAllocate,
      });

      return true;
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

      if (payment.creditsAllocated > 0) {
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
   * Updates the status of a payment transaction
   * @param transactionId - The transaction ID to update
   * @param status - The new status
   * @private
   */
  private async updatePaymentStatus(
    transactionId: string,
    status: 'completed' | 'failed'
  ): Promise<void> {
    await this.creditManager.updatePaymentStatus(
      transactionId,
      status.toUpperCase() as 'COMPLETED' | 'FAILED'
    );
  }
}
