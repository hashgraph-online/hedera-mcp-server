'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/auth/AuthProvider';
import { HEDERA_CONFIG } from '@/lib/constants/config';
import { Copy, Eye, EyeOff, ExternalLink, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface BearerTokenDisplayProps {}

/**
 * Component that displays the current Bearer token for FastMCP inspector integration
 * Provides secure display and easy copying of the authentication token
 * @returns Bearer token display interface with copy functionality
 */
export function BearerTokenDisplay({}: BearerTokenDisplayProps) {
  const { apiKey, isConnected } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const serverUrl = HEDERA_CONFIG.mcp.serverUrl;
  const inspectorUrl = HEDERA_CONFIG.mcp.inspectorUrl;
  const inspectorEnabled = HEDERA_CONFIG.mcp.inspectorEnabled;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
    }
  };

  const maskToken = (token: string) => {
    if (!token) return '';
    return `${token.substring(0, 8)}${'*'.repeat(20)}${token.substring(token.length - 8)}`;
  };

  if (!isConnected || !apiKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Copy className="w-5 h-5" />
            FastMCP Inspector Token
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <p className="mb-2">No authentication token available</p>
            <p className="text-sm">Connect your wallet and authenticate to get a Bearer token</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Copy className="w-5 h-5" />
            FastMCP Inspector Token
          </CardTitle>
          <Badge variant="outline" className="border-green-600 dark:border-green-400 text-green-700 dark:text-green-400">
            <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full mr-1 animate-pulse" />
            Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="bearer-token">Bearer Token</Label>
          <div className="flex gap-2">
            <Input
              id="bearer-token"
              type={isVisible ? 'text' : 'password'}
              value={isVisible ? `Bearer ${apiKey}` : `Bearer ${maskToken(apiKey)}`}
              readOnly
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsVisible(!isVisible)}
              className="px-3"
            >
              {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(`Bearer ${apiKey}`)}
              className="px-3"
            >
              {copied ? (
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use this Bearer token in the Authorization header for FastMCP inspector
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="server-url">FastMCP Server URL</Label>
          <div className="flex gap-2">
            <Input
              id="server-url"
              value={serverUrl}
              readOnly
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(serverUrl)}
              className="px-3"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            MCP Inspector Setup
          </h4>
          <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
            <li>Set Server URL to: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{serverUrl}</code></li>
            <li>Set Authorization header to: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">Bearer {apiKey ? `${apiKey.substring(0, 8)}...` : '[token]'}</code></li>
            <li>Click Connect to start testing MCP tools</li>
          </ol>
          {inspectorEnabled && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(inspectorUrl, '_blank')}
                className="text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open MCP Inspector
              </Button>
            </div>
          )}
          {!inspectorEnabled && (
            <div className="mt-3 text-xs text-blue-600 dark:text-blue-400">
              MCP Inspector is disabled. Set NEXT_PUBLIC_MCP_INSPECTOR_ENABLED=true to enable.
            </div>
          )}
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
          <h5 className="font-medium text-yellow-900 dark:text-yellow-100 text-sm mb-1">
            🔒 Security Note
          </h5>
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            This token grants access to your MCP server and can incur credit charges. 
            Keep it secure and don't share it publicly.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}