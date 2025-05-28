import { Router } from 'express';
import type { Request, Response } from 'express';
import { ChallengeService } from './challenge-service';
import { SignatureService } from './signature-service';
import { ApiKeyService } from './api-key-service';
import { config } from '../config/server-config';

interface AuthRequest {
  hederaAccountId: string;
}

interface VerifyRequest {
  challengeId: string;
  hederaAccountId: string;
  signature: string;
  publicKey: string;
  timestamp: number;
}

interface GenerateApiKeyRequest {
  name?: string;
  permissions?: string[];
  expiresIn?: number;
}

/**
 * Create authentication routes
 * @param challengeService - Service for managing challenges
 * @param signatureService - Service for verifying signatures
 * @param apiKeyService - Service for managing API keys
 * @returns Express router with auth endpoints
 */
export function createAuthRoutes(
  challengeService: ChallengeService,
  signatureService: SignatureService,
  apiKeyService: ApiKeyService
): Router {
  const router = Router();

  /**
   * Generate authentication challenge
   */
  router.post('/api/v1/auth/challenge', async (req: Request, res: Response) => {
    try {
      const { hederaAccountId } = req.body as AuthRequest;

      if (!hederaAccountId) {
        return res.status(400).json({
          error: 'Missing hederaAccountId',
        });
      }

      const challenge = await challengeService.generateChallenge({
        hederaAccountId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        challengeId: challenge.id,
        challenge: challenge.challenge,
        expiresAt: challenge.expiresAt,
        network: config.HEDERA_NETWORK,
      });
    } catch (error) {
      console.error('Error generating challenge:', error);
      res.status(500).json({
        error: 'Failed to generate challenge',
      });
    }
  });

  /**
   * Verify signature and generate API key
   */
  router.post('/api/v1/auth/verify', async (req: Request, res: Response) => {
    try {
      const { challengeId, hederaAccountId, signature, publicKey, timestamp } = req.body as VerifyRequest;

      if (!challengeId || !hederaAccountId || !signature || !timestamp) {
        return res.status(400).json({
          error: 'Missing required fields (challengeId, hederaAccountId, signature, timestamp)',
        });
      }

      const challenge = await challengeService.verifyChallenge(challengeId, hederaAccountId);
      if (!challenge) {
        return res.status(401).json({
          error: 'Invalid or expired challenge',
        });
      }

      const message = SignatureService.createAuthMessage(
        challenge.challenge,
        timestamp,
        hederaAccountId,
        config.HEDERA_NETWORK,
        challenge.challenge
      );
      const isValidSignature = await signatureService.verifySignature({
        hederaAccountId,
        message,
        signature,
        publicKey,
      });

      if (!isValidSignature) {
        return res.status(401).json({
          error: 'Invalid signature',
        });
      }

      const generateKeyRequest = req.body as GenerateApiKeyRequest;
      const expiresAt = generateKeyRequest.expiresIn
        ? new Date(Date.now() + generateKeyRequest.expiresIn * 1000)
        : undefined;

      const apiKey = await apiKeyService.generateApiKey({
        hederaAccountId,
        name: generateKeyRequest.name,
        permissions: generateKeyRequest.permissions,
        expiresAt,
      });

      res.json({
        apiKey: apiKey.plainKey,
        keyId: apiKey.id,
        expiresAt: apiKey.expires_at,
        permissions: apiKey.permissions,
      });
    } catch (error) {
      console.error('Error verifying signature:', error);
      res.status(500).json({
        error: 'Failed to verify signature',
      });
    }
  });

  /**
   * List API keys for an account
   */
  router.get('/api/v1/auth/keys', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Missing or invalid authorization header',
        });
      }

      const apiKey = authHeader.substring(7);
      const keyDetails = await apiKeyService.verifyApiKey(apiKey);

      if (!keyDetails) {
        return res.status(401).json({
          error: 'Invalid API key',
        });
      }

      const keys = await apiKeyService.getApiKeysByAccount(keyDetails.hedera_account_id);
      const sanitizedKeys = keys.map(key => ({
        id: key.id,
        name: key.name,
        permissions: key.permissions,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
        expiresAt: key.expires_at,
        isActive: key.is_active,
      }));

      res.json({
        keys: sanitizedKeys,
      });
    } catch (error) {
      console.error('Error listing API keys:', error);
      res.status(500).json({
        error: 'Failed to list API keys',
      });
    }
  });

  /**
   * Rotate an API key
   */
  router.post('/api/v1/auth/keys/rotate', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Missing or invalid authorization header',
        });
      }

      const apiKey = authHeader.substring(7);
      const keyDetails = await apiKeyService.verifyApiKey(apiKey);

      if (!keyDetails) {
        return res.status(401).json({
          error: 'Invalid API key',
        });
      }

      const newKey = await apiKeyService.rotateApiKey(keyDetails.id, keyDetails.hedera_account_id);

      res.json({
        apiKey: newKey.plainKey,
        keyId: newKey.id,
        expiresAt: newKey.expires_at,
        message: 'API key rotated successfully. The old key will be revoked.',
      });
    } catch (error) {
      console.error('Error rotating API key:', error);
      res.status(500).json({
        error: 'Failed to rotate API key',
      });
    }
  });

  /**
   * Revoke an API key
   */
  router.delete('/api/v1/auth/keys/:keyId', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Missing or invalid authorization header',
        });
      }

      const apiKey = authHeader.substring(7);
      const keyDetails = await apiKeyService.verifyApiKey(apiKey);

      if (!keyDetails) {
        return res.status(401).json({
          error: 'Invalid API key',
        });
      }

      const { keyId } = req.params;
      const revoked = await apiKeyService.revokeApiKey(keyId, keyDetails.hedera_account_id);

      if (!revoked) {
        return res.status(404).json({
          error: 'API key not found or unauthorized',
        });
      }

      res.json({
        success: true,
        message: 'API key revoked successfully',
      });
    } catch (error) {
      console.error('Error revoking API key:', error);
      res.status(500).json({
        error: 'Failed to revoke API key',
      });
    }
  });

  return router;
}