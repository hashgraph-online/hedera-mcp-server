export interface OperationPricing {
  operationName: string;
  category: 'free' | 'basic' | 'standard' | 'premium' | 'enterprise';
  baseCost: number;
  description: string;
  complexityMultiplier?: number;
  sizeMultiplier?: number;
  networkMultiplier?: {
    mainnet: number;
    testnet: number;
  };
}

export interface TierPricing {
  tier: string;
  minCredits: number;
  maxCredits: number;
  discountPercentage: number;
  hbarPerCredit: number;
}

export interface PricingConfig {
  baseHbarPerCredit: number;
  minimumPurchase: {
    credits: number;
    hbar: number;
  };
  purchaseTiers: TierPricing[];
  operations: OperationPricing[];
  rules: {
    bulkOperationDiscount: number;
    bulkOperationThreshold: number;
    peakHoursMultiplier: number;
    peakHoursUTC: { start: number; end: number };
    loyaltyTiers: Array<{
      totalCreditsUsed: number;
      discountPercentage: number;
    }>;
  };
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  baseHbarPerCredit: 0.01,
  minimumPurchase: {
    credits: 1000,
    hbar: 10,
  },
  purchaseTiers: [
    {
      tier: 'starter',
      minCredits: 0,
      maxCredits: 10000,
      discountPercentage: 0,
      hbarPerCredit: 0.01,
    },
    {
      tier: 'growth',
      minCredits: 10001,
      maxCredits: 100000,
      discountPercentage: 10,
      hbarPerCredit: 0.009,
    },
    {
      tier: 'business',
      minCredits: 100001,
      maxCredits: 1000000,
      discountPercentage: 20,
      hbarPerCredit: 0.008,
    },
    {
      tier: 'enterprise',
      minCredits: 1000001,
      maxCredits: Infinity,
      discountPercentage: 30,
      hbarPerCredit: 0.007,
    },
  ],
  operations: [
    {
      operationName: 'health_check',
      category: 'free',
      baseCost: 0,
      description: 'System health check',
    },
    {
      operationName: 'get_server_info',
      category: 'free',
      baseCost: 0,
      description: 'Get server information',
    },
    {
      operationName: 'get_balance',
      category: 'free',
      baseCost: 0,
      description: 'Check credit balance',
    },
    {
      operationName: 'get_account_info',
      category: 'basic',
      baseCost: 1,
      description: 'Query account information',
    },
    {
      operationName: 'get_transaction_info',
      category: 'basic',
      baseCost: 1,
      description: 'Query transaction details',
    },
    {
      operationName: 'refresh_profile',
      category: 'basic',
      baseCost: 2,
      description: 'Refresh HCS-11 profile',
    },
    {
      operationName: 'query_balance',
      category: 'basic',
      baseCost: 2,
      description: 'Query Hedera account balance',
    },
    {
      operationName: 'generate_transaction_bytes',
      category: 'standard',
      baseCost: 5,
      description: 'Generate transaction bytes',
      complexityMultiplier: 1.5,
    },
    {
      operationName: 'create_token',
      category: 'standard',
      baseCost: 10,
      description: 'Create fungible token',
    },
    {
      operationName: 'schedule_transaction',
      category: 'standard',
      baseCost: 10,
      description: 'Create scheduled transaction',
      networkMultiplier: {
        mainnet: 1.2,
        testnet: 1.0,
      },
    },
    {
      operationName: 'execute_transaction',
      category: 'standard',
      baseCost: 15,
      description: 'Execute transaction directly',
      networkMultiplier: {
        mainnet: 1.5,
        testnet: 1.0,
      },
    },
    {
      operationName: 'create_nft',
      category: 'premium',
      baseCost: 25,
      description: 'Create NFT collection',
    },
    {
      operationName: 'mint_nft',
      category: 'premium',
      baseCost: 20,
      description: 'Mint NFT',
      sizeMultiplier: 5,
    },
    {
      operationName: 'smart_contract_call',
      category: 'premium',
      baseCost: 30,
      description: 'Call smart contract function',
      complexityMultiplier: 2.0,
    },
    {
      operationName: 'multi_sig_transaction',
      category: 'premium',
      baseCost: 50,
      description: 'Multi-signature transaction',
    },
    {
      operationName: 'batch_transactions',
      category: 'enterprise',
      baseCost: 100,
      description: 'Batch transaction processing',
      complexityMultiplier: 0.8,
    },
    {
      operationName: 'deploy_contract',
      category: 'enterprise',
      baseCost: 200,
      description: 'Deploy smart contract',
      sizeMultiplier: 10,
    },
    {
      operationName: 'consensus_submit_large',
      category: 'enterprise',
      baseCost: 150,
      description: 'Submit large consensus message',
      sizeMultiplier: 20,
    },
  ],
  rules: {
    bulkOperationDiscount: 20,
    bulkOperationThreshold: 10,
    peakHoursMultiplier: 1.2,
    peakHoursUTC: { start: 14, end: 22 },
    loyaltyTiers: [
      { totalCreditsUsed: 10000, discountPercentage: 5 },
      { totalCreditsUsed: 50000, discountPercentage: 10 },
      { totalCreditsUsed: 100000, discountPercentage: 15 },
      { totalCreditsUsed: 500000, discountPercentage: 20 },
    ],
  },
};

/**
 * Calculates the number of credits a user receives for a given HBAR amount
 * based on the tiered pricing structure. Higher tiers offer better rates.
 * @param hbarAmount The amount of HBAR to convert to credits
 * @returns The number of credits (rounded down to nearest integer)
 */
export function calculateCreditsForHbar(hbarAmount: number): number {
  let remainingHbar = hbarAmount;
  let totalCredits = 0;
  
  for (const tier of DEFAULT_PRICING_CONFIG.purchaseTiers) {
    if (remainingHbar <= 0) break;
    
    
    if (totalCredits < tier.minCredits) {
      const creditsNeeded = tier.minCredits - totalCredits;
      const hbarNeeded = creditsNeeded * tier.hbarPerCredit;
      
      if (hbarNeeded <= remainingHbar) {
        totalCredits = tier.minCredits;
        remainingHbar -= hbarNeeded;
      } else {
        totalCredits += remainingHbar / tier.hbarPerCredit;
        remainingHbar = 0;
        break;
      }
    }
    
    if (remainingHbar > 0 && totalCredits >= tier.minCredits && totalCredits < tier.maxCredits) {
      const creditsAtThisTier = Math.min(
        remainingHbar / tier.hbarPerCredit,
        tier.maxCredits - totalCredits
      );
      totalCredits += creditsAtThisTier;
      remainingHbar -= creditsAtThisTier * tier.hbarPerCredit;
    }
  }
  
  return Math.floor(totalCredits);
}

/**
 * Calculates the HBAR amount required to purchase a specific number of credits
 * based on the tiered pricing structure.
 * @param creditAmount The number of credits to purchase
 * @returns The amount of HBAR required
 */
export function calculateHbarForCredits(creditAmount: number): number {
  let remainingCredits = creditAmount;
  let totalHbar = 0;
  
  for (const tier of DEFAULT_PRICING_CONFIG.purchaseTiers) {
    if (remainingCredits <= 0) break;
    
    const creditsInThisTier = Math.min(
      remainingCredits,
      tier.maxCredits - tier.minCredits
    );
    
    totalHbar += creditsInThisTier * tier.hbarPerCredit;
    remainingCredits -= creditsInThisTier;
  }
  
  return totalHbar;
}

/**
 * Determines the final cost for an operation after applying all applicable
 * modifiers including network fees, payload size charges, bulk discounts,
 * loyalty rewards, and peak hour surcharges.
 * @param operationName The name of the operation to price
 * @param options Optional modifiers that affect pricing
 * @returns The final cost in credits (always rounded up)
 */
export function getOperationCost(
  operationName: string,
  options?: {
    network?: 'mainnet' | 'testnet';
    payloadSizeKB?: number;
    isBulkOperation?: boolean;
    userTotalCreditsUsed?: number;
  }
): number {
  const operation = DEFAULT_PRICING_CONFIG.operations.find(
    op => op.operationName === operationName
  );
  
  if (!operation) {
    throw new Error(`Unknown operation: ${operationName}`);
  }
  
  let cost = operation.baseCost;
  
  if (options?.network && operation.networkMultiplier) {
    cost *= operation.networkMultiplier[options.network];
  }
  
  if (options?.payloadSizeKB && operation.sizeMultiplier) {
    cost += options.payloadSizeKB * operation.sizeMultiplier;
  }
  
  if (options?.isBulkOperation) {
    cost *= (100 - DEFAULT_PRICING_CONFIG.rules.bulkOperationDiscount) / 100;
  }
  
  if (options?.userTotalCreditsUsed) {
    const loyaltyTier = DEFAULT_PRICING_CONFIG.rules.loyaltyTiers
      .reverse()
      .find(tier => options.userTotalCreditsUsed! >= tier.totalCreditsUsed);
    
    if (loyaltyTier) {
      cost *= (100 - loyaltyTier.discountPercentage) / 100;
    }
  }
  
  const currentHourUTC = new Date().getUTCHours();
  const { start, end } = DEFAULT_PRICING_CONFIG.rules.peakHoursUTC;
  if (currentHourUTC >= start && currentHourUTC < end) {
    cost *= DEFAULT_PRICING_CONFIG.rules.peakHoursMultiplier;
  }
  
  return Math.ceil(cost);
}