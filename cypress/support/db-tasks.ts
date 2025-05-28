import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../../src/db/schema';
import { randomBytes } from 'crypto';
import { createHash } from 'crypto';

const TEST_DB_PATH = './test.db';

export async function resetDatabase() {
  const sqlite = new Database(TEST_DB_PATH);
  const db = drizzle(sqlite, { schema });
  
  sqlite.exec(`
    DROP TABLE IF EXISTS api_keys;
    DROP TABLE IF EXISTS auth_challenges;
  `);
  
  sqlite.exec(`
    CREATE TABLE auth_challenges (
      id TEXT PRIMARY KEY,
      challenge TEXT NOT NULL,
      hedera_account_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );
    
    CREATE TABLE api_keys (
      id TEXT PRIMARY KEY,
      hedera_account_id TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      encrypted_key TEXT NOT NULL,
      name TEXT,
      permissions TEXT DEFAULT '["read"]',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT,
      expires_at TEXT,
      rate_limit INTEGER DEFAULT 100,
      metadata TEXT
    );
  `);
  
  sqlite.close();
}

export async function createApiKey({
  accountId,
  name,
  permissions = ['read'],
  lastUsedAt
}: {
  accountId: string;
  name: string;
  permissions?: string[];
  lastUsedAt?: string;
}) {
  const sqlite = new Database(TEST_DB_PATH);
  const db = drizzle(sqlite, { schema });
  
  const id = `key_${randomBytes(8).toString('hex')}`;
  const keyBytes = randomBytes(16);
  const key = `hma_${keyBytes.toString('hex')}`;
  const keyHash = createHash('sha256').update(key).digest('hex');
  
  await db.insert(schema.sqliteApiKeys).values({
    id,
    hederaAccountId: accountId,
    keyHash,
    encryptedKey: key,
    name,
    permissions: JSON.stringify(permissions),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsedAt,
    rateLimit: 100,
    metadata: JSON.stringify({})
  });
  
  sqlite.close();
  
  return { id, key, name, permissions };
}