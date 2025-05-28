import { PublicKey } from '@hashgraph/sdk';
import {
  type NetworkType,
  HederaMirrorNode,
  Logger,
} from '@hashgraphonline/standards-sdk';
import { proto } from '@hashgraph/proto';

interface VerifySignatureOptions {
  hederaAccountId: string;
  message: string;
  signature: string;
  publicKey: string;
}

/**
 * Convert base64 signature to SignatureMap protobuf
 * @param base64string - Base64 encoded signature from wallet
 * @returns Decoded SignatureMap
 */
function base64StringToSignatureMap(base64string: string): proto.SignatureMap {
  const encoded = Buffer.from(base64string, 'base64');
  return proto.SignatureMap.decode(encoded);
}

/**
 * Add Hedera message prefix as per wallet signing standard
 * @param message - Original message to sign
 * @returns Prefixed message
 */
function prefixMessageToSign(message: string): string {
  return '\x19Hedera Signed Message:\n' + message.length + message;
}

/**
 * Verify a Hedera message signature using protobuf SignatureMap
 * @param message - Original message that was signed
 * @param base64SignatureMap - Base64 encoded SignatureMap from wallet
 * @param publicKey - Public key to verify against
 * @returns True if signature is valid
 */
function verifyMessageSignature(message: string, base64SignatureMap: string, publicKey: PublicKey): boolean {
  try {
    const signatureMap = base64StringToSignatureMap(base64SignatureMap);
    
    if (!signatureMap.sigPair || signatureMap.sigPair.length === 0) {
      throw new Error('No signature pairs found in signature map');
    }
    
    const signature = signatureMap.sigPair[0]?.ed25519 || signatureMap.sigPair[0]?.ECDSASecp256k1;

    if (!signature) {
      throw new Error('Signature not found in signature map');
    }

    const prefixed = Buffer.from(prefixMessageToSign(message));
    return publicKey.verify(prefixed, signature);
  } catch (error) {
    console.error('Error verifying message signature:', error);
    return false;
  }
}

/**
 * Service for verifying Hedera account signatures
 */
export class SignatureService {
  private mirrorNode: HederaMirrorNode;
  private logger: Logger;

  constructor(network: NetworkType, logger?: Logger) {
    this.logger = logger || new Logger({ level: 'info', module: 'SignatureService' });
    this.mirrorNode = new HederaMirrorNode(
      network,
      this.logger,
    );
  }

  /**
   * Verify a signature against a Hedera account
   * @param options - Options for signature verification
   * @returns True if signature is valid, false otherwise
   */
  async verifySignature(options: VerifySignatureOptions): Promise<boolean> {
    try {
      const accountInfo = await this.mirrorNode.requestAccount(
        options.hederaAccountId,
      );
      if (!accountInfo || !accountInfo.key) {
        this.logger.error('No account info or key found for account:', options.hederaAccountId);
        return false;
      }

      let publicKey: PublicKey;
      
      if (options.publicKey && options.publicKey.length > 0) {
        publicKey = PublicKey.fromString(options.publicKey);
      } else {
        if (typeof accountInfo.key.key === 'string') {
          try {
            publicKey = PublicKey.fromString(accountInfo.key.key);
          } catch (error) {
            this.logger.error('Failed to parse public key from account info:', error);
            return false;
          }
        } else {
          this.logger.error('Account key format not supported');
          return false;
        }
      }

      if (options.publicKey && options.publicKey.length > 0) {
        const isValidKey = await this.checkKeyMatch(accountInfo.key, publicKey);
        if (!isValidKey) {
          this.logger.error('Public key does not match account key');
          return false;
        }
      }

      try {
        const isValidSignature = verifyMessageSignature(options.message, options.signature, publicKey);
        this.logger.debug('Protobuf signature verification result:', isValidSignature);
        return isValidSignature;
      } catch (protobufError) {
        this.logger.debug('Protobuf verification failed, trying direct verification:', protobufError);
        
        try {
          const messageBytes = Buffer.from(options.message, 'utf8');
          let signatureBuffer: Buffer;
          
          try {
            signatureBuffer = Buffer.from(options.signature, 'base64');
          } catch {
            signatureBuffer = Buffer.from(options.signature, 'hex');
          }

          const isValidSignature = publicKey.verify(messageBytes, signatureBuffer);
          this.logger.debug('Direct signature verification result:', isValidSignature);
          return isValidSignature;
        } catch (directError) {
          this.logger.error('Both protobuf and direct verification failed:', directError);
          return false;
        }
      }
    } catch (error) {
      this.logger.error('Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Check if a public key matches the account key
   * @param accountKey - The account key from mirror node
   * @param publicKey - The public key to check
   * @returns True if keys match, false otherwise
   */
  private async checkKeyMatch(
    accountKey: any,
    publicKey: PublicKey,
  ): Promise<boolean> {
    try {
      const publicKeyString = publicKey.toString();
      const publicKeyStringRaw = publicKey.toStringRaw();
      const publicKeyStringDer = publicKey.toStringDer();
      
      if (accountKey.key === publicKeyString || 
          accountKey.key === publicKeyStringRaw ||
          accountKey.key === publicKeyStringDer) {
        return true;
      }

      if (accountKey._type === 'ProtobufEncoded' && accountKey.key) {
        const keyBytes = Buffer.from(accountKey.key, 'hex');
        return await this.mirrorNode.checkKeyListAccess(keyBytes, publicKey);
      }

      return false;
    } catch (error) {
      this.logger.error('Error checking key match:', error);
      return false;
    }
  }

  /**
   * Create a message to sign for authentication
   * @param challenge - The challenge string
   * @param timestamp - The timestamp
   * @param accountId - The Hedera account ID
   * @param network - The Hedera network (mainnet or testnet)
   * @param nonce - The nonce for the challenge
   * @returns The message to sign
   */
  static createAuthMessage(
    challenge: string,
    timestamp: number,
    accountId: string,
    network: string,
    nonce?: string
  ): string {
    return `Sign this message to authenticate with MCP Server\n\nChallenge: ${challenge}\nNonce: ${nonce || challenge}\nTimestamp: ${timestamp}\nAccount: ${accountId}\nNetwork: ${network}`;
  }
}
