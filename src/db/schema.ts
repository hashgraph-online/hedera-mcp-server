import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { pgTable, varchar, decimal, timestamp, boolean, uuid } from 'drizzle-orm/pg-core';

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

export const pgUserAccounts = pgTable('user_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: varchar('account_id', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastActivity: timestamp('last_activity').defaultNow(),
  status: varchar('status', { length: 50 }).default('active'),
});

export const pgCreditBalances = pgTable('credit_balances', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: varchar('account_id', { length: 255 }).unique().notNull(),
  balance: decimal('balance', { precision: 20, scale: 8 }).notNull().default('0'),
  totalPurchased: decimal('total_purchased', { precision: 20, scale: 8 }).notNull().default('0'),
  totalConsumed: decimal('total_consumed', { precision: 20, scale: 8 }).notNull().default('0'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const pgHbarPayments = pgTable('hbar_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: varchar('transaction_id', { length: 255 }).unique().notNull(),
  payerAccountId: varchar('payer_account_id', { length: 255 }).notNull(),
  targetAccountId: varchar('target_account_id', { length: 255 }),
  hbarAmount: decimal('hbar_amount', { precision: 20, scale: 8 }).notNull(),
  creditsAllocated: decimal('credits_allocated', { precision: 20, scale: 8 }).notNull(),
  memo: varchar('memo', { length: 1000 }),
  processedAt: timestamp('processed_at').defaultNow(),
  status: varchar('status', { length: 50 }).default('pending'),
});

export const pgCreditTransactions = pgTable('credit_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  transactionType: varchar('transaction_type', { length: 50 }).notNull(),
  amount: decimal('amount', { precision: 20, scale: 8 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 20, scale: 8 }).notNull(),
  description: varchar('description', { length: 1000 }),
  relatedOperation: varchar('related_operation', { length: 255 }),
  hbarPaymentId: uuid('hbar_payment_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const pgOperationCosts = pgTable('operation_costs', {
  id: uuid('id').defaultRandom().primaryKey(),
  operationName: varchar('operation_name', { length: 255 }).unique().notNull(),
  baseCost: decimal('base_cost', { precision: 20, scale: 8 }).notNull(),
  description: varchar('description', { length: 1000 }),
  active: boolean('active').default(true),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type SqliteUserAccount = typeof sqliteUserAccounts.$inferSelect;
export type SqliteCreditBalance = typeof sqliteCreditBalances.$inferSelect;
export type SqliteHbarPayment = typeof sqliteHbarPayments.$inferSelect;
export type SqliteCreditTransaction = typeof sqliteCreditTransactions.$inferSelect;
export type SqliteOperationCost = typeof sqliteOperationCosts.$inferSelect;

export type PgUserAccount = typeof pgUserAccounts.$inferSelect;
export type PgCreditBalance = typeof pgCreditBalances.$inferSelect;
export type PgHbarPayment = typeof pgHbarPayments.$inferSelect;
export type PgCreditTransaction = typeof pgCreditTransactions.$inferSelect;
export type PgOperationCost = typeof pgOperationCosts.$inferSelect; 