export interface User {
  accountId: string;
  balance: {
    hbar: number;
    credits: number;
  };
  publicKey?: string;
}

export interface AuthState {
  isConnected: boolean;
  user: User | null;
  isLoading: boolean;
}

export interface WalletSession {
  accountId: string;
  network: string;
  topic: string;
}