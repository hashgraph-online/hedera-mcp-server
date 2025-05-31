import { z } from 'zod';
import { Logger } from '@hashgraphonline/standards-sdk';
import { ApiKeyService } from '../auth/api-key-service';

/**
 * Revoke an API key for the authenticated account
 *
 * Permanently disables an API key, making it unusable for authentication.
 * The key cannot be reactivated after revocation and a new key must be
 * generated if access is needed again.
 *
 * @param params Object containing the key ID to revoke
 * @param params.keyId The ID of the API key to revoke
 * @param params.hederaAccountId The Hedera account ID that owns the key
 * @returns JSON response with revocation status or error information
 */
export function createRevokeApiKeyTool(
  apiKeyService: ApiKeyService | null,
  logger: Logger,
) {
  return {
    name: 'revoke_api_key',
    description: 'Revoke an API key for the authenticated account',
    parameters: z.object({
      keyId: z.string().describe('The ID of the API key to revoke'),
      hederaAccountId: z
        .string()
        .describe('The Hedera account ID that owns the key'),
    }),
    async execute(params: { keyId: string; hederaAccountId: string }) {
      if (!apiKeyService) {
        return JSON.stringify({
          error: 'API key service not initialized',
          success: false,
        });
      }

      try {
        const revoked = await apiKeyService.revokeApiKey(
          params.keyId,
          params.hederaAccountId,
        );

        if (!revoked) {
          return JSON.stringify({
            error: 'API key not found or unauthorized',
            success: false,
          });
        }

        return JSON.stringify({
          success: true,
          message: 'API key revoked successfully',
          keyId: params.keyId,
        });
      } catch (error) {
        logger.error('Failed to revoke API key', { error });
        return JSON.stringify({
          error: 'Failed to revoke API key',
          success: false,
        });
      }
    },
  };
}
