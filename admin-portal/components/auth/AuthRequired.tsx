'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2, KeyRound } from 'lucide-react';

interface AuthRequiredProps {
  children: React.ReactNode;
}

/**
 * Component that ensures authentication is present and prompts for re-authentication when needed
 * Wraps children and only renders them when properly authenticated
 * @param props - Component props containing children to render when authenticated
 * @returns Authentication wrapper component
 */
export function AuthRequired({ children }: AuthRequiredProps) {
  const { isConnected, apiKey, authenticate, mcpAuthClient, user } = useAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const needsAuth = isConnected && user && !apiKey;

  useEffect(() => {
    if (needsAuth && mcpAuthClient && !isAuthenticating) {
      handleAuthenticate();
    }
  }, [needsAuth, mcpAuthClient]);

  /**
   * Handles wallet authentication request and updates state accordingly
   * @returns {Promise<void>} Promise that resolves when authentication attempt completes
   */
  const handleAuthenticate = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    
    try {
      await authenticate();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (!isConnected || !user) {
    return <>{children}</>;
  }

  if (apiKey) {
    return <>{children}</>;
  }
  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-card backdrop-blur-xl border border-hedera-purple/10 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-gradient-to-br from-hedera-purple/20 to-hedera-blue/20 rounded-full w-fit">
            <KeyRound className="w-8 h-8 text-hedera-purple" />
          </div>
          <CardTitle className="text-2xl font-bold">Authentication Required</CardTitle>
          <CardDescription className="mt-2">
            Your session has expired or authentication is needed to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {authError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{authError}</p>
            </div>
          )}
          
          <p className="text-sm text-secondary">
            Click the button below to authenticate with your wallet and continue using Hedera AI Studio.
          </p>

          <Button
            onClick={handleAuthenticate}
            disabled={isAuthenticating || !mcpAuthClient}
            className="w-full bg-gradient-to-r from-hedera-purple to-hedera-blue hover:from-hedera-purple/90 hover:to-hedera-blue/90 text-white"
          >
            {isAuthenticating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4 mr-2" />
                Authenticate with Wallet
              </>
            )}
          </Button>

          <p className="text-xs text-center text-secondary">
            This will request a signature from your wallet to create a secure session.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}