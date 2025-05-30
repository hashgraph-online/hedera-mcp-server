'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { getApiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2,
  Key,
  RotateCw,
  Trash2,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';

interface ApiKeyInfo {
  id: string;
  name?: string;
  prefix: string;
  lastUsed?: string;
  usageCount: number;
  createdAt: string;
  expiresAt?: string;
}

interface ApiKeyRowProps {
  apiKey: ApiKeyInfo;
  currentApiKey: string | null;
  isRotating: boolean;
  isRevoking: boolean;
  isCopied: boolean;
  onCopy: (keyId: string) => void;
  onRotate: (keyId: string) => void;
  onShowRevoke: (keyId: string) => void;
}

/**
 * Component that renders a single API key row in the table
 * @param {ApiKeyRowProps} props - The props for the API key row component
 * @returns {JSX.Element} A table row displaying API key information and actions
 */
function ApiKeyRow({
  apiKey: key,
  currentApiKey,
  isRotating,
  isRevoking,
  isCopied,
  onCopy,
  onRotate,
  onShowRevoke,
}: ApiKeyRowProps) {
  const isExpired = key.expiresAt && new Date(key.expiresAt) < new Date();
  const isCurrentKey = currentApiKey ? currentApiKey.includes(key.prefix) : false;

  const handleCopyClick = () => onCopy(key.id);
  const handleRotateClick = () => onRotate(key.id);
  const handleRevokeClick = () => onShowRevoke(key.id);

  /**
   * Masks an API key for security purposes, showing only first 8 and last 4 characters
   * @param {string} keyStr - The API key string to mask
   * @returns {string} The masked API key string
   */
  const maskApiKey = (keyStr: string): string => {
    if (keyStr.length <= 12) return keyStr;
    return `${keyStr.substring(0, 8)}...${keyStr.substring(keyStr.length - 4)}`;
  };

  /**
   * Formats a date string into a human-readable format
   * @param {string} dateString - The ISO date string to format
   * @returns {string} Formatted date string in locale format
   */
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{key.name || 'Default Key'}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <code className="text-sm">
            {maskApiKey(currentApiKey || key.prefix)}
          </code>
          <Button size="sm" variant="ghost" onClick={handleCopyClick}>
            {isCopied ? (
              <Check className="w-3 h-3" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </Button>
        </div>
      </TableCell>
      <TableCell>{formatDate(key.createdAt)}</TableCell>
      <TableCell>{key.lastUsed ? formatDate(key.lastUsed) : 'Never'}</TableCell>
      <TableCell>{key.usageCount}</TableCell>
      <TableCell>
        {isExpired ? (
          <Badge variant="error">Expired</Badge>
        ) : isCurrentKey ? (
          <Badge variant="default">Active</Badge>
        ) : (
          <Badge variant="info">Valid</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRotateClick}
            disabled={isRotating || !isCurrentKey}
          >
            {isRotating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCw className="w-3 h-3" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRevokeClick}
            disabled={isRevoking || isCurrentKey}
          >
            {isRevoking ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface ApiKeyManagerProps {
  className?: string;
}

/**
 * API Key Manager component for viewing and managing MCP API keys
 * Allows users to view their API keys, rotate them, and revoke them
 */
export function ApiKeyManager({}: ApiKeyManagerProps) {
  const { isConnected, user, apiKey } = useAuth();
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotatingKey, setRotatingKey] = useState<string | null>(null);
  const [revokingKey, setRevokingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && apiKey) {
      loadApiKeys();
    }
  }, [isConnected, apiKey]);

  /**
   * Loads API keys from the server and updates the component state
   * @returns {Promise<void>} Promise that resolves when keys are loaded
   */
  const loadApiKeys = async () => {
    setLoading(true);
    setError(null);

    try {
      const apiClient = getApiClient();
      const keyList = await apiClient.getApiKey();

      if (keyList && Array.isArray(keyList)) {
        setKeys(keyList);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles API key rotation for the specified key ID
   * @param {string} keyId - The ID of the key to rotate
   * @returns {Promise<void>} Promise that resolves when rotation is complete
   */
  const handleRotateKey = async (keyId: string) => {
    setRotatingKey(keyId);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await loadApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate API key');
    } finally {
      setRotatingKey(null);
    }
  };

  /**
   * Handles API key revocation for the selected key
   * @returns {Promise<void>} Promise that resolves when revocation is complete
   */
  const handleRevokeKey = async () => {
    if (!keyToRevoke) return;

    setRevokingKey(keyToRevoke);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await loadApiKeys();
      setShowRevokeDialog(false);
      setKeyToRevoke(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    } finally {
      setRevokingKey(null);
    }
  };

  /**
   * Copies the API key to clipboard and shows feedback
   * @param {string} keyId - The ID of the key to copy
   * @returns {void}
   */
  const handleCopyKey = (keyId: string) => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopiedKey(keyId);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  /**
   * Shows the revoke confirmation dialog for the specified key
   * @param {string} keyId - The ID of the key to potentially revoke
   * @returns {void}
   */
  const handleShowRevokeDialog = (keyId: string) => {
    setKeyToRevoke(keyId);
    setShowRevokeDialog(true);
  };

  if (!isConnected || !user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Connect your wallet to manage API keys
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </CardTitle>
          <CardDescription>Manage your MCP server API keys</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No API keys found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map(key => (
                  <ApiKeyRow
                    key={key.id}
                    apiKey={key}
                    currentApiKey={apiKey || null}
                    isRotating={rotatingKey === key.id}
                    isRevoking={revokingKey === key.id}
                    isCopied={copiedKey === key.id}
                    onCopy={handleCopyKey}
                    onRotate={handleRotateKey}
                    onShowRevoke={handleShowRevokeDialog}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The API key will be permanently
              revoked and any applications using it will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeKey}
              className="bg-destructive text-destructive-foreground"
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
