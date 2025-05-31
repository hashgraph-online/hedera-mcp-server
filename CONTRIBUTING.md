# Contributing to Hedera MCP Server

Thank you for your interest in contributing to the Hedera MCP Server! This guide will help you get started with contributing to the project.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- A Hedera testnet account with HBAR for testing
- OpenAI API key (for natural language processing features)
- Basic understanding of TypeScript and the Model Context Protocol (MCP)

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/hedera-mcp-server.git
   cd hedera-mcp-server
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp env.example .env
   # Edit .env with your test credentials
   ```

3. **Database Setup**
   ```bash
   npm run db:setup
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

## 📋 Development Guidelines

### Code Style

**IMPORTANT**: This project follows strict inline comment rules:
- ❌ **NEVER** write inline code comments (`// comment` or `/* comment */` after code)
- ✅ **ALWAYS** use JSDoc comments at the top of functions/classes
- ✅ Keep code self-documenting with clear variable and function names

```typescript
/**
 * Processes an HBAR payment and allocates credits to the account
 * @param transactionId - The Hedera transaction ID
 * @param payerAccountId - Account that made the payment
 * @param hbarAmount - Amount of HBAR paid
 * @returns Promise resolving to success status and allocated credits
 */
async function processHbarPayment(
  transactionId: string,
  payerAccountId: string,
  hbarAmount: number
): Promise<PaymentResult> {
  const credits = calculateCredits(hbarAmount);
  return await allocateCredits(payerAccountId, credits);
}
```

### Testing Requirements

All contributions must include tests:

```bash
# Run all tests
npm test

# Run specific test files
npm test -- src/__tests__/integration/your-test.test.ts

# Run with coverage
npm run test:coverage
```

### Database Guidelines

- Always use Drizzle ORM for database operations
- Never write raw SQL queries
- Support both SQLite (development) and PostgreSQL (production)
- Include database setup in tests:

```typescript
import { setupTestDatabase } from '../test-utils/setup-helpers';

describe('Your Feature', () => {
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    testEnv = await setupTestDatabase('memory');
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });
});
```

### TypeScript Standards

- Use strict TypeScript settings
- Define proper types for all functions and props
- No `any` types without proper justification
- Place custom types at the top of files or in separate `types.ts` files

## 🔧 Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-new-mcp-tool`
- `fix/credit-calculation-bug`
- `docs/update-api-reference`
- `test/add-integration-tests`

### Commit Messages

Follow conventional commit format:
```
feat: add new MCP tool for token associations
fix: resolve credit balance calculation overflow
docs: update README with new installation steps
test: add integration tests for auth flow
```

### Pull Request Process

1. **Before Creating PR**
   ```bash
   npm run lint           # Fix any linting issues
   npm run typecheck      # Ensure no TypeScript errors
   npm test               # All tests must pass
   ```

2. **PR Description Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Documentation update
   - [ ] Performance improvement
   - [ ] Code refactoring

   ## Testing
   - [ ] Added/updated unit tests
   - [ ] Added/updated integration tests
   - [ ] Manual testing completed

   ## Checklist
   - [ ] Code follows project style guidelines
   - [ ] Self-review completed
   - [ ] Tests pass locally
   - [ ] Documentation updated if needed
   ```

## 🧪 Testing Standards

### Test File Organization

```
src/__tests__/
├── unit/                 # Unit tests for individual functions
├── integration/          # Full system integration tests
├── auth/                 # Authentication-specific tests
└── test-utils/          # Shared test utilities
```

### Test Naming Conventions

```typescript
describe('CreditService', () => {
  describe('processHbarPayment', () => {
    it('should allocate correct credits for valid payment', async () => {
      // Test implementation
    });

    it('should reject payment with insufficient amount', async () => {
      // Test implementation
    });
  });
});
```

### Integration Test Requirements

- Use real Hedera testnet for E2E tests
- Clean up all created resources
- Use proper authentication flows
- Test both success and failure scenarios

## 🏗️ Project Architecture

### Key Components

- **FastMCP Server** (`src/server/fastmcp-server.ts`) - Main MCP server implementation
- **Credit System** (`src/db/credit-service.ts`) - Handles payments and credit allocation
- **Authentication** (`src/auth/`) - API key and signature-based auth
- **Database Layer** (`src/db/`) - Drizzle ORM with dual database support
- **MCP Tools** (`src/tools/`) - Individual tool implementations

### Adding New MCP Tools

1. **Create tool in FastMCP server**:
   ```typescript
   this.mcp.addTool({
     name: 'your_tool_name',
     description: 'Clear description of what this tool does',
     parameters: z.object({
       param1: z.string().describe('Parameter description'),
       param2: z.number().optional().describe('Optional parameter'),
     }),
     execute: async (params) => {
       // Tool implementation
       return JSON.stringify(result);
     },
   });
   ```

2. **Add comprehensive tests**
3. **Update documentation**

## 🐛 Bug Reports

When reporting bugs, include:
- Environment details (Node version, OS, database type)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or error messages
- Minimal reproduction case if possible

## 💡 Feature Requests

For new features:
- Describe the use case and problem it solves
- Provide implementation suggestions if you have them
- Consider backward compatibility
- Discuss potential impact on existing functionality

## 📖 Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for all public APIs
- Include code examples in documentation
- Update API reference for new tools or endpoints

## 🔒 Security

- Never commit sensitive information (private keys, API keys)
- Use environment variables for configuration
- Follow authentication best practices
- Report security issues privately via email

## 💬 Communication

- Use GitHub Issues for bug reports and feature requests
- Join discussions in GitHub Discussions
- Be respectful and constructive in all interactions
- Ask questions if anything is unclear

## 📝 License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

---

Thank you for contributing to the Hedera MCP Server! Your efforts help make decentralized applications more accessible through natural language interfaces. 🚀