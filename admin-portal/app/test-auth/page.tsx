'use client';

import { useAuth } from '@/components/auth/AuthProvider';
import { useState } from 'react';
import { getApiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { MCPAuthClient } from '@/lib/auth/mcp-auth-client';

interface TestResult {
  type: 'success' | 'error';
  message: string;
  data?: any;
}

interface TestAuthPageProps {}

/**
 * Test page for verifying MCP authentication integration
 * Allows testing of wallet connection, MCP authentication, and authenticated API calls
 */
export default function TestAuthPage({}: TestAuthPageProps) {
  const { isConnected, user, connect, disconnect, isLoading, sdk } = useAuth();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);

  /**
   * Adds a test result to the results list
   * @param {TestResult} result - The test result to add
   * @returns {void}
   */
  const addResult = (result: TestResult) => {
    setTestResults(prev => [...prev, result]);
  };

  /**
   * Clears all test results from the display
   * @returns {void}
   */
  const clearResults = () => {
    setTestResults([]);
  };

  /**
   * Authenticates with the MCP server using the connected wallet
   * @returns {Promise<void>} Promise that resolves when authentication completes
   */
  const authenticate = async () => {
    if (!sdk || !user) {
      addResult({
        type: 'error',
        message: 'No wallet connected',
      });
      return;
    }

    setAuthenticating(true);
    clearResults();

    try {
      const authClient = new MCPAuthClient({ sdk });
      await authClient.initialize();

      addResult({
        type: 'success',
        message: 'Starting authentication process...',
      });

      const authResponse = await authClient.authenticate({
        name: 'Test Auth Page',
        permissions: ['credits:read', 'credits:write'],
      });

      addResult({
        type: 'success',
        message: 'Authentication successful!',
        data: {
          apiKey: authResponse.apiKey,
          keyId: authResponse.keyId,
          expiresAt: authResponse.expiresAt,
          permissions: authResponse.permissions,
        },
      });

      setApiKey(authResponse.apiKey);

      const apiClient = getApiClient();
      apiClient.setApiKey(authResponse.apiKey);
    } catch (error) {
      addResult({
        type: 'error',
        message: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setAuthenticating(false);
    }
  };

  /**
   * Tests the API key info endpoint to verify authentication
   * @returns {Promise<void>} Promise that resolves when test completes
   */
  const testApiKeyInfo = async () => {
    try {
      const apiClient = getApiClient();
      const keyInfo = await apiClient.getApiKey();
      addResult({
        type: 'success',
        message: 'API Key info retrieved successfully',
        data: keyInfo,
      });
    } catch (error) {
      addResult({
        type: 'error',
        message: `Failed to get API key info: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  /**
   * Tests the credit balance endpoint for the connected user
   * @returns {Promise<void>} Promise that resolves when test completes
   */
  const testCreditBalance = async () => {
    if (!user) {
      addResult({
        type: 'error',
        message: 'No user connected',
      });
      return;
    }

    try {
      const apiClient = getApiClient();
      const balance = await apiClient.getCreditBalance(user.accountId);
      addResult({
        type: 'success',
        message: 'Credit balance retrieved successfully',
        data: balance,
      });
    } catch (error) {
      addResult({
        type: 'error',
        message: `Failed to get credit balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  /**
   * Tests the server configuration endpoint
   * @returns {Promise<void>} Promise that resolves when test completes
   */
  const testServerConfig = async () => {
    try {
      const apiClient = getApiClient();
      const config = await apiClient.getServerConfig();
      addResult({
        type: 'success',
        message: 'Server config retrieved successfully',
        data: config,
      });
    } catch (error) {
      addResult({
        type: 'error',
        message: `Failed to get server config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  /**
   * Runs all available API tests in sequence
   * @returns {Promise<void>} Promise that resolves when all tests complete
   */
  const runAllTests = async () => {
    setTesting(true);
    clearResults();

    if (!isConnected || !user) {
      addResult({
        type: 'error',
        message: 'Please connect wallet first',
      });
      setTesting(false);
      return;
    }

    await testApiKeyInfo();
    await testCreditBalance();
    await testServerConfig();

    setTesting(false);
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">MCP Authentication Test</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Wallet Connection</CardTitle>
          <CardDescription>
            Connect your wallet to test MCP authentication
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading...</span>
              </div>
            ) : isConnected && user ? (
              <>
                <div className="space-y-2">
                  <p>
                    <strong>Account ID:</strong> {user.accountId}
                  </p>
                  <p>
                    <strong>HBAR Balance:</strong> {user.balance.hbar}
                  </p>
                  <p>
                    <strong>Credit Balance:</strong> {user.balance.credits}
                  </p>
                  <p>
                    <strong>API Key:</strong>{' '}
                    {apiKey ? '✓ Authenticated' : '✗ Not authenticated'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!apiKey && (
                    <Button onClick={authenticate} disabled={authenticating}>
                      {authenticating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Authenticating...
                        </>
                      ) : (
                        'Authenticate with MCP'
                      )}
                    </Button>
                  )}
                  <Button onClick={disconnect} variant="destructive">
                    Disconnect
                  </Button>
                </div>
              </>
            ) : (
              <Button onClick={connect}>Connect Wallet</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isConnected && user && (
        <Card>
          <CardHeader>
            <CardTitle>API Tests</CardTitle>
            <CardDescription>Test authenticated API endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={runAllTests} disabled={testing}>
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running Tests...
                    </>
                  ) : (
                    'Run All Tests'
                  )}
                </Button>
                <Button onClick={clearResults} variant="outline">
                  Clear Results
                </Button>
              </div>

              {testResults.length > 0 && (
                <div className="space-y-2 mt-4">
                  {testResults.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-md ${
                        result.type === 'success'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      <p
                        className={`font-medium ${
                          result.type === 'success'
                            ? 'text-green-800'
                            : 'text-red-800'
                        }`}
                      >
                        {result.message}
                      </p>
                      {result.data && (
                        <pre className="mt-2 text-xs overflow-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
