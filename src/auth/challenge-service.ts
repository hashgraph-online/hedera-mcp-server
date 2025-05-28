import { randomBytes } from 'crypto';
import { eq, and, lt } from 'drizzle-orm';
import * as schema from '../db/schema';

interface CreateChallengeOptions {
  hederaAccountId: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Service for managing authentication challenges
 */
export class ChallengeService {
  private db: any;
  private isPostgres: boolean;

  constructor(db: any, isPostgres: boolean) {
    this.db = db;
    this.isPostgres = isPostgres;
  }

  /**
   * Generate a new authentication challenge
   * @param options - Options for creating the challenge
   * @returns The generated challenge
   */
  async generateChallenge(options: CreateChallengeOptions) {
    const challengeId = randomBytes(16).toString('hex');
    const challengeText = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const authChallenges = this.isPostgres
      ? schema.pgAuthChallenges
      : schema.sqliteAuthChallenges;

    const challenge = {
      id: challengeId,
      hederaAccountId: options.hederaAccountId,
      challenge: challengeText,
      expiresAt,
      createdAt: new Date().toISOString(),
      used: false,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    };

    await this.db.insert(authChallenges).values(challenge);

    return challenge;
  }

  /**
   * Verify and consume a challenge
   * @param challengeId - The challenge ID to verify
   * @param hederaAccountId - The Hedera account ID attempting to use the challenge
   * @returns The challenge if valid, null otherwise
   */
  async verifyChallenge(challengeId: string, hederaAccountId: string) {
    const authChallenges = this.isPostgres
      ? schema.pgAuthChallenges
      : schema.sqliteAuthChallenges;

    const challenges = await this.db
      .select()
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.id, challengeId),
          eq(authChallenges.hederaAccountId, hederaAccountId),
          eq(authChallenges.used, false)
        )
      )
      .limit(1);

    const challenge = challenges[0];
    if (!challenge || new Date(challenge.expiresAt) < new Date()) {
      return null;
    }

    await this.db
      .update(authChallenges)
      .set({ used: true })
      .where(eq(authChallenges.id, challengeId));

    return { ...challenge, used: true };
  }

  /**
   * Clean up expired challenges
   * @returns Number of challenges deleted
   */
  async cleanupExpiredChallenges(): Promise<number> {
    const authChallenges = this.isPostgres
      ? schema.pgAuthChallenges
      : schema.sqliteAuthChallenges;

    const result = await this.db
      .delete(authChallenges)
      .where(
        lt(authChallenges.expiresAt, new Date().toISOString())
      );

    return result.changes || result.rowCount || 0;
  }
}