import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import {
  calculateCreditsForHbar,
  calculateHbarForCredits,
  getOperationCost,
  DEFAULT_PRICING_CONFIG,
} from '../../config/pricing-config';
import {
  setupMirrorNodeMocks,
  TEST_HBAR_TO_USD_RATE,
} from '../test-utils/mock-mirror-node';

describe('Pricing Configuration', () => {
  let originalDate: DateConstructor;

  beforeAll(() => {
    setupMirrorNodeMocks();
    originalDate = global.Date;
    const mockDate = new Date('2023-01-01T10:00:00Z');
    global.Date = jest.fn(() => mockDate) as any;
    global.Date.now = () => mockDate.getTime();
    global.Date.UTC = originalDate.UTC;
    global.Date.parse = originalDate.parse;
    (global.Date as any).prototype = originalDate.prototype;
  });

  afterAll(() => {
    global.Date = originalDate;
  });

  describe('calculateCreditsForHbar', () => {
    it('should convert HBAR to credits using USD rate', () => {
      const hbarAmount = 0.1;
      const usdRate = 0.05;
      const credits = calculateCreditsForHbar(hbarAmount, usdRate);

      expect(credits).toBe(5);
    });

    it('should handle tiered pricing correctly', () => {
      const hbarAmount = 20.0;
      const usdRate = 0.05;
      const credits = calculateCreditsForHbar(hbarAmount, usdRate);

      expect(credits).toBe(1000);
    });

    it('should apply growth tier discount', () => {
      const hbarAmount = 250.0;
      const usdRate = 0.05;
      const credits = calculateCreditsForHbar(hbarAmount, usdRate);

      const usdAmount = hbarAmount * usdRate;
      const starterCredits = 10000;
      const remainingUsd = usdAmount - starterCredits / 1000;
      const growthCredits = remainingUsd * 1111;
      const expectedCredits = Math.floor(starterCredits + growthCredits);

      expect(credits).toBe(expectedCredits);
    });

    it('should handle fractional credits by rounding down', () => {
      const hbarAmount = 0.001;
      const usdRate = 0.05;
      const credits = calculateCreditsForHbar(hbarAmount, usdRate);

      expect(credits).toBe(0);
    });

    it('should handle zero HBAR amount', () => {
      const credits = calculateCreditsForHbar(0, TEST_HBAR_TO_USD_RATE);
      expect(credits).toBe(0);
    });
  });

  describe('calculateHbarForCredits', () => {
    it('should convert credits to HBAR using USD rate', () => {
      const creditAmount = 50;
      const usdRate = 0.05;
      const hbar = calculateHbarForCredits(creditAmount, usdRate);

      expect(hbar).toBe(1.0);
    });

    it('should calculate HBAR for larger credit amounts', () => {
      const creditAmount = 1000;
      const usdRate = 0.05;
      const hbar = calculateHbarForCredits(creditAmount, usdRate);

      expect(hbar).toBe(20.0);
    });

    it('should handle tiered pricing when calculating HBAR', () => {
      const creditAmount = 15000;
      const usdRate = 0.05;
      const hbar = calculateHbarForCredits(creditAmount, usdRate);

      const starterUsd = 10000 / 1000;
      const growthUsd = 5000 / 1111;
      const totalUsd = starterUsd + growthUsd;
      const expectedHbar = Math.ceil((totalUsd / usdRate) * 100) / 100;

      expect(hbar).toBe(expectedHbar);
    });

    it('should handle zero credits', () => {
      const hbar = calculateHbarForCredits(0, TEST_HBAR_TO_USD_RATE);
      expect(hbar).toBe(0);
    });
  });

  describe('getOperationCost', () => {
    it('should return correct base cost for free operations', () => {
      const cost = getOperationCost('health_check');
      expect(cost).toBe(0);
    });

    it('should return correct base cost for basic operations', () => {
      const cost = getOperationCost('refresh_profile');
      expect(cost).toBe(2);
    });

    it('should return correct base cost for standard operations', () => {
      const cost = getOperationCost('generate_transaction_bytes');
      expect(cost).toBe(10);
    });

    it('should return correct base cost for premium operations', () => {
      const cost = getOperationCost('execute_transaction');
      expect(cost).toBe(50);
    });

    it('should apply network multiplier for mainnet', () => {
      const cost = getOperationCost('execute_transaction', {
        network: 'mainnet',
      });
      expect(cost).toBe(75);
    });

    it('should not apply network multiplier for testnet', () => {
      const cost = getOperationCost('execute_transaction', {
        network: 'testnet',
      });
      expect(cost).toBe(50);
    });

    it('should apply bulk operation discount', () => {
      const cost = getOperationCost('execute_transaction', {
        isBulkOperation: true,
      });
      const expectedCost = Math.ceil(50 * 0.8);
      expect(cost).toBe(expectedCost);
    });

    it('should apply loyalty discount for high-volume users', () => {
      const cost = getOperationCost('execute_transaction', {
        userTotalCreditsUsed: 100000,
      });
      const expectedCost = Math.ceil(50 * 0.85);
      expect(cost).toBe(expectedCost);
    });

    it('should apply peak hours multiplier', () => {
      const originalGetUTCHours = Date.prototype.getUTCHours;
      Date.prototype.getUTCHours = () => 16;

      try {
        const cost = getOperationCost('execute_transaction');
        const expectedCost = Math.ceil(50 * 1.2);
        expect(cost).toBe(expectedCost);
      } finally {
        Date.prototype.getUTCHours = originalGetUTCHours;
      }
    });

    it('should apply all modifiers together', () => {
      const originalGetUTCHours = Date.prototype.getUTCHours;
      Date.prototype.getUTCHours = () => 16;

      try {
        const cost = getOperationCost('execute_transaction', {
          network: 'mainnet',
          isBulkOperation: true,
          userTotalCreditsUsed: 100000,
        });

        let expectedCost = 50;
        expectedCost *= 1.5;
        expectedCost *= 0.8;
        expectedCost *= 0.85;
        expectedCost *= 1.2;
        expectedCost = Math.ceil(expectedCost);

        expect(cost).toBe(expectedCost);
      } finally {
        Date.prototype.getUTCHours = originalGetUTCHours;
      }
    });

    it('should throw error for unknown operation', () => {
      expect(() => getOperationCost('unknown_operation')).toThrow(
        'Unknown operation: unknown_operation',
      );
    });
  });

  describe('Pricing Configuration Structure', () => {
    it('should have correct base credits per USD', () => {
      expect(DEFAULT_PRICING_CONFIG.baseCreditsPerUSD).toBe(1000);
    });

    it('should have correct minimum purchase requirements', () => {
      expect(DEFAULT_PRICING_CONFIG.minimumPurchase.credits).toBe(1000);
      expect(DEFAULT_PRICING_CONFIG.minimumPurchase.usd).toBe(1.0);
    });

    it('should have correct tier structure', () => {
      const tiers = DEFAULT_PRICING_CONFIG.purchaseTiers;

      expect(tiers).toHaveLength(4);
      expect(tiers[0].tier).toBe('starter');
      expect(tiers[0].creditsPerUSD).toBe(1000);
      expect(tiers[1].tier).toBe('growth');
      expect(tiers[1].creditsPerUSD).toBe(1111);
      expect(tiers[2].tier).toBe('business');
      expect(tiers[2].creditsPerUSD).toBe(1250);
      expect(tiers[3].tier).toBe('enterprise');
      expect(tiers[3].creditsPerUSD).toBe(1429);
    });

    it('should have all required operations', () => {
      const operations = DEFAULT_PRICING_CONFIG.operations;
      const operationNames = operations.map(op => op.operationName);

      expect(operationNames).toContain('health_check');
      expect(operationNames).toContain('get_server_info');
      expect(operationNames).toContain('check_credit_balance');
      expect(operationNames).toContain('purchase_credits');
      expect(operationNames).toContain('refresh_profile');
      expect(operationNames).toContain('generate_transaction_bytes');
      expect(operationNames).toContain('schedule_transaction');
      expect(operationNames).toContain('execute_transaction');
    });

    it('should have correct loyalty tiers', () => {
      const loyaltyTiers = DEFAULT_PRICING_CONFIG.rules.loyaltyTiers;

      expect(loyaltyTiers).toHaveLength(4);
      expect(loyaltyTiers[0].totalCreditsUsed).toBe(10000);
      expect(loyaltyTiers[0].discountPercentage).toBe(5);
      expect(loyaltyTiers[3].totalCreditsUsed).toBe(500000);
      expect(loyaltyTiers[3].discountPercentage).toBe(20);
    });
  });
});
