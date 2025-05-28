import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3001',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    setupNodeEvents(on, config) {
      // Database tasks
      on('task', {
        'db:reset': async () => {
          // Reset test database
          const { resetDatabase } = await import('./cypress/support/db-tasks');
          await resetDatabase();
          return null;
        },
        'db:createApiKey': async ({ accountId, name, permissions, lastUsedAt }) => {
          const { createApiKey } = await import('./cypress/support/db-tasks');
          return createApiKey({ accountId, name, permissions, lastUsedAt });
        }
      });
    },
  },
});