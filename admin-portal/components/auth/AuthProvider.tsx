'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import { LedgerId } from '@hashgraph/sdk';
import { HEDERA_CONFIG } from '@/lib/constants/config';
import { HederaMirrorNode, Logger } from '@hashgraphonline/standards-sdk';
import type { AuthState, User } from '@/types/auth';
import { getApiClient } from '@/lib/api-client';

interface AuthContextValue extends AuthState {
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  sdk: HashinalsWalletConnectSDK | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Converts a network name string to a Hedera LedgerId enum value
 * @param network - The network name ('mainnet', 'testnet', etc.)
 * @returns The corresponding LedgerId enum value
 */
const getLedgerId = (network: string): LedgerId => {
  switch (network) {
    case 'mainnet':
      return LedgerId.MAINNET;
    case 'testnet':
      return LedgerId.TESTNET;
    default:
      return LedgerId.TESTNET;
  }
};

/**
 * Authentication provider component that manages wallet connection state and user authentication
 * Provides wallet connection functionality, balance tracking, and authentication context to child components
 * @param props - Component props
 * @param props.children - Child components to wrap with authentication context
 * @returns Authentication provider wrapper component
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const logger = new Logger({ module: 'AuthProvider' });
  const [authState, setAuthState] = useState<AuthState>({
    isConnected: false,
    user: null,
    isLoading: true,
  });

  const [sdk, setSdk] = useState<HashinalsWalletConnectSDK | null>(null);
  const [mirrorNode, setMirrorNode] = useState<HederaMirrorNode | null>(null);

  const fetchUserData = useCallback(
    async (accountId: string) => {
      try {
        const apiClient = getApiClient();
        const [hbarData, creditData] = await Promise.all([
          mirrorNode ? mirrorNode.getAccountBalance(accountId) : null,
          apiClient.getCreditBalance(accountId)
            .catch(() => ({ balance: 0, totalPurchased: 0, totalConsumed: 0 })),
        ]);

        const hbarBalance = hbarData || 0;

        const user: User = {
          accountId,
          balance: {
            hbar: hbarBalance,
            credits: creditData.balance || 0,
          },
        };

        setAuthState({
          isConnected: true,
          user,
          isLoading: false,
        });
      } catch (error) {
        logger.error('Failed to fetch user data', { error });
        setAuthState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [mirrorNode]
  );

  useEffect(() => {
    const initSDK = async () => {
      try {
        const ledger = getLedgerId(HEDERA_CONFIG.network);
        const instance = HashinalsWalletConnectSDK.getInstance(
          undefined,
          ledger
        );
        instance.setNetwork(ledger);

        await instance.init(
          HEDERA_CONFIG.walletConnect.projectId,
          HEDERA_CONFIG.walletConnect.metadata,
          ledger
        );
        setSdk(instance);

        const mirrorNodeLogger = Logger.getInstance({
          level: 'error',
          module: 'MirrorNode',
        });
        const mirrorNodeInstance = new HederaMirrorNode(HEDERA_CONFIG.network as 'mainnet' | 'testnet', mirrorNodeLogger);
        setMirrorNode(mirrorNodeInstance);

        const accountResponse = await instance.initAccount(
          HEDERA_CONFIG.walletConnect.projectId,
          HEDERA_CONFIG.walletConnect.metadata,
          ledger
        );

        if (accountResponse?.accountId) {
          await fetchUserData(accountResponse.accountId);
        }
      } catch (error) {
        logger.error('Error initializing SDK', { error });
      } finally {
        setAuthState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    initSDK();
  }, []);

  useEffect(() => {
    if (mirrorNode && authState.user) {
      fetchUserData(authState.user.accountId);
    }
  }, [mirrorNode, authState.user?.accountId]);

  const connect = useCallback(async () => {
    if (!sdk) return;

    try {
      setAuthState((prev) => ({ ...prev, isLoading: true }));

      const response = await sdk.connectWallet(
        HEDERA_CONFIG.walletConnect.projectId,
        HEDERA_CONFIG.walletConnect.metadata,
        getLedgerId(HEDERA_CONFIG.network)
      );

      if (response?.accountId) {
        await fetchUserData(response.accountId);
      }
    } catch (error) {
      logger.error('Failed to connect wallet', { error });
      setAuthState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [sdk, fetchUserData]);

  const disconnect = useCallback(() => {
    if (!sdk) return;

    try {
      sdk.disconnectWallet(true);
      setAuthState({
        isConnected: false,
        user: null,
        isLoading: false,
      });
    } catch (error) {
      logger.error('Failed to disconnect wallet', { error });
    }
  }, [sdk]);

  const refreshBalance = useCallback(async () => {
    if (!authState.user) return;

    await fetchUserData(authState.user.accountId);
  }, [authState.user, fetchUserData]);

  useEffect(() => {
    if (authState.isConnected && authState.user) {
      const interval = setInterval(refreshBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [authState.isConnected, authState.user, refreshBalance]);

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        connect,
        disconnect,
        refreshBalance,
        sdk,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Custom hook to access authentication context and wallet connection functionality
 * Must be used within an AuthProvider component
 * @returns Authentication state and methods for wallet connection management
 * @throws Error if used outside of AuthProvider context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}