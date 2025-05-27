import { HCS10BaseClient, Logger } from '@hashgraphonline/standards-sdk';
import { HederaAgentKit } from '@hashgraphonline/hedera-agent-kit';
import { TransactionReceipt } from '@hashgraph/sdk';
import type { ServerConfig } from '../config/server-config';
import { parseTokenFee } from '../config/server-config';

export interface ServerProfileState {
  isRegistered: boolean;
  accountId: string;
  inboundTopicId?: string | undefined;
  outboundTopicId?: string | undefined;
  profileTopicId?: string | undefined;
  privateKey?: string | undefined;
  lastChecked: Date;
  profileVersion?: string | undefined;
  needsUpdate: boolean;
}

export interface RegistrationParams {
  name: string;
  description: string;
  type: 'autonomous' | 'manual';
  model?: string;
  capabilities: number[];
  profilePicture?:
    | string
    | { url: string; filename: string }
    | { path: string; filename?: string };
  feeCollectorAccountId?: string;
  hbarFee?: number;
  tokenFee?: { amount: number; tokenId: string };
  exemptAccountIds?: string[];
  setAsCurrent: boolean;
  persistence?: { prefix: string };
}

export interface ProfileConfig {
  network: string;
  logLevel: string;
}

export interface ProfileResponse {
  success: boolean;
  profile?: any;
  topicInfo?: any;
}

export interface FullProfileResponse {
  state: ServerProfileState;
  profile: any | null;
  topicInfo: any | null;
}

/**
 * Read-only HCS10 client for profile checking
 */
class ReadOnlyHCS10Client extends HCS10BaseClient {
  constructor(
    private serverAccountId: string,
    config: ProfileConfig
  ) {
    super({ network: config.network as any, logLevel: config.logLevel as any });
  }

  /**
   * Throws an error as this is a read-only client that cannot submit transactions
   * @throws {Error} Always throws as this is a read-only client
   */
  async submitPayload(): Promise<TransactionReceipt> {
    throw new Error('Read-only client - cannot submit transactions');
  }

  /**
   * Gets the account ID and signer for the read-only client
   * @returns {Object} Object containing the server account ID and null signer
   */
  getAccountAndSigner() {
    return { accountId: this.serverAccountId, signer: null };
  }
}

/**
 * Manages server HCS-11 profile state and registration
 */
export class ProfileManager {
  private hcs10Client: HCS10BaseClient;
  private profileState: ServerProfileState | null = null;
  private lastProfileCheck: Date | null = null;

  constructor(
    private config: ServerConfig,
    private hederaKit: HederaAgentKit,
    private logger: Logger
  ) {
    this.hcs10Client = new ReadOnlyHCS10Client(config.SERVER_ACCOUNT_ID, {
      network: config.HEDERA_NETWORK,
      logLevel: config.LOG_LEVEL as any,
    });
  }

  /**
   * Checks if the server account already has a valid HCS-11 profile
   * @param {boolean} forceRefresh - Force refresh even if cache is valid
   * @returns {Promise<ServerProfileState>} The current server profile state
   */
  async checkExistingProfile(
    forceRefresh = false
  ): Promise<ServerProfileState> {
    const now = new Date();
    const cacheExpired =
      !this.lastProfileCheck ||
      now.getTime() - this.lastProfileCheck.getTime() >
        this.config.PROFILE_CACHE_MINUTES * 60 * 1000;

    if (!forceRefresh && this.profileState && !cacheExpired) {
      this.logger.debug('Using cached profile state');
      return this.profileState;
    }

    this.logger.info('Checking existing HCS-11 profile for server account', {
      accountId: this.config.SERVER_ACCOUNT_ID,
    });

    try {
      const profileResponse = await this.hcs10Client.retrieveProfile(
        this.config.SERVER_ACCOUNT_ID,
        true
      ) as ProfileResponse;

      let newState: ServerProfileState;

      if (profileResponse.success && profileResponse.profile) {
        const profile = profileResponse.profile;

        newState = {
          isRegistered: true,
          accountId: this.config.SERVER_ACCOUNT_ID,
          inboundTopicId: profile.inboundTopicId,
          outboundTopicId: profile.outboundTopicId,
          profileTopicId: profileResponse.topicInfo?.profileTopicId,
          lastChecked: now,
          profileVersion: profile.version || '1.0',
          needsUpdate: this.profileNeedsUpdate(profile),
        };

        this.logger.info('Found existing HCS-11 profile', {
          inboundTopicId: newState.inboundTopicId,
          outboundTopicId: newState.outboundTopicId,
          profileTopicId: newState.profileTopicId,
          needsUpdate: newState.needsUpdate,
        });
      } else {
        newState = {
          isRegistered: false,
          accountId: this.config.SERVER_ACCOUNT_ID,
          lastChecked: now,
          needsUpdate: false,
        };

        this.logger.info('No existing HCS-11 profile found for server account');
      }

      this.profileState = newState;
      this.lastProfileCheck = now;
      return newState;
    } catch (error) {
      this.logger.error('Failed to check existing profile', { error });

      const errorState: ServerProfileState = {
        isRegistered: false,
        accountId: this.config.SERVER_ACCOUNT_ID,
        lastChecked: now,
        needsUpdate: false,
      };

      this.profileState = errorState;
      return errorState;
    }
  }

  /**
   * Registers the server as an HCS-10 agent or updates existing profile
   * @returns {Promise<ServerProfileState>} The server profile state after registration
   */
  async ensureProfileRegistration(): Promise<ServerProfileState> {
    const currentState = await this.checkExistingProfile(
      this.config.FORCE_REREGISTER
    );

    const isUpToDate = currentState.isRegistered && !currentState.needsUpdate && !this.config.FORCE_REREGISTER;
    
    if (isUpToDate) {
      this.logger.info('Server profile is up to date, skipping registration');
      return currentState;
    }

    if (this.config.FORCE_REREGISTER) {
      this.logger.warn('FORCE_REREGISTER is enabled, re-registering agent');
    } else if (currentState.needsUpdate) {
      this.logger.info(
        'Profile needs update, re-registering with new information'
      );
    }

    return await this.performRegistration();
  }

  /**
   * Performs the actual registration using RegisterAgentTool
   * @returns {Promise<ServerProfileState>} The new server profile state
   * @throws {Error} If registration fails
   */
  private async performRegistration(): Promise<ServerProfileState> {
    this.logger.info('Registering server as HCS-10 agent...');

    try {
      const tools = this.hederaKit.getAggregatedLangChainTools();
      const registerTool = tools.find((tool) => tool.name === 'register_agent');

      if (!registerTool) {
        throw new Error(
          'RegisterAgentTool not found in hedera-agent-kit tools'
        );
      }

      const registrationParams = this.buildRegistrationParams();

      this.logger.debug('Registration parameters', {
        name: registrationParams.name,
        capabilities: registrationParams.capabilities,
        hasProfilePicture: !!registrationParams.profilePicture,
        hasHbarFee: !!registrationParams.hbarFee,
        hasTokenFee: !!registrationParams.tokenFee,
      });

      const resultString = await registerTool.invoke(registrationParams);
      const result = JSON.parse(resultString);

      if (!result.success) {
        throw new Error(
          `HCS-10 registration failed: ${result.message || 'Unknown error'}`
        );
      }

      const newState: ServerProfileState = {
        isRegistered: true,
        accountId: result.accountId,
        inboundTopicId: result.inboundTopicId,
        outboundTopicId: result.outboundTopicId,
        profileTopicId: result.profileTopicId,
        privateKey: result.privateKey,
        lastChecked: new Date(),
        profileVersion: '1.0',
        needsUpdate: false,
      };

      this.profileState = newState;

      this.logger.info('Successfully registered as HCS-10 agent', {
        accountId: newState.accountId,
        inboundTopicId: newState.inboundTopicId,
        outboundTopicId: newState.outboundTopicId,
        profileTopicId: newState.profileTopicId,
      });

      return newState;
    } catch (error) {
      this.logger.error('Failed to register as HCS-10 server', { error });
      throw error;
    }
  }

  /**
   * Builds registration parameters from configuration
   * @returns {RegistrationParams} The registration parameters
   */
  private buildRegistrationParams(): RegistrationParams {
    const params: RegistrationParams = {
      name: this.config.AGENT_NAME,
      description: this.config.AGENT_DESCRIPTION,
      type: this.config.AGENT_TYPE,
      model: this.config.AGENT_MODEL,
      capabilities: this.config.AGENT_CAPABILITIES,
      setAsCurrent: false,
    };

    if (this.config.AGENT_PROFILE_PICTURE) {
      params.profilePicture = { path: this.config.AGENT_PROFILE_PICTURE };
    } else if (this.config.AGENT_PROFILE_PICTURE_URL) {
      params.profilePicture = {
        url: this.config.AGENT_PROFILE_PICTURE_URL,
        filename: 'profile.png',
      };
    }

    if (this.config.FEE_COLLECTOR_ACCOUNT_ID) {
      params.feeCollectorAccountId = this.config.FEE_COLLECTOR_ACCOUNT_ID;
    }

    const hasHbarFee = this.config.AGENT_HBAR_FEE && this.config.AGENT_HBAR_FEE > 0;
    if (hasHbarFee && this.config.AGENT_HBAR_FEE !== undefined) {
      params.hbarFee = this.config.AGENT_HBAR_FEE;
    }

    const tokenFee = parseTokenFee(this.config.AGENT_TOKEN_FEE);
    if (tokenFee) {
      params.tokenFee = tokenFee;
    }

    const hasExemptAccounts = this.config.AGENT_EXEMPT_ACCOUNTS && this.config.AGENT_EXEMPT_ACCOUNTS.length > 0;
    if (hasExemptAccounts && this.config.AGENT_EXEMPT_ACCOUNTS !== undefined) {
      params.exemptAccountIds = this.config.AGENT_EXEMPT_ACCOUNTS;
    }

    if (this.config.PERSIST_AGENT_DATA) {
      params.persistence = { prefix: this.config.AGENT_DATA_PREFIX };
    }

    return params;
  }

  /**
   * Determines if an existing profile needs to be updated
   * @param {any} existingProfile - The existing profile to check
   * @returns {boolean} True if the profile needs updating
   */
  private profileNeedsUpdate(existingProfile: any): boolean {
    if (!existingProfile) return true;

    const nameChanged = existingProfile.display_name !== this.config.AGENT_NAME;
    const bioChanged = existingProfile.bio !== this.config.AGENT_DESCRIPTION;
    const typeValue = this.config.AGENT_TYPE === 'manual' ? 2 : 1;
    const typeChanged = existingProfile.type !== typeValue;

    if (nameChanged || bioChanged || typeChanged) return true;

    const existingCapabilities = existingProfile.capabilities || [];
    const configCapabilities = this.config.AGENT_CAPABILITIES;

    const capabilitiesLengthDiffer = existingCapabilities.length !== configCapabilities.length;
    const capabilitiesMismatch = !existingCapabilities.every((cap: number) =>
      configCapabilities.includes(cap)
    );

    if (capabilitiesLengthDiffer || capabilitiesMismatch) return true;

    const mcpServerMissing = !existingProfile.mcpServer && this.config.ENABLE_HCS10;
    if (mcpServerMissing) return true;

    return false;
  }

  /**
   * Gets current profile state (cached)
   * @returns {ServerProfileState | null} The cached profile state or null
   */
  getProfileState(): ServerProfileState | null {
    return this.profileState;
  }

  /**
   * Forces a profile refresh
   * @returns {Promise<ServerProfileState>} The refreshed profile state
   */
  async refreshProfile(): Promise<ServerProfileState> {
    return await this.checkExistingProfile(true);
  }

  /**
   * Gets the full profile data including all metadata
   * @returns {Promise<FullProfileResponse>} The full profile response
   */
  async getFullProfile(): Promise<FullProfileResponse> {
    const state = await this.checkExistingProfile(true);
    
    try {
      const profileResponse = await this.hcs10Client.retrieveProfile(
        this.config.SERVER_ACCOUNT_ID,
        true
      ) as ProfileResponse;
      
      return {
        state,
        profile: profileResponse.success ? profileResponse.profile : null,
        topicInfo: profileResponse.topicInfo || null,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve full profile', { error });
      return {
        state,
        profile: null,
        topicInfo: null,
      };
    }
  }
}
