
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Login with a Hedera account ID
       */
      login(accountId: string): Chainable<void>;
      
      /**
       * Clear all authentication data
       */
      clearAuth(): Chainable<void>;
    }
  }
}

/**
 * Custom command to login
 */
Cypress.Commands.add('login', (accountId: string) => {
  cy.session(accountId, () => {
    cy.visit('/auth/signin');
    
    cy.window().then((win) => {
      win.HashinalWalletConnect = {
        connect: cy.stub().resolves({
          accountId,
          publicKey: 'mock-public-key'
        }),
        signMessage: cy.stub().resolves({
          signature: 'mock-signature-hex'
        })
      };
    });

    cy.intercept('POST', '/api/auth/challenge', {
      statusCode: 200,
      body: {
        challenge: 'mock-challenge',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }
    });

    cy.intercept('POST', '/api/auth/verify', {
      statusCode: 200,
      body: {
        apiKey: 'hma_mock123',
        accountId
      }
    });

    cy.get('[data-testid="connect-wallet-btn"]').click();
    
    cy.url().should('include', '/dashboard');
  });
});

/**
 * Clear all authentication data
 */
Cypress.Commands.add('clearAuth', () => {
  cy.clearCookies();
  cy.clearLocalStorage();
  cy.window().then((win) => {
    win.indexedDB.deleteDatabase('hedera-mcp-auth');
  });
});

export {};