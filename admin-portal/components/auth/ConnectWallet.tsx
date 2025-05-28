"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { Wallet, LogOut } from "lucide-react";

interface ConnectWalletProps {}

/**
 * Wallet connection button component that displays connection state and allows connect/disconnect
 * Shows account ID when connected and provides disconnect functionality
 * @param {ConnectWalletProps} props - Component props (currently unused)
 * @returns {JSX.Element} Connect/disconnect button with appropriate state display
 */
export function ConnectWallet({}: ConnectWalletProps) {
  const { isConnected, user, connect, disconnect, isLoading } = useAuth();

  if (isConnected && user) {
    return (
      <div className="flex items-center gap-4">
        <div className="text-sm font-medium text-hedera-charcoal dark:text-gray-300">
          {user.accountId}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={disconnect}
          disabled={isLoading}
          className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 dark:hover:text-red-400"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="default"
      onClick={connect}
      disabled={isLoading}
      className="animate-pulse-slow"
    >
      <Wallet className="mr-2 h-4 w-4" />
      {isLoading ? "Connecting..." : "Connect Wallet"}
    </Button>
  );
}