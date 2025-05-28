'use client';

import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Wallet, AlertCircle } from 'lucide-react';

interface LoginFormProps {}

/**
 * Login form component that handles wallet connection and MCP authentication
 * Provides a simple interface for users to connect their wallet and authenticate with the MCP server
 */
export function LoginForm({}: LoginFormProps) {
  const { connect, isConnected, isLoading, user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setError(null);
    setIsConnecting(true);
    
    try {
      await connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (isConnected && user) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Connected</CardTitle>
          <CardDescription>You are connected to the MCP server</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Account:</span> {user.accountId}
            </div>
            <div>
              <span className="font-medium">Network:</span> {process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'testnet'}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Connect to MCP Server</CardTitle>
        <CardDescription>
          Connect your Hedera wallet to authenticate with the MCP server
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <Button 
          onClick={handleConnect} 
          disabled={isConnecting}
          className="w-full"
          size="lg"
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4 mr-2" />
              Connect Wallet
            </>
          )}
        </Button>
        
        <p className="text-sm text-muted-foreground text-center">
          Supported wallets: HashPack, Blade
        </p>
      </CardContent>
    </Card>
  );
}