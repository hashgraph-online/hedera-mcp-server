import { HederaMirrorNode, Logger } from '@hashgraphonline/standards-sdk';
import type { NetworkType } from '@hashgraphonline/standards-sdk';

export interface OperationPricing {
  operationName: string;
  category: 'free' | 'basic' | 'standard' | 'premium' | 'enterprise';
  baseCostUSD: number;
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
  creditsPerUSD: number;
}

export interface PricingConfig {
  baseCreditsPerUSD: number;
  minimumPurchase: {
    credits: number;
    usd: number;
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

/**
 * Default pricing configuration based on industry standards:
 * - OpenAI GPT-3.5: ~$0.002 per 1K tokens
 * - AWS Lambda: ~$0.20 per 1M requests
 * - Google Cloud Functions: ~$0.40 per 1M invocations
 *
 * Our pricing model:
 * - 1 credit = $0.001 USD (1/10th of a cent)
 * - Basic operations: 1-10 credits ($0.001-$0.01)
 * - Standard operations: 10-50 credits ($0.01-$0.05)
 * - Premium operations: 50-200 credits ($0.05-$0.20)
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  baseCreditsPerUSD: 1000,
  minimumPurchase: {
    credits: 1000,
    usd: 1.0,
  },
  purchaseTiers: [
    {
      tier: 'starter',
      minCredits: 0,
      maxCredits: 10000,
      discountPercentage: 0,
      creditsPerUSD: 1000,
    },
    {
      tier: 'growth',
      minCredits: 10001,
      maxCredits: 100000,
      discountPercentage: 10,
      creditsPerUSD: 1111,
    },
    {
      tier: 'business',
      minCredits: 100001,
      maxCredits: 1000000,
      discountPercentage: 20,
      creditsPerUSD: 1250,
    },
    {
      tier: 'enterprise',
      minCredits: 1000001,
      maxCredits: Infinity,
      discountPercentage: 30,
      creditsPerUSD: 1429,
    },
  ],
  operations: [
    {
      operationName: 'health_check',
      category: 'free',
      baseCostUSD: 0,
      description: 'Check server health and status',
    },
    {
      operationName: 'get_server_info',
      category: 'free',
      baseCostUSD: 0,
      description: 'Get server configuration and capabilities',
    },
    {
      operationName: 'check_credit_balance',
      category: 'free',
      baseCostUSD: 0,
      description: 'Check credit balance for your authenticated account',
    },
    {
      operationName: 'get_credit_history',
      category: 'free',
      baseCostUSD: 0,
      description: 'Get credit transaction history',
    },
    {
      operationName: 'purchase_credits',
      category: 'free',
      baseCostUSD: 0,
      description: 'Purchase credits using HBAR',
    },
    {
      operationName: 'verify_payment',
      category: 'free',
      baseCostUSD: 0,
      description: 'Verify payment transaction and allocate credits',
    },
    {
      operationName: 'check_payment_status',
      category: 'free',
      baseCostUSD: 0,
      description: 'Check the status of a payment transaction',
    },
    {
      operationName: 'get_payment_history',
      category: 'free',
      baseCostUSD: 0,
      description: 'Get payment history for an account',
    },
    {
      operationName: 'get_pricing_configuration',
      category: 'free',
      baseCostUSD: 0,
      description: 'Get pricing configuration including costs and tiers',
    },
    {
      operationName: 'process_hbar_payment',
      category: 'free',
      baseCostUSD: 0,
      description: 'Manually process an HBAR payment for credit allocation',
    },
    {
      operationName: 'refresh_profile',
      category: 'basic',
      baseCostUSD: 0.002,
      description: 'Refresh server HCS-11 profile and registration status',
    },
    {
      operationName: 'generate_transaction_bytes',
      category: 'standard',
      baseCostUSD: 0.01,
      description:
        'Generate transaction bytes for any Hedera operation without execution',
      complexityMultiplier: 1.5,
    },
    {
      operationName: 'schedule_transaction',
      category: 'standard',
      baseCostUSD: 0.02,
      description: 'Create scheduled transaction for any Hedera operation',
      networkMultiplier: {
        mainnet: 1.2,
        testnet: 1.0,
      },
    },
    {
      operationName: 'execute_transaction',
      category: 'premium',
      baseCostUSD: 0.05,
      description: 'Execute any Hedera transaction immediately',
      networkMultiplier: {
        mainnet: 1.5,
        testnet: 1.0,
      },
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
 * Singleton instance for USD conversion
 */
let mirrorNodeInstance: HederaMirrorNode | null = null;

/**
 * Gets or creates the mirror node instance for USD conversion
 */
function getMirrorNode(
  network: NetworkType = NetworkType.MAINNET,
): HederaMirrorNode {
  if (!mirrorNodeInstance) {
    const logger = new Logger({ module: 'PricingConfig' });
    mirrorNodeInstance = new HederaMirrorNode(network, logger);
  }
  return mirrorNodeInstance;
}

/**
 * Gets the current HBAR to USD exchange rate
 * @param network The Hedera network to use for pricing
 * @returns The USD value of 1 HBAR
 */
export async function getHbarToUsdRate(
  network: NetworkType = NetworkType.MAINNET,
): Promise<number> {
  try {
    const mirrorNode = getMirrorNode(network);
    const usdPrice = await mirrorNode.getHBARPrice(new Date());

    if (usdPrice === null || usdPrice <= 0) {
      throw new Error('Invalid HBAR price from mirror node');
    }

    return usdPrice;
  } catch (error) {
    const logger = new Logger({ module: 'PricingConfig' });
    logger.error('Failed to get HBAR price, using fallback rate', { error });
    return 0.05;
  }
}

/**
 * Calculates the number of credits a user receives for a given HBAR amount
 * based on the tiered pricing structure and current USD exchange rate
 * @param hbarAmount The amount of HBAR to convert to credits
 * @param hbarToUsdRate The current HBAR to USD exchange rate
 * @returns The number of credits (rounded down to nearest integer)
 */
export function calculateCreditsForHbar(
  hbarAmount: number,
  hbarToUsdRate: number,
): number {
  const usdAmount = hbarAmount * hbarToUsdRate;
  let remainingUsd = usdAmount;
  let totalCredits = 0;

  for (const tier of DEFAULT_PRICING_CONFIG.purchaseTiers) {
    if (remainingUsd <= 0) break;

    if (totalCredits < tier.minCredits) {
      const creditsNeeded = tier.minCredits - totalCredits;
      const usdNeeded = creditsNeeded / tier.creditsPerUSD;

      if (usdNeeded <= remainingUsd) {
        totalCredits = tier.minCredits;
        remainingUsd -= usdNeeded;
      } else {
        totalCredits += remainingUsd * tier.creditsPerUSD;
        remainingUsd = 0;
        break;
      }
    }

    if (
      remainingUsd > 0 &&
      totalCredits >= tier.minCredits &&
      totalCredits < tier.maxCredits
    ) {
      const creditsAtThisTier = Math.min(
        remainingUsd * tier.creditsPerUSD,
        tier.maxCredits - totalCredits,
      );
      totalCredits += creditsAtThisTier;
      remainingUsd -= creditsAtThisTier / tier.creditsPerUSD;
    }
  }

  return Math.floor(totalCredits);
}

/**
 * Calculates the HBAR amount required to purchase a specific number of credits
 * based on the tiered pricing structure and current USD exchange rate
 * @param creditAmount The number of credits to purchase
 * @param hbarToUsdRate The current HBAR to USD exchange rate
 * @returns The amount of HBAR required
 */
export function calculateHbarForCredits(
  creditAmount: number,
  hbarToUsdRate: number,
): number {
  let remainingCredits = creditAmount;
  let totalUsd = 0;

  for (const tier of DEFAULT_PRICING_CONFIG.purchaseTiers) {
    if (remainingCredits <= 0) break;

    const creditsInThisTier = Math.min(
      remainingCredits,
      tier.maxCredits - tier.minCredits,
    );

    totalUsd += creditsInThisTier / tier.creditsPerUSD;
    remainingCredits -= creditsInThisTier;
  }

  const totalHbar = totalUsd / hbarToUsdRate;

  return Math.ceil(totalHbar * 100) / 100;
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
  },
): number {
  const operation = DEFAULT_PRICING_CONFIG.operations.find(
    op => op.operationName === operationName,
  );

  if (!operation) {
    throw new Error(`Unknown operation: ${operationName}`);
  }

  const baseCostInCredits =
    operation.baseCostUSD * DEFAULT_PRICING_CONFIG.baseCreditsPerUSD;
  let cost = baseCostInCredits;

  if (options?.network && operation.networkMultiplier) {
    cost *= operation.networkMultiplier[options.network];
  }

  if (options?.payloadSizeKB && operation.sizeMultiplier) {
    const additionalCostUSD =
      (options.payloadSizeKB * operation.sizeMultiplier) / 1000;
    cost += additionalCostUSD * DEFAULT_PRICING_CONFIG.baseCreditsPerUSD;
  }

  if (options?.isBulkOperation) {
    cost *= (100 - DEFAULT_PRICING_CONFIG.rules.bulkOperationDiscount) / 100;
  }

  if (options?.userTotalCreditsUsed) {
    const loyaltyTier = DEFAULT_PRICING_CONFIG.rules.loyaltyTiers
      .slice()
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
