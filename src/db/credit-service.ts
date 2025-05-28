import { eq, desc, or, sql } from 'drizzle-orm';
import { Logger } from '@hashgraphonline/standards-sdk';
import { HederaAgentKit } from '@hashgraphonline/hedera-agent-kit';
import type { ServerConfig } from '../config/server-config';
import { CreditManagerBase } from './credit-manager-base';
import type {
  CreditBalance,
  CreditTransaction,
  HbarPayment,
  OperationCost,
} from './credit-manager-base';
import * as schema from './schema';
import { DEFAULT_PRICING_CONFIG } from '../config/pricing-config';

/**
 * Unified credit service that handles both SQLite and PostgreSQL
 */
export class CreditService extends CreditManagerBase {
  private db: any;
  private isPostgres: boolean;

  /**
   * Creates a new instance of CreditService that manages credit operations for both SQLite and PostgreSQL databases
   * @param db - Drizzle database instance configured for either SQLite or PostgreSQL
   * @param isPostgres - Flag indicating whether the database is PostgreSQL (true) or SQLite (false)
   * @param config - Server configuration containing database and service settings
   * @param hederaKit - Instance of HederaAgentKit for interacting with Hedera network
   * @param logger - Logger instance for logging service operations
   */
  constructor(
    db: any,
    isPostgres: boolean,
    config: ServerConfig,
    hederaKit: HederaAgentKit,
    logger: Logger,
  ) {
    super(config, hederaKit, logger);
    this.db = db;
    this.isPostgres = isPostgres;
  }

  getDatabase(): any {
    return this.db;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Credit Service...');

    try {
      const operationCosts = this.isPostgres
        ? schema.pgOperationCosts
        : schema.sqliteOperationCosts;

      const operations = DEFAULT_PRICING_CONFIG.operations.map(op => {
        const baseCostInCredits = op.baseCostUSD * DEFAULT_PRICING_CONFIG.baseCreditsPerUSD;
        return {
          operationName: op.operationName,
          baseCost: this.isPostgres ? baseCostInCredits.toString() : baseCostInCredits,
          description: op.description,
          active: true,
        };
      });

      for (const op of operations) {
        await this.db.insert(operationCosts).values(op).onConflictDoNothing();
      }

      this.logger.info(
        `Initialized ${operations.length} operation costs from pricing config`,
      );
    } catch (error) {
      console.error('Full error:', error);
      this.logger.error('Failed to initialize Credit Service', { error });
      throw error;
    }
  }

  async ensureUserAccount(accountId: string): Promise<void> {
    const userAccounts = this.isPostgres
      ? schema.pgUserAccounts
      : schema.sqliteUserAccounts;
    await this.db
      .insert(userAccounts)
      .values({ accountId })
      .onConflictDoNothing();
  }

  async getCreditBalance(accountId: string): Promise<CreditBalance | null> {
    await this.ensureUserAccount(accountId);

    const creditBalances = this.isPostgres
      ? schema.pgCreditBalances
      : schema.sqliteCreditBalances;
    const result = await this.db
      .select()
      .from(creditBalances)
      .where(eq(creditBalances.accountId, accountId))
      .limit(1);

    if (result.length === 0) {
      return {
        accountId,
        balance: 0,
        totalPurchased: 0,
        totalConsumed: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    const row = result[0];
    return {
      accountId: row.accountId,
      balance: Number(row.balance || row.currentBalance),
      totalPurchased: Number(row.totalPurchased),
      totalConsumed: Number(row.totalConsumed),
      updatedAt: row.updatedAt || row.lastUpdated,
    };
  }

  async getCreditHistory(
    accountId: string,
    limit = 100,
  ): Promise<CreditTransaction[]> {
    const creditTransactions = this.isPostgres
      ? schema.pgCreditTransactions
      : schema.sqliteCreditTransactions;
    const rows = await this.db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.accountId, accountId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(limit);

    return rows.map((row: any) => ({
      accountId: row.accountId,
      transactionType: row.transactionType as
        | 'purchase'
        | 'consumption'
        | 'refund'
        | 'admin_adjustment',
      amount: Number(row.amount),
      balanceAfter: Number(row.balanceAfter),
      description: row.description || undefined,
      relatedOperation: row.relatedOperation || undefined,
      hbarPaymentId: row.hbarPaymentId,
      createdAt: row.createdAt,
    }));
  }

  async getOperationCosts(): Promise<OperationCost[]> {
    const operationCosts = this.isPostgres
      ? schema.pgOperationCosts
      : schema.sqliteOperationCosts;
    const rows = await this.db.select().from(operationCosts);

    return rows.map((row: any) => ({
      operationName: row.operationName,
      baseCost: Number(row.baseCost),
      description: row.description || '',
      active: row.active ?? true,
    }));
  }

  async recordCreditTransaction(
    transaction: CreditTransaction,
  ): Promise<void> {
    await this.ensureUserAccount(transaction.accountId);

    if (this.isPostgres) {
      const creditTransactions = schema.pgCreditTransactions;
      const creditBalances = schema.pgCreditBalances;

      await this.db.transaction(async (tx: any) => {
        await tx.insert(creditTransactions).values({
          accountId: transaction.accountId,
          toolName: transaction.relatedOperation || 'system',
          operationalMode: 'credit_management',
          creditsDeducted:
            transaction.transactionType === 'consumption'
              ? Math.abs(transaction.amount)
              : 0,
          creditsRefunded:
            transaction.transactionType === 'refund' ? transaction.amount : 0,
          transactionStatus: 'completed',
          transactionType: transaction.transactionType,
          amount: transaction.amount,
          balanceAfter: transaction.balanceAfter,
          description: transaction.description,
          relatedOperation: transaction.relatedOperation,
          hbarPaymentId: transaction.hbarPaymentId,
          createdAt: transaction.createdAt,
        });
        const balanceUpdate =
          transaction.transactionType === 'consumption' ||
          transaction.transactionType === 'refund'
            ? {
                balance: transaction.balanceAfter,
                totalConsumed: sql`${creditBalances.totalConsumed} + ${Math.abs(transaction.amount)}`,
              }
            : {
                balance: transaction.balanceAfter,
                totalPurchased: sql`${creditBalances.totalPurchased} + ${transaction.amount}`,
              };

        await tx
          .insert(creditBalances)
          .values({
            accountId: transaction.accountId,
            ...balanceUpdate,
          })
          .onConflictDoUpdate({
            target: creditBalances.accountId,
            set: balanceUpdate,
          });
      });
    } else {
      const creditTransactions = schema.sqliteCreditTransactions;
      const creditBalances = schema.sqliteCreditBalances;
      const tx = this.db;
      tx.insert(creditTransactions)
        .values({
          accountId: transaction.accountId,
          toolName: transaction.relatedOperation || 'system',
          operationalMode: 'credit_management',
          creditsDeducted:
            transaction.transactionType === 'consumption'
              ? Math.abs(transaction.amount)
              : 0,
          creditsRefunded:
            transaction.transactionType === 'refund' ? transaction.amount : 0,
          transactionStatus: 'completed',
          transactionType: transaction.transactionType,
          amount: transaction.amount,
          balanceAfter: transaction.balanceAfter,
          description: transaction.description,
          relatedOperation: transaction.relatedOperation,
          hbarPaymentId: transaction.hbarPaymentId,
          createdAt: transaction.createdAt,
        })
        .run();
      const existingBalance = tx
        .select()
        .from(creditBalances)
        .where(eq(creditBalances.accountId, transaction.accountId))
        .get();

      if (existingBalance) {
        const updateData =
          transaction.transactionType === 'consumption' ||
          transaction.transactionType === 'refund'
            ? {
                balance: transaction.balanceAfter,
                totalConsumed:
                  existingBalance.totalConsumed + Math.abs(transaction.amount),
              }
            : {
                balance: transaction.balanceAfter,
                totalPurchased:
                  existingBalance.totalPurchased + transaction.amount,
              };

        tx.update(creditBalances)
          .set(updateData)
          .where(eq(creditBalances.accountId, transaction.accountId))
          .run();
      } else {
        const insertData =
          transaction.transactionType === 'consumption' ||
          transaction.transactionType === 'refund'
            ? {
                accountId: transaction.accountId,
                balance: transaction.balanceAfter,
                totalConsumed: Math.abs(transaction.amount),
                totalPurchased: 0,
              }
            : {
                accountId: transaction.accountId,
                balance: transaction.balanceAfter,
                totalPurchased: transaction.amount,
                totalConsumed: 0,
              };

        tx.insert(creditBalances).values(insertData).run();
      }
    }
  }

  /**
   * Records a new HBAR payment transaction in the database
   * @param payment - HbarPayment object containing transaction details including transactionId, payer/target accounts, amounts, and status
   * @returns Promise resolving to the payment ID if successful, 0 if payment already exists, or -1 if error
   * @throws Error if database operation fails for reasons other than duplicate entry
   */
  async recordHbarPayment(payment: HbarPayment): Promise<number> {
    const hbarPayments = this.isPostgres
      ? schema.pgHbarPayments
      : schema.sqliteHbarPayments;

    try {
      if (this.isPostgres) {
        const result = await this.db
          .insert(hbarPayments)
          .values({
            transactionId: payment.transactionId,
            payerAccountId: payment.payerAccountId,
            targetAccountId: payment.targetAccountId,
            hbarAmount: payment.hbarAmount,
            creditsAllocated: payment.creditsAllocated,
            conversionRate: payment.conversionRate || 1000,
            memo: payment.memo,
            status: payment.status,
          })
          .returning({ id: hbarPayments.id });
        return result[0].id;
      } else {
        const result = this.db
          .insert(hbarPayments)
          .values({
            transactionId: payment.transactionId,
            payerAccountId: payment.payerAccountId,
            targetAccountId: payment.targetAccountId,
            hbarAmount: payment.hbarAmount,
            creditsAllocated: payment.creditsAllocated,
            conversionRate: payment.conversionRate || 1000,
            memo: payment.memo,
            status: payment.status,
          })
          .run();
        return (result as any).lastInsertRowid as number;
      }
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
        this.logger.warn('Payment already exists', {
          transactionId: payment.transactionId,
        });
        const existing = await this.getHbarPaymentByTransactionId(
          payment.transactionId,
        );
        return existing ? 0 : -1;
      }
      throw error;
    }
  }

  /**
   * Updates the status of an existing HBAR payment transaction
   * @param transactionId - The unique transaction ID of the payment to update
   * @param status - New status value for the payment (e.g., 'pending', 'COMPLETED', 'FAILED')
   * @returns Promise that resolves when the update is complete
   */
  async updateHbarPaymentStatus(
    transactionId: string,
    status: HbarPayment['status'],
  ): Promise<void> {
    const hbarPayments = this.isPostgres
      ? schema.pgHbarPayments
      : schema.sqliteHbarPayments;

    await this.db
      .update(hbarPayments)
      .set({ status })
      .where(eq(hbarPayments.transactionId, transactionId));
  }

  async getPendingPayments(): Promise<HbarPayment[]> {
    const hbarPayments = this.isPostgres
      ? schema.pgHbarPayments
      : schema.sqliteHbarPayments;

    const rows = await this.db
      .select()
      .from(hbarPayments)
      .where(
        or(
          eq(hbarPayments.status, 'pending'),
          eq(hbarPayments.status, 'PENDING'),
        ),
      );

    return rows.map((row: any) => ({
      transactionId: row.transactionId,
      payerAccountId: row.payerAccountId,
      targetAccountId: row.targetAccountId,
      hbarAmount: Number(row.hbarAmount),
      creditsAllocated: Number(row.creditsAllocated),
      memo: row.memo,
      status: row.status,
      timestamp: row.processedAt || row.createdAt,
    }));
  }

  async getHbarPaymentByTransactionId(
    transactionId: string,
  ): Promise<HbarPayment | null> {
    const hbarPayments = this.isPostgres
      ? schema.pgHbarPayments
      : schema.sqliteHbarPayments;

    const result = await this.db
      .select()
      .from(hbarPayments)
      .where(eq(hbarPayments.transactionId, transactionId))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    return {
      transactionId: row.transactionId,
      payerAccountId: row.payerAccountId,
      targetAccountId: row.targetAccountId,
      hbarAmount: Number(row.hbarAmount),
      creditsAllocated: Number(row.creditsAllocated),
      memo: row.memo,
      status: row.status,
      timestamp: row.processedAt || row.createdAt,
    };
  }

  async recordHbarPaymentWithCredits(
    payment: HbarPayment,
    creditTransaction: CreditTransaction,
  ): Promise<void> {
    if (this.isPostgres) {
      await this.db.transaction(async (tx: any) => {
        const hbarPayments = schema.pgHbarPayments;
        await tx
          .insert(hbarPayments)
          .values({
            transactionId: payment.transactionId,
            payerAccountId: payment.payerAccountId,
            targetAccountId: payment.targetAccountId,
            hbarAmount: payment.hbarAmount,
            creditsAllocated: payment.creditsAllocated,
            conversionRate: payment.conversionRate || 1000,
            memo: payment.memo,
            status: payment.status,
          })
          .onConflictDoUpdate({
            target: hbarPayments.transactionId,
            set: {
              status: payment.status,
              creditsAllocated: payment.creditsAllocated,
            },
          });
        if (payment.creditsAllocated > 0 && creditTransaction.amount > 0) {
          await this.recordCreditTransaction(creditTransaction);
        }
      });
    } else {
      const hbarPayments = schema.sqliteHbarPayments;
      const tx = this.db;
      const existing = tx
        .select()
        .from(hbarPayments)
        .where(eq(hbarPayments.transactionId, payment.transactionId))
        .get();

      if (existing) {
        tx.update(hbarPayments)
          .set({
            status: payment.status,
            creditsAllocated: payment.creditsAllocated,
          })
          .where(eq(hbarPayments.transactionId, payment.transactionId))
          .run();
      } else {
        tx.insert(hbarPayments)
          .values({
            transactionId: payment.transactionId,
            payerAccountId: payment.payerAccountId,
            targetAccountId: payment.targetAccountId,
            hbarAmount: payment.hbarAmount,
            creditsAllocated: payment.creditsAllocated,
            conversionRate: payment.conversionRate || 1000,
            memo: payment.memo,
            status: payment.status,
          })
          .run();
      }
      if (payment.creditsAllocated > 0 && creditTransaction.amount > 0) {
        await this.recordCreditTransaction(creditTransaction);
      }
    }
  }

  async getHbarPayment(transactionId: string): Promise<HbarPayment | null> {
    return this.getHbarPaymentByTransactionId(transactionId);
  }

  async updatePaymentStatus(
    transactionId: string,
    status: HbarPayment['status'],
  ): Promise<void> {
    return this.updateHbarPaymentStatus(transactionId, status);
  }

  async close(): Promise<void> {
    this.logger.info('Closing Credit Service...');
  }
}
