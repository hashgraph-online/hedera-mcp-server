import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { pgTable, varchar, decimal, timestamp, boolean, uuid, jsonb, index as pgIndex } from 'drizzle-orm/pg-core';

export const sqliteUserAccounts = sqliteTable('user_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: text('account_id').unique().notNull(),
  accountName: text('account_name'),
  accountType: text('account_type').default('ai_assistant'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  lastActivity: text('last_activity').default(sql`CURRENT_TIMESTAMP`),
  status: text('status').default('active'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
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
  conversionRate: real('conversion_rate').notNull(),
  memo: text('memo'),
  networkFee: real('network_fee'),
  processedAt: text('processed_at').default(sql`CURRENT_TIMESTAMP`),
  consensusTimestamp: text('consensus_timestamp'),
  status: text('status').default('pending'),
  hederaAccountId: text('hedera_account_id'),
});

export const sqliteCreditTransactions = sqliteTable('credit_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: text('account_id').notNull(),
  toolName: text('tool_name').notNull(),
  operationalMode: text('operational_mode').notNull(),
  creditsDeducted: real('credits_deducted').notNull(),
  creditsRefunded: real('credits_refunded').default(0),
  transactionStatus: text('transaction_status').notNull(),
  executionTimeMs: integer('execution_time_ms'),
  requestData: text('request_data'),
  responseData: text('response_data'),
  errorMessage: text('error_message'),
  hederaTransactionId: text('hedera_transaction_id'),
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
  accountName: varchar('account_name', { length: 255 }),
  accountType: varchar('account_type', { length: 100 }).default('ai_assistant'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastActivity: timestamp('last_activity').defaultNow(),
  status: varchar('status', { length: 50 }).default('active'),
  isActive: boolean('is_active').default(true),
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
  conversionRate: decimal('conversion_rate', { precision: 20, scale: 8 }).notNull(),
  memo: varchar('memo', { length: 1000 }),
  networkFee: decimal('network_fee', { precision: 20, scale: 8 }),
  processedAt: timestamp('processed_at').defaultNow(),
  consensusTimestamp: timestamp('consensus_timestamp'),
  status: varchar('status', { length: 50 }).default('pending'),
  hederaAccountId: varchar('hedera_account_id', { length: 50 }),
});

export const pgCreditTransactions = pgTable('credit_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  toolName: varchar('tool_name', { length: 255 }).notNull(),
  operationalMode: varchar('operational_mode', { length: 50 }).notNull(),
  creditsDeducted: decimal('credits_deducted', { precision: 20, scale: 8 }).notNull(),
  creditsRefunded: decimal('credits_refunded', { precision: 20, scale: 8 }).default('0'),
  transactionStatus: varchar('transaction_status', { length: 50 }).notNull(),
  executionTimeMs: decimal('execution_time_ms', { precision: 10, scale: 0 }),
  requestData: varchar('request_data', { length: 5000 }),
  responseData: varchar('response_data', { length: 5000 }),
  errorMessage: varchar('error_message', { length: 1000 }),
  hederaTransactionId: varchar('hedera_transaction_id', { length: 255 }),
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

export const sqliteConversionRates = sqliteTable('conversion_rates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  hbarPerCredit: real('hbar_per_credit').notNull(),
  creditsPerHbar: real('credits_per_hbar').notNull(),
  effectiveDate: text('effective_date').notNull(),
  createdBy: text('created_by').default('system'),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
});

export const sqliteToolUsageStats = sqliteTable('tool_usage_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  toolName: text('tool_name').notNull(),
  usageDate: text('usage_date').notNull(),
  totalCalls: integer('total_calls').default(0),
  totalCreditsUsed: real('total_credits_used').default(0),
  avgExecutionTimeMs: real('avg_execution_time_ms'),
  successRate: real('success_rate'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const pgConversionRates = pgTable('conversion_rates', {
  id: uuid('id').defaultRandom().primaryKey(),
  hbarPerCredit: decimal('hbar_per_credit', { precision: 20, scale: 8 }).notNull(),
  creditsPerHbar: decimal('credits_per_hbar', { precision: 20, scale: 8 }).notNull(),
  effectiveDate: timestamp('effective_date').notNull(),
  createdBy: varchar('created_by', { length: 255 }).default('system'),
  notes: varchar('notes', { length: 1000 }),
  isActive: boolean('is_active').default(true),
});

export const pgToolUsageStats = pgTable('tool_usage_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  toolName: varchar('tool_name', { length: 255 }).notNull(),
  usageDate: timestamp('usage_date').notNull(),
  totalCalls: decimal('total_calls', { precision: 10, scale: 0 }).default('0'),
  totalCreditsUsed: decimal('total_credits_used', { precision: 20, scale: 8 }).default('0'),
  avgExecutionTimeMs: decimal('avg_execution_time_ms', { precision: 10, scale: 2 }),
  successRate: decimal('success_rate', { precision: 5, scale: 4 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export type SqliteConversionRate = typeof sqliteConversionRates.$inferSelect;
export type SqliteToolUsageStat = typeof sqliteToolUsageStats.$inferSelect;
export type PgConversionRate = typeof pgConversionRates.$inferSelect;
export type PgToolUsageStat = typeof pgToolUsageStats.$inferSelect;

export const sqliteApiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  hederaAccountId: text('hedera_account_id').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  keyHash: text('key_hash').unique().notNull(),
  name: text('name'),
  permissions: text('permissions').default('["read"]'),
  status: text('status').default('active'),
  rateLimit: integer('rate_limit').default(1000),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  metadata: text('metadata').default('{}'),
}, (table) => ({
  accountIdIdx: index('api_keys_account_id_idx').on(table.hederaAccountId),
  statusIdx: index('api_keys_status_idx').on(table.status),
}));

export const sqliteAuthChallenges = sqliteTable('auth_challenges', {
  id: text('id').primaryKey(),
  hederaAccountId: text('hedera_account_id').notNull(),
  challenge: text('challenge').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  used: integer('used', { mode: 'boolean' }).default(false),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
});

export const sqliteApiKeyUsage = sqliteTable('api_key_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  apiKeyId: text('api_key_id').notNull(),
  endpoint: text('endpoint').notNull(),
  method: text('method').notNull(),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  apiKeyIdx: index('api_key_usage_api_key_idx').on(table.apiKeyId),
  createdAtIdx: index('api_key_usage_created_at_idx').on(table.createdAt),
}));

export type SqliteApiKey = typeof sqliteApiKeys.$inferSelect;
export type SqliteAuthChallenge = typeof sqliteAuthChallenges.$inferSelect;
export type SqliteApiKeyUsage = typeof sqliteApiKeyUsage.$inferSelect;

export const pgApiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey(),
  hederaAccountId: varchar('hedera_account_id', { length: 255 }).notNull(),
  encryptedKey: varchar('encrypted_key', { length: 1000 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).unique().notNull(),
  name: varchar('name', { length: 255 }),
  permissions: varchar('permissions', { length: 1000 }).default('["read"]'),
  status: varchar('status', { length: 50 }).default('active'),
  rateLimit: decimal('rate_limit', { precision: 10, scale: 0 }).default('1000'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  isActive: boolean('is_active').default(true),
  metadata: varchar('metadata', { length: 5000 }).default('{}'),
}, (table) => ({
  accountIdIdx: pgIndex('pg_api_keys_account_id_idx').on(table.hederaAccountId),
  statusIdx: pgIndex('pg_api_keys_status_idx').on(table.status),
}));

export const pgAuthChallenges = pgTable('auth_challenges', {
  id: uuid('id').primaryKey(),
  hederaAccountId: varchar('hedera_account_id', { length: 255 }).notNull(),
  challenge: varchar('challenge', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  used: boolean('used').default(false),
  ipAddress: varchar('ip_address', { length: 255 }),
  userAgent: varchar('user_agent', { length: 1000 }),
});

export const pgApiKeyUsage = pgTable('api_key_usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  apiKeyId: uuid('api_key_id').notNull(),
  endpoint: varchar('endpoint', { length: 255 }).notNull(),
  method: varchar('method', { length: 50 }).notNull(),
  statusCode: decimal('status_code', { precision: 3, scale: 0 }),
  responseTimeMs: decimal('response_time_ms', { precision: 10, scale: 0 }),
  ipAddress: varchar('ip_address', { length: 255 }),
  userAgent: varchar('user_agent', { length: 1000 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export type PgApiKey = typeof pgApiKeys.$inferSelect;
export type PgAuthChallenge = typeof pgAuthChallenges.$inferSelect;
export type PgApiKeyUsage = typeof pgApiKeyUsage.$inferSelect;

export const sqliteAnomalyEvents = sqliteTable('anomaly_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  apiKeyId: text('api_key_id').notNull(),
  hederaAccountId: text('hedera_account_id').notNull(),
  eventType: text('event_type').notNull(),
  severity: text('severity').notNull(),
  details: text('details'),
  detectedAt: text('detected_at').default(sql`CURRENT_TIMESTAMP`),
  resolved: integer('resolved', { mode: 'boolean' }).default(false),
  resolvedAt: text('resolved_at'),
  actionTaken: text('action_taken'),
});

export const sqliteAuditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
  eventType: text('event_type').notNull(),
  apiKeyId: text('api_key_id'),
  hederaAccountId: text('hedera_account_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  endpoint: text('endpoint'),
  method: text('method'),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms'),
  details: text('details'),
  severity: text('severity').default('info'),
  requestId: text('request_id'),
});

export const sqliteRateLimitBuckets = sqliteTable('rate_limit_buckets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  identifier: text('identifier').notNull(),
  bucketKey: text('bucket_key').notNull(),
  windowStart: text('window_start').notNull(),
  requestCount: integer('request_count').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text('expires_at').notNull(),
});

export const sqliteApiKeyHistoricalStats = sqliteTable('api_key_historical_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  apiKeyId: text('api_key_id').notNull(),
  hour: integer('hour').notNull(),
  avgRequestCount: real('avg_request_count').default(0),
  avgResponseTime: real('avg_response_time').default(0),
  errorRate: real('error_rate').default(0),
  lastUpdated: text('last_updated').default(sql`CURRENT_TIMESTAMP`),
});

export const pgAnomalyEvents = pgTable('anomaly_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  apiKeyId: uuid('api_key_id').notNull(),
  hederaAccountId: varchar('hedera_account_id', { length: 255 }).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  severity: varchar('severity', { length: 50 }).notNull(),
  details: jsonb('details'),
  detectedAt: timestamp('detected_at').defaultNow(),
  resolved: boolean('resolved').default(false),
  resolvedAt: timestamp('resolved_at'),
  actionTaken: varchar('action_taken', { length: 255 }),
});

export const pgAuditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  timestamp: timestamp('timestamp').defaultNow(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  apiKeyId: uuid('api_key_id'),
  hederaAccountId: varchar('hedera_account_id', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 255 }),
  userAgent: varchar('user_agent', { length: 1000 }),
  endpoint: varchar('endpoint', { length: 255 }),
  method: varchar('method', { length: 50 }),
  statusCode: decimal('status_code', { precision: 3, scale: 0 }),
  responseTimeMs: decimal('response_time_ms', { precision: 10, scale: 0 }),
  details: jsonb('details'),
  severity: varchar('severity', { length: 50 }).default('info'),
  requestId: varchar('request_id', { length: 255 }),
});

export const pgRateLimitBuckets = pgTable('rate_limit_buckets', {
  id: uuid('id').defaultRandom().primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  bucketKey: varchar('bucket_key', { length: 255 }).notNull(),
  windowStart: timestamp('window_start').notNull(),
  requestCount: decimal('request_count', { precision: 10, scale: 0 }).default('0'),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const pgApiKeyHistoricalStats = pgTable('api_key_historical_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  apiKeyId: uuid('api_key_id').notNull(),
  hour: decimal('hour', { precision: 2, scale: 0 }).notNull(),
  avgRequestCount: decimal('avg_request_count', { precision: 10, scale: 2 }).default('0'),
  avgResponseTime: decimal('avg_response_time', { precision: 10, scale: 2 }).default('0'),
  errorRate: decimal('error_rate', { precision: 5, scale: 4 }).default('0'),
  lastUpdated: timestamp('last_updated').defaultNow(),
});

export type SqliteAnomalyEvent = typeof sqliteAnomalyEvents.$inferSelect;
export type SqliteAuditLog = typeof sqliteAuditLogs.$inferSelect;
export type SqliteRateLimitBucket = typeof sqliteRateLimitBuckets.$inferSelect;
export type SqliteApiKeyHistoricalStat = typeof sqliteApiKeyHistoricalStats.$inferSelect;

export type PgAnomalyEvent = typeof pgAnomalyEvents.$inferSelect;
export type PgAuditLog = typeof pgAuditLogs.$inferSelect;
export type PgRateLimitBucket = typeof pgRateLimitBuckets.$inferSelect;
export type PgApiKeyHistoricalStat = typeof pgApiKeyHistoricalStats.$inferSelect;

export const sqliteSessionCache = sqliteTable('session_cache', {
  id: text('id').primaryKey(),
  apiKeyId: text('api_key_id').notNull(),
  hederaAccountId: text('hedera_account_id').notNull(),
  sessionData: text('session_data').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text('expires_at').notNull(),
}, (table) => ({
  apiKeyIdx: index('session_cache_api_key_idx').on(table.apiKeyId),
  expiresAtIdx: index('session_cache_expires_at_idx').on(table.expiresAt),
}));

export const pgSessionCache = pgTable('session_cache', {
  id: uuid('id').defaultRandom().primaryKey(),
  apiKeyId: uuid('api_key_id').notNull(),
  hederaAccountId: varchar('hedera_account_id', { length: 255 }).notNull(),
  sessionData: jsonb('session_data').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  apiKeyIdx: pgIndex('pg_session_cache_api_key_idx').on(table.apiKeyId),
  expiresAtIdx: pgIndex('pg_session_cache_expires_at_idx').on(table.expiresAt),
}));

export type SqliteSessionCache = typeof sqliteSessionCache.$inferSelect;
export type PgSessionCache = typeof pgSessionCache.$inferSelect;

export const sqlitePricingMetadata = sqliteTable('pricing_metadata', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').unique().notNull(),
  value: text('value').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const pgPricingMetadata = pgTable('pricing_metadata', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 100 }).unique().notNull(),
  value: varchar('value', { length: 10000 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type SqlitePricingMetadata = typeof sqlitePricingMetadata.$inferSelect;
export type PgPricingMetadata = typeof pgPricingMetadata.$inferSelect; 