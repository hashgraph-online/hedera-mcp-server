export interface TierPricing {
  tier: string;
  minCredits: number;
  maxCredits: number;
  discountPercentage: number;
  hbarPerCredit: number;
}

export const PRICING_TIERS: TierPricing[] = [
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
];

/**
 * Calculates the number of credits a user receives for a given HBAR amount
 * @param hbarAmount The amount of HBAR to convert to credits
 * @returns The number of credits (rounded down to nearest integer)
 */
export function calculateCreditsForHbar(hbarAmount: number): number {
  let remainingHbar = hbarAmount;
  let totalCredits = 0;
  
  for (const tier of PRICING_TIERS) {
    if (remainingHbar <= 0) break;
    
    const tierCapacity = tier.maxCredits - tier.minCredits;
    const maxHbarForThisTier = tierCapacity * tier.hbarPerCredit;
    
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
 * @param creditAmount The number of credits to purchase
 * @returns The amount of HBAR required
 */
export function calculateHbarForCredits(creditAmount: number): number {
  let remainingCredits = creditAmount;
  let totalHbar = 0;
  let currentTotal = 0;
  
  for (const tier of PRICING_TIERS) {
    if (remainingCredits <= 0) break;
    
    const tierCapacity = tier.maxCredits - currentTotal;
    const creditsInThisTier = Math.min(remainingCredits, tierCapacity);
    
    if (creditsInThisTier > 0) {
      totalHbar += creditsInThisTier * tier.hbarPerCredit;
      remainingCredits -= creditsInThisTier;
      currentTotal += creditsInThisTier;
    }
  }
  
  return Number(totalHbar.toFixed(4));
}

/**
 * Gets the effective price per credit for a given amount
 * @param creditAmount The number of credits
 * @returns The effective HBAR per credit rate
 */
export function getEffectiveRate(creditAmount: number): number {
  const hbarNeeded = calculateHbarForCredits(creditAmount);
  return hbarNeeded / creditAmount;
}

/**
 * Determines the pricing tier that applies to a given credit amount
 * @param {number} creditAmount - The number of credits to check
 * @returns {TierPricing} The pricing tier object containing tier information and pricing details
 */
export function getTierForAmount(creditAmount: number): TierPricing {
  let totalCredits = 0;
  
  for (const tier of PRICING_TIERS) {
    if (creditAmount <= tier.maxCredits) {
      return tier;
    }
  }
  
  return PRICING_TIERS[PRICING_TIERS.length - 1];
}