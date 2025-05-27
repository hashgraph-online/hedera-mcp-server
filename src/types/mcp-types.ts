export type OperationalMode = 'bytes' | 'scheduled' | 'execute';

export type HederaNetwork = 'mainnet' | 'testnet';

export interface MCPClientContext {
  clientId: string;
  sessionId: string;
  hederaAccountId?: string;
  operationalMode: OperationalMode;
  creditBalance: number;
  lastActivity: Date;
  preferences: {
    defaultNetwork: HederaNetwork;
    autoSchedule: boolean;
  };
}

export interface MCPToolResult {
  success: boolean;
  data?: any;
  error?: string;
  transactionId?: string;
  transactionBytes?: string;
  scheduleId?: string;
}

export interface ToolCostCalculation {
  base: number;
  mode: 'fixed' | 'dynamic';
  factors?: {
    network: number;
    complexity: number;
    size: number;
  };
}

export interface MCPError {
  code: number;
  message: string;
  data?: {
    originalError?: string;
    details?: any;
    suggestions?: string[];
  };
}

export interface CreditReservation {
  id: string;
  clientId: string;
  amount: number;
  operation: string;
  status: 'active' | 'committed' | 'refunded' | 'expired';
  createdAt: Date;
  expiresAt: Date;
}

export interface TransactionDependency {
  prerequisite: string;
  dependent: string;
  timeout: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

export interface BatchOperation {
  id: string;
  operations: MCPToolCall[];
  transactionDependencies?: TransactionDependency[];
  creditReservation: string;
  failureStrategy: 'abort' | 'continue' | 'compensate';
  maxConcurrency: number;
  timeout: number;
  metadata: {
    clientId: string;
    sessionId: string;
    description: string;
  };
}

export interface MCPToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface BatchResult {
  success: boolean;
  results?: MCPToolResult[];
  error?: string;
}

export interface HBARPayment {
  transactionId: string;
  amount: number;
  memo?: string;
  timestamp: Date;
}

export interface CreditPurchaseRequest {
  serverAccountId: string;
  hbarAmount: number;
  creditsToReceive: number;
  conversionRate: number;
  memo: string;
} 