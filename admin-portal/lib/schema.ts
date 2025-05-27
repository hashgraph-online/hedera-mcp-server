import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const sqliteUserAccounts = sqliteTable('user_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: text('account_id').unique().notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  lastActivity: text('last_activity').default(sql`CURRENT_TIMESTAMP`),
  status: text('status').default('active'),
});

export const sqliteCreditBalances = sqliteTable('credit_balances', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: text('account_id').unique().notNull(),
  balance: integer('balance').notNull().default(0),
  totalPurchased: integer('total_purchased').notNull().default(0),
  totalConsumed: integer('total_consumed').notNull().default(0),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const sqliteHbarPayments = sqliteTable('hbar_payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transactionId: text('transaction_id').unique().notNull(),
  payerAccountId: text('payer_account_id').notNull(),
  targetAccountId: text('target_account_id'),
  hbarAmount: real('hbar_amount').notNull(),
  creditsAllocated: integer('credits_allocated').notNull(),
  memo: text('memo'),
  processedAt: text('processed_at').default(sql`CURRENT_TIMESTAMP`),
  status: text('status').default('pending'),
});

export const sqliteCreditTransactions = sqliteTable('credit_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: text('account_id').notNull(),
  transactionType: text('transaction_type').notNull(),
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  description: text('description'),
  relatedOperation: text('related_operation'),
  hbarPaymentId: integer('hbar_payment_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const sqliteOperationCosts = sqliteTable('operation_costs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  operationName: text('operation_name').unique().notNull(),
  baseCost: integer('base_cost').notNull(),
  description: text('description'),
  active: integer('active', { mode: 'boolean' }).default(true),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export type SqliteUserAccount = typeof sqliteUserAccounts.$inferSelect;
export type SqliteCreditBalance = typeof sqliteCreditBalances.$inferSelect;
export type SqliteHbarPayment = typeof sqliteHbarPayments.$inferSelect;
export type SqliteCreditTransaction = typeof sqliteCreditTransactions.$inferSelect;
export type SqliteOperationCost = typeof sqliteOperationCosts.$inferSelect;