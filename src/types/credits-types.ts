export interface CreditBalance {
  clientId: string;
  balance: number;
  lastUpdated: Date;
}

export interface CreditTransaction {
  id: string;
  clientId: string;
  toolName: string;
  operationalMode: string;
  creditsDeducted: number;
  creditsRefunded: number;
  transactionStatus: 'pending' | 'completed' | 'failed' | 'refunded';
  executionTimeMs?: number;
  createdAt: Date;
}

export interface HBARPaymentRecord {
  id: string;
  clientId: string;
  transactionId: string;
  hbarAmount: number;
  creditsAllocated: number;
  conversionRate: number;
  paymentMemo?: string;
  networkFee?: number;
  processedAt: Date;
  consensusTimestamp?: Date;
}

export interface ConversionRate {
  id: string;
  hbarPerCredit: number;
  effectiveDate: Date;
  createdBy: string;
  notes?: string;
}

export interface PricingConfiguration {
  baseCosts: Record<string, number>;
  networkMultipliers: {
    mainnet: number;
    testnet: number;
  };
  complexityFactors: Record<string, number>;
  sizeFactorPerKB: number;
  minimumCharge: number;
  volumeDiscounts: {
    threshold: number;
    discount: number;
  }[];
}

export interface CreditUsageStats {
  totalCreditsUsed: number;
  totalOperations: number;
  averageCostPerOperation: number;
  mostUsedTools: Array<{
    toolName: string;
    usageCount: number;
    totalCost: number;
  }>;
  costByMode: Record<string, number>;
  timeRange: {
    start: Date;
    end: Date;
  };
} 