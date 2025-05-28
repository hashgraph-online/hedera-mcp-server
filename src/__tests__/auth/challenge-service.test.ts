import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ChallengeService } from '../../auth/challenge-service';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import * as schema from '../../db/schema';
import { Logger } from '@hashgraphonline/standards-sdk';
import { setupTestDatabase } from '../test-db-setup';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';

describe('ChallengeService', () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;
  let challengeService: ChallengeService;
  let logger: Logger;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDbPath = path.join(
      __dirname,
      `../../../test-db-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`,
    );
    const databaseUrl = `sqlite://${tempDbPath}`;

    logger = new Logger({ module: 'challenge-service-test', level: 'error' });

    sqlite = await setupTestDatabase(databaseUrl, logger);
    if (!sqlite) {
      throw new Error('Failed to setup test database');
    }

    db = drizzle(sqlite, { schema });
    challengeService = new ChallengeService(db, false);
  });

  afterEach(async () => {
    if (sqlite) {
      sqlite.close();
    }
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {
    }
  });

  describe('generateChallenge', () => {
    it('should generate a valid challenge', async () => {
      const challenge = await challengeService.generateChallenge({
        hederaAccountId: '0.0.12345',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      expect(challenge).toBeDefined();
      expect(challenge.id).toMatch(/^[a-f0-9]{32}$/);
      expect(challenge.challenge).toMatch(/^[a-f0-9]{64}$/);
      expect(challenge.hederaAccountId).toBe('0.0.12345');
      expect(challenge.used).toBe(false);
    });

    it('should set expiry to 5 minutes from creation', async () => {
      const before = Date.now();
      const challenge = await challengeService.generateChallenge({
        hederaAccountId: '0.0.12345'
      });
      const after = Date.now();

      const expiryTime = new Date(challenge.expiresAt).getTime();
      const createdTime = new Date(challenge.createdAt).getTime();
      const diff = expiryTime - createdTime;

      expect(diff).toBe(5 * 60 * 1000);
      expect(expiryTime).toBeGreaterThan(before);
      expect(expiryTime).toBeLessThan(after + 5 * 60 * 1000 + 1000);
    });

    it('should store IP address and user agent when provided', async () => {
      const challenge = await challengeService.generateChallenge({
        hederaAccountId: '0.0.12345',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });

      expect(challenge.ipAddress).toBe('192.168.1.1');
      expect(challenge.userAgent).toBe('Mozilla/5.0');
    });
  });

  describe('verifyChallenge', () => {
    it('should verify a valid unused challenge', async () => {
      const generated = await challengeService.generateChallenge({
        hederaAccountId: '0.0.12345'
      });

      const verified = await challengeService.verifyChallenge(
        generated.id,
        '0.0.12345'
      );

      expect(verified).toBeDefined();
      expect(verified?.id).toBe(generated.id);
      expect(verified?.used).toBe(true);
    });

    it('should return null for non-existent challenge', async () => {
      const verified = await challengeService.verifyChallenge(
        'non-existent-id',
        '0.0.12345'
      );

      expect(verified).toBeNull();
    });

    it('should return null for wrong account ID', async () => {
      const generated = await challengeService.generateChallenge({
        hederaAccountId: '0.0.12345'
      });

      const verified = await challengeService.verifyChallenge(
        generated.id,
        '0.0.99999'
      );

      expect(verified).toBeNull();
    });

    it('should return null for expired challenge', async () => {
      const generated = await challengeService.generateChallenge({
        hederaAccountId: '0.0.12345'
      });

      await db
        .update(schema.sqliteAuthChallenges)
        .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
        .where(eq(schema.sqliteAuthChallenges.id, generated.id));

      const verified = await challengeService.verifyChallenge(
        generated.id,
        '0.0.12345'
      );

      expect(verified).toBeNull();
    });

    it('should return null for already used challenge', async () => {
      const generated = await challengeService.generateChallenge({
        hederaAccountId: '0.0.12345'
      });

      const firstVerify = await challengeService.verifyChallenge(
        generated.id,
        '0.0.12345'
      );
      expect(firstVerify).toBeDefined();

      const secondVerify = await challengeService.verifyChallenge(
        generated.id,
        '0.0.12345'
      );
      expect(secondVerify).toBeNull();
    });
  });

  describe('cleanupExpiredChallenges', () => {
    it('should remove expired challenges', async () => {
      const expiredChallenge = await challengeService.generateChallenge({
        hederaAccountId: '0.0.11111'
      });
      
      await db
        .update(schema.sqliteAuthChallenges)
        .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
        .where(eq(schema.sqliteAuthChallenges.id, expiredChallenge.id));

      const validChallenge = await challengeService.generateChallenge({
        hederaAccountId: '0.0.22222'
      });

      await challengeService.cleanupExpiredChallenges();

      const challenges = await db
        .select()
        .from(schema.sqliteAuthChallenges);

      expect(challenges.length).toBe(1);
      expect(challenges[0].id).toBe(validChallenge.id);
    });
  });
});