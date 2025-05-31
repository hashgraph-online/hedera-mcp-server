import { z } from 'zod';
import { Logger } from '@hashgraphonline/standards-sdk';
import { ChallengeService } from '../auth/challenge-service';
import { config } from '../config/server-config';

/**
 * Request authentication challenge for a Hedera account
 * 
 * Generates a new authentication challenge that can be signed by the account holder
 * to prove ownership. The challenge expires after 5 minutes and can only be used once.
 * 
 * @param params Object containing the Hedera account ID
 * @param params.hederaAccountId The Hedera account ID requesting authentication
 * @returns JSON response with challenge details or error information
 */
export function createRequestAuthChallengeTool(
  challengeService: ChallengeService | null,
  logger: Logger
) {
  return {
    name: 'request_auth_challenge',
    description: 'Request authentication challenge for a Hedera account',
    parameters: z.object({
      hederaAccountId: z.string().describe('The Hedera account ID requesting authentication'),
    }),
    async execute(params: { hederaAccountId: string }) {
      if (!challengeService) {
        return JSON.stringify({
          error: 'Challenge service not initialized',
          challengeId: null,
          challenge: null,
          expiresAt: null,
        });
      }

      try {
        const challenge = await challengeService.generateChallenge({
          hederaAccountId: params.hederaAccountId,
        });
        
        return JSON.stringify({
          challengeId: challenge.id,
          challenge: challenge.challenge,
          expiresAt: challenge.expiresAt,
          network: config.HEDERA_NETWORK,
        });
      } catch (error) {
        logger.error('Failed to create auth challenge', { error });
        return JSON.stringify({
          error: 'Failed to create authentication challenge',
          challengeId: null,
          challenge: null,
          expiresAt: null,
        });
      }
    },
  };
}