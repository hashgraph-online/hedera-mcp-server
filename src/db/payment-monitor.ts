import { Logger, type NetworkType } from '@hashgraphonline/standards-sdk';
import { CreditManagerBase } from './credit-manager-base';
import type { HbarPayment } from './credit-manager-base';
import { calculateCreditsForHbar, getHbarToUsdRate } from '../config/pricing-config';

export interface PaymentTransaction {
  transaction_id: string;
  consensus_timestamp: string;
  transfers: Array<{
    account: string;
    amount: number;
  }>;
  memo_base64?: string;
}

export class PaymentMonitor {
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    private creditManager: CreditManagerBase,
    private serverAccountId: string,
    private network: 'testnet' | 'mainnet',
    private logger: Logger
  ) {}

  /**
   * Starts monitoring for incoming HBAR payments
   * @param intervalMs - Check interval in milliseconds (default: 30000)
   */
  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (this.isMonitoring) {
      this.logger.warn('Payment monitoring already started');
      return;
    }

    this.isMonitoring = true;
    this.logger.info('Starting payment monitoring', {
      serverAccount: this.serverAccountId,
      checkInterval: `${intervalMs}ms`,
      network: this.network,
    });

    await this.checkForNewPayments();

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkForNewPayments();
      } catch (error) {
        this.logger.error('Error in payment monitoring interval', { error });
      }
    }, intervalMs);
  }

  /**
   * Stops the payment monitoring process
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    this.logger.info('Stopped payment monitoring');
  }

  /**
   * Checks for new incoming HBAR payments and processes them
   */
  async checkForNewPayments(): Promise<void> {
    try {
      this.logger.debug('Checking for pending HBAR payments...');

      const pendingPayments = await this.creditManager.getPendingPayments();

      if (pendingPayments.length === 0) {
        this.logger.debug('No pending payments found');
        return;
      }

      this.logger.info(
        `Found ${pendingPayments.length} pending payments to check`
      );

      for (const payment of pendingPayments) {
        if (payment.timestamp) {
          const paymentTime = new Date(payment.timestamp).getTime();
          const now = Date.now();
          const ageInSeconds = (now - paymentTime) / 1000;

          if (ageInSeconds > 300) {
            this.logger.warn('Payment is too old, marking as failed', {
              transactionId: payment.transactionId,
              ageInSeconds,
            });
            await this.creditManager.updatePaymentStatus(
              payment.transactionId,
              'FAILED'
            );
            continue;
          } else {
            this.processTransaction({
              transaction_id: payment.transactionId,
              consensus_timestamp: payment.timestamp,
              transfers: [
                {
                  account: payment.payerAccountId,
                  amount: payment.hbarAmount,
                },
              ],
            });
          }
        }
      }
    } catch (error: unknown) {
      this.logger.error('Failed to check for payments', { error });
      throw error;
    }
  }

  /**
   * Processes a single payment transaction
   * @param tx - The transaction to process
   * @private
   */
  private async processTransaction(tx: PaymentTransaction): Promise<void> {
    try {
      const serverTransfer = tx.transfers.find(
        (t) => t.account === this.serverAccountId && t.amount > 0
      );
      if (!serverTransfer) {
        this.logger.warn('No incoming transfer found for transaction', {
          transactionId: tx.transaction_id,
        });
        return;
      }

      const senderTransfer = tx.transfers.find(
        (t) => t.amount < 0 && Math.abs(t.amount) >= serverTransfer.amount
      );
      if (!senderTransfer) {
        this.logger.warn('Could not identify sender for transaction', {
          transactionId: tx.transaction_id,
        });
        return;
      }

      const hbarAmount = serverTransfer.amount / 100000000;

      let memo = '';
      if (tx.memo_base64) {
        try {
          memo = Buffer.from(tx.memo_base64, 'base64').toString('utf8');
        } catch (error) {
          this.logger.warn('Failed to decode memo', {
            error,
            transactionId: tx.transaction_id,
          });
        }
      }

      let payerAccountId = senderTransfer.account;
      if (memo.startsWith('credits:')) {
        const memoAccount = memo.substring('credits:'.length).trim();
        if (memoAccount) {
          payerAccountId = memoAccount;
          this.logger.info('Using account from memo', {
            memoAccount,
            originalSender: senderTransfer.account,
          });
        }
      }

      const existingPayment =
        await this.creditManager.getHbarPaymentByTransactionId(
          tx.transaction_id
        );
      if (existingPayment && existingPayment.status === 'COMPLETED') {
        this.logger.debug('Payment already processed', {
          transactionId: tx.transaction_id,
        });
        return;
      }

      const networkType = this.network as NetworkType;
      const hbarToUsdRate = await getHbarToUsdRate(networkType);
      const creditsAllocated = calculateCreditsForHbar(hbarAmount, hbarToUsdRate);
      
      const payment: HbarPayment = {
        transactionId: tx.transaction_id,
        payerAccountId,
        hbarAmount,
        creditsAllocated,
        timestamp: new Date(tx.consensus_timestamp).toISOString(),
        status: 'COMPLETED',
      };

      const success = await this.creditManager.processHbarPayment(payment);

      if (success) {
        this.logger.info('Successfully processed HBAR payment', {
          transactionId: tx.transaction_id,
          payerAccountId,
          hbarAmount,
          memo,
        });
      } else {
        this.logger.warn('Failed to process HBAR payment', {
          transactionId: tx.transaction_id,
          payerAccountId,
          hbarAmount,
        });
      }
    } catch (error) {
      this.logger.error('Error processing transaction', {
        error,
        transaction: tx,
      });
    }
  }
}
