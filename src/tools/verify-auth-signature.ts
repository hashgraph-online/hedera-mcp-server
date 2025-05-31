import { z } from 'zod';
import { Logger } from '@hashgraphonline/standards-sdk';
import { ChallengeService } from '../auth/challenge-service';
import { SignatureService } from '../auth/signature-service';
import { ApiKeyService } from '../auth/api-key-service';
import { config } from '../config/server-config';

/**
 * Verify authentication signature and generate API key
 * 
 * Verifies a signed challenge to authenticate a Hedera account and generates
 * an API key for authenticated access. The challenge must be verified before
 * signature verification to ensure validity.
 * 
 * @param params Object containing verification parameters
 * @param params.challengeId The challenge ID to verify
 * @param params.hederaAccountId The Hedera account ID that signed the challenge
 * @param params.signature The signature of the challenge message
 * @param params.publicKey The public key of the account
 * @param params.timestamp The timestamp used in the signed message
 * @param params.name Optional name for the generated API key
 * @param params.permissions Optional permissions array for the API key
 * @param params.expiresIn Optional expiration time in seconds
 * @returns JSON response with API key details or error information
 */
export function createVerifyAuthSignatureTool(
  challengeService: ChallengeService | null,
  signatureService: SignatureService | null,
  apiKeyService: ApiKeyService | null,
  logger: Logger
) {
  return {
    name: 'verify_auth_signature',
    description: 'Verify authentication signature and generate API key',
    parameters: z.object({
      challengeId: z.string().describe('The challenge ID to verify'),
      hederaAccountId: z.string().describe('The Hedera account ID that signed the challenge'),
      signature: z.string().describe('The signature of the challenge message'),
      publicKey: z.string().describe('The public key of the account'),
      timestamp: z.number().describe('The timestamp used in the signed message'),
      name: z.string().optional().describe('Optional name for the generated API key'),
      permissions: z.array(z.string()).optional().describe('Optional permissions array for the API key'),
      expiresIn: z.number().optional().describe('Optional expiration time in seconds'),
    }),
    async execute(params: {
      challengeId: string;
      hederaAccountId: string;
      signature: string;
      publicKey: string;
      timestamp: number;
      name?: string;
      permissions?: string[];
      expiresIn?: number;
    }) {
      if (!challengeService) {
        return JSON.stringify({
          error: 'Challenge service not initialized',
          apiKey: null,
          keyId: null,
          expiresAt: null,
        });
      }

      if (!signatureService) {
        return JSON.stringify({
          error: 'Signature service not initialized',
          apiKey: null,
          keyId: null,
          expiresAt: null,
        });
      }

      if (!apiKeyService) {
        return JSON.stringify({
          error: 'API key service not initialized',
          apiKey: null,
          keyId: null,
          expiresAt: null,
        });
      }

      try {
        const challenge = await challengeService.verifyChallenge(params.challengeId, params.hederaAccountId);
        if (!challenge) {
          return JSON.stringify({
            error: 'Invalid or expired challenge',
            apiKey: null,
            keyId: null,
            expiresAt: null,
          });
        }

        const message = SignatureService.createAuthMessage(
          challenge.challenge,
          params.timestamp,
          params.hederaAccountId,
          config.HEDERA_NETWORK,
          challenge.challenge
        );

        const isValidSignature = await signatureService.verifySignature({
          hederaAccountId: params.hederaAccountId,
          message,
          signature: params.signature,
          publicKey: params.publicKey,
        });

        if (!isValidSignature) {
          return JSON.stringify({
            error: 'Invalid signature',
            apiKey: null,
            keyId: null,
            expiresAt: null,
          });
        }

        const expiresAt = params.expiresIn
          ? new Date(Date.now() + params.expiresIn * 1000)
          : undefined;

        const apiKey = await apiKeyService.generateApiKey({
          hederaAccountId: params.hederaAccountId,
          name: params.name || 'API Key',
          permissions: params.permissions || ['read'],
          expiresAt: expiresAt || null,
        });

        return JSON.stringify({
          apiKey: apiKey.plainKey,
          keyId: apiKey.id,
          expiresAt: apiKey.expires_at,
          permissions: apiKey.permissions,
        });
      } catch (error) {
        logger.error('Failed to verify auth signature', { error });
        return JSON.stringify({
          error: 'Failed to verify authentication signature',
          apiKey: null,
          keyId: null,
          expiresAt: null,
        });
      }
    },
  };
}