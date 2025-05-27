export type VerificationType = 'dns' | 'signature' | 'challenge';

export type HCS11ProfileType = 0 | 1 | 2;

export interface HCS11Profile {
  version: string;
  type: HCS11ProfileType;
  display_name: string;
  alias: string;
  bio: string;
  profileImage?: string;
  inboundTopicId: string;
  outboundTopicId: string;
  properties: {
    description: string;
    supportedClients: string[];
    version: string;
  };
  mcpServer?: {
    version: string;
    connectionInfo: {
      url: string;
      transport: 'stdio' | 'http' | 'sse';
    };
    services: number[];
    description: string;
    verification: {
      type: VerificationType;
      value: string;
      dns_field?: string;
    };
    capabilities: string[];
    tools: Array<{
      name: string;
      description: string;
    }>;
    maintainer: string;
    repository: string;
    docs: string;
  };
}

export interface ServerIdentity {
  accountId: string;
  privateKey: string;
  publicKey: string;
  alias: string;
  displayName: string;
  bio: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileTopicId?: string;
  verification: VerificationConfig;
}

export interface VerificationConfig {
  type: VerificationType;
  domain?: string;
  dnsField?: string;
  publicKey?: string;
  signature?: string;
  challengeEndpoint?: string;
}

export interface HCS10Connection {
  id: string;
  remoteAccountId: string;
  remoteAlias?: string;
  status: 'pending' | 'active' | 'rejected' | 'disconnected';
  inboundTopicId: string;
  outboundTopicId: string;
  createdAt: Date;
  lastActivity: Date;
  metadata?: Record<string, unknown>;
}

export interface HCS10Message {
  id: string;
  type: 'connection_request' | 'connection_response' | 'tool_call' | 'tool_response' | 'ping' | 'profile_update';
  from: string;
  to: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  signature?: string;
}

export interface ConnectionRequest {
  requestId: string;
  fromAccountId: string;
  fromAlias?: string;
  fromDisplayName?: string;
  message?: string;
  inboundTopicId: string;
  outboundTopicId: string;
  expiresAt: Date;
}

export interface ToolCallMessage {
  callId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  operationalMode?: 'bytes' | 'scheduled' | 'direct';
  creditReservation?: string;
}

export interface ToolResponseMessage {
  callId: string;
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  creditsUsed?: number;
} 