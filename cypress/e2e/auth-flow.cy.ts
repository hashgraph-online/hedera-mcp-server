describe('Authentication E2E Flow', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.clearLocalStorage();
    cy.clearCookies();
  });

  describe('Login Flow', () => {
    it('should complete full authentication flow', () => {
      cy.visit('/auth/signin');
      
      cy.contains('Sign in to Admin Portal').should('be.visible');
      cy.get('[data-testid="connect-wallet-btn"]').should('be.visible');

      cy.window().then((win) => {
        win.HashinalWalletConnect = {
          connect: cy.stub().resolves({
            accountId: '0.0.12345',
            publicKey: 'mock-public-key'
          }),
          signMessage: cy.stub().resolves({
            signature: 'mock-signature-hex'
          })
        };
      });

      cy.get('[data-testid="connect-wallet-btn"]').click();

      cy.contains('Connecting...').should('be.visible');

      cy.url().should('include', '/dashboard');
      cy.contains('Welcome, 0.0.12345').should('be.visible');
    });

    it('should handle wallet connection failure', () => {
      cy.visit('/auth/signin');

      cy.window().then((win) => {
        win.HashinalWalletConnect = {
          connect: cy.stub().rejects(new Error('User rejected connection'))
        };
      });

      cy.get('[data-testid="connect-wallet-btn"]').click();
      
      cy.contains('User rejected connection').should('be.visible');
      
      cy.url().should('include', '/auth/signin');
    });

    it('should handle signature failure', () => {
      cy.visit('/auth/signin');

      cy.window().then((win) => {
        win.HashinalWalletConnect = {
          connect: cy.stub().resolves({
            accountId: '0.0.12345',
            publicKey: 'mock-public-key'
          }),
          signMessage: cy.stub().rejects(new Error('User rejected signature'))
        };
      });

      cy.get('[data-testid="connect-wallet-btn"]').click();
      
      cy.contains('User rejected signature').should('be.visible');
      cy.url().should('include', '/auth/signin');
    });
  });

  describe('API Key Management', () => {
    beforeEach(() => {
      cy.login('0.0.12345');
      cy.visit('/dashboard/api-keys');
    });

    it('should generate new API key', () => {
      cy.contains('No API keys yet').should('be.visible');
      
      cy.get('[data-testid="generate-key-btn"]').click();
      
      cy.get('[data-testid="key-name-input"]').type('Production Key');
      cy.get('[data-testid="permission-read"]').check();
      cy.get('[data-testid="permission-write"]').check();
      
      cy.get('[data-testid="create-key-btn"]').click();
      
      cy.contains('New API Key Generated').should('be.visible');
      cy.get('[data-testid="new-api-key"]').should('match', /^hma_[A-Za-z0-9]{32}$/);
      
      cy.get('[data-testid="copy-key-btn"]').click();
      cy.contains('Copied!').should('be.visible');
      
      cy.get('[data-testid="close-modal-btn"]').click();
      
      cy.contains('Production Key').should('be.visible');
      cy.contains('read, write').should('be.visible');
    });

    it('should revoke API key', () => {
      cy.task('db:createApiKey', {
        accountId: '0.0.12345',
        name: 'Test Key',
        permissions: ['read']
      }).then((key: any) => {
        cy.reload();
        
        cy.contains('Test Key').should('be.visible');
        
        cy.get(`[data-testid="revoke-key-${key.id}"]`).click();
        
        cy.contains('Are you sure').should('be.visible');
        cy.get('[data-testid="confirm-revoke-btn"]').click();
        
        cy.contains('Revoked').should('be.visible');
        
        cy.get(`[data-testid="revoke-key-${key.id}"]`).should('not.exist');
      });
    });

    it('should show key usage stats', () => {
      cy.task('db:createApiKey', {
        accountId: '0.0.12345',
        name: 'Used Key',
        permissions: ['read', 'write'],
        lastUsedAt: new Date().toISOString()
      });

      cy.reload();
      
      cy.contains('Used Key').should('be.visible');
      cy.contains('Last used:').should('be.visible');
      cy.contains('ago').should('be.visible');
    });

    it('should handle multiple keys', () => {
      const keys = [
        { name: 'Production Key', permissions: ['read', 'write'] },
        { name: 'Development Key', permissions: ['read'] },
        { name: 'Testing Key', permissions: ['read'] }
      ];

      keys.forEach(key => {
        cy.task('db:createApiKey', {
          accountId: '0.0.12345',
          ...key
        });
      });

      cy.reload();
      
      keys.forEach(key => {
        cy.contains(key.name).should('be.visible');
      });
      
      cy.contains('3 API keys').should('be.visible');
    });
  });

  describe('Protected Routes', () => {
    it('should redirect to login when not authenticated', () => {
      cy.visit('/dashboard');
      cy.url().should('include', '/auth/signin');
      
      cy.visit('/dashboard/api-keys');
      cy.url().should('include', '/auth/signin');
    });

    it('should allow access when authenticated', () => {
      cy.login('0.0.12345');
      
      cy.visit('/dashboard');
      cy.url().should('include', '/dashboard');
      
      cy.visit('/dashboard/api-keys');
      cy.url().should('include', '/dashboard/api-keys');
    });

    it('should handle session expiry', () => {
      cy.login('0.0.12345');
      cy.visit('/dashboard');
      
      cy.clearCookies();
      
      cy.get('[data-testid="nav-api-keys"]').click();
      
      cy.url().should('include', '/auth/signin');
    });
  });

  describe('MCP Tool Authentication', () => {
    it('should authenticate MCP tool calls with API key', () => {
      cy.login('0.0.12345');
      
      cy.task('db:createApiKey', {
        accountId: '0.0.12345',
        name: 'Test Key',
        permissions: ['read']
      }).then((key: any) => {
        cy.request({
          method: 'POST',
          url: '/mcp',
          headers: {
            'Authorization': `Bearer ${key.key}`,
            'Content-Type': 'application/json'
          },
          body: {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'get_balance',
              arguments: {
                accountId: '0.0.12345'
              }
            },
            id: 1
          }
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body).to.have.property('result');
        });
      });
    });

    it('should reject MCP calls without API key', () => {
      cy.request({
        method: 'POST',
        url: '/mcp',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_balance',
            arguments: {
              accountId: '0.0.12345'
            }
          },
          id: 1
        },
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body.error.message).to.include('Authentication required');
      });
    });

    it('should enforce permissions on MCP calls', () => {
      cy.task('db:createApiKey', {
        accountId: '0.0.12345',
        name: 'Read Only Key',
        permissions: ['read']
      }).then((key: any) => {
        cy.request({
          method: 'POST',
          url: '/mcp',
          headers: {
            'Authorization': `Bearer ${key.key}`,
            'Content-Type': 'application/json'
          },
          body: {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'send_hbar',
              arguments: {
                to: '0.0.99999',
                amount: '1'
              }
            },
            id: 1
          },
          failOnStatusCode: false
        }).then((response) => {
          expect(response.status).to.eq(403);
          expect(response.body.error.message).to.include('Insufficient permissions');
        });
      });
    });
  });
});