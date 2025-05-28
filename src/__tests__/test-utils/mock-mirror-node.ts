/**
 * Mock setup for HederaMirrorNode to provide consistent HBAR pricing in tests
 */

export const TEST_HBAR_TO_USD_RATE = 0.05;

/**
 * Sets up jest mocks for HederaMirrorNode
 */
export function setupMirrorNodeMocks() {
  jest.mock('@hashgraphonline/standards-sdk', () => {
    const actual = jest.requireActual('@hashgraphonline/standards-sdk');
    
    class MockHederaMirrorNode {
      constructor() {}
      
      async getHBARPrice(): Promise<number> {
        return TEST_HBAR_TO_USD_RATE;
      }
    }
    
    return {
      ...actual,
      HederaMirrorNode: MockHederaMirrorNode,
    };
  });
}

/**
 * Calculates expected credits for a given HBAR amount using test rate
 * @param hbarAmount Amount in HBAR
 * @returns Expected credits based on test exchange rate
 */
export function calculateTestCredits(hbarAmount: number): number {
  const usdAmount = hbarAmount * TEST_HBAR_TO_USD_RATE;
  return Math.floor(usdAmount * 1000);
}