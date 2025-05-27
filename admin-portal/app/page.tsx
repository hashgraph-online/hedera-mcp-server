'use client';

import { ConnectWallet } from '@/components/auth/ConnectWallet';
import { useAuth } from '@/components/auth/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditPurchase } from '@/components/credits/CreditPurchase';
import { CreditHistory } from '@/components/credits/CreditHistory';
import { OperationPricing } from '@/components/credits/OperationPricing';
import {
  CreditCard,
  Wallet,
  Activity,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { AnimatedCounter } from '@/components/ui/animated-counter';

/**
 * Main dashboard page component displaying user wallet information and credit management
 * Shows account balances, credit purchase options, transaction history, and pricing information
 * @returns Dashboard page with authentication-gated content and animated UI elements
 */
export default function DashboardPage() {
  const { isConnected, user, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-blue-50/30 dark:from-gray-950 dark:via-purple-950/20 dark:to-blue-950/20 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-hedera-purple/30 rounded-full blur-[100px] animate-blob" />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-hedera-blue/30 rounded-full blur-[100px] animate-blob"
          style={{ animationDelay: '2s' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-hedera-green/30 rounded-full blur-[100px] animate-blob"
          style={{ animationDelay: '4s' }}
        />
      </div>
      <header className="bg-white dark:bg-gray-900 shadow-lg border-b border-hedera-purple/10 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-hedera-purple to-hedera-blue rounded-xl flex items-center justify-center animate-glow shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-black hedera-gradient-text animate-slide-in">
                Hedera Admin Portal
              </h1>
            </div>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isConnected && !isLoading && (
          <div className="text-center py-24 relative z-10">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-5xl md:text-6xl font-black text-gray-900 dark:text-white mb-6 animate-fade-in leading-tight">
                The Next Generation of
                <span className="block hedera-gradient-text animate-gradient-shift mt-2 text-6xl md:text-7xl">
                  Hedera Management
                </span>
              </h2>
              <p
                className="text-xl text-gray-600 dark:text-gray-400 mb-12 animate-fade-in max-w-2xl mx-auto"
                style={{ animationDelay: '0.2s' }}
              >
                Experience seamless credit management with our cutting-edge
                portal
              </p>
              <div
                className="animate-fade-in"
                style={{ animationDelay: '0.4s' }}
              >
                <ConnectWallet />
              </div>
            </div>
          </div>
        )}

        {isConnected && user && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-white dark:bg-gray-800 border border-hedera-purple/10 shadow-lg hover:shadow-xl hover:border-hedera-purple/30 transition-all duration-300 hover:-translate-y-1 animate-fade-in group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-hedera-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-hedera-charcoal/70 dark:text-gray-400">
                    HBAR Balance
                  </CardTitle>
                  <div className="p-3 bg-gradient-to-br from-hedera-purple/20 to-hedera-purple/10 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-transform">
                    <Wallet className="h-5 w-5 text-hedera-purple" />
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  <div className="text-3xl font-black hedera-gradient-text">
                    <AnimatedCounter
                      value={user.balance?.hbar || 0}
                      decimals={2}
                      suffix=" ℏ"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-sm text-hedera-smoke dark:text-gray-400">
                      Available balance
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card
                className="bg-white dark:bg-gray-800 border border-hedera-blue/10 shadow-lg hover:shadow-xl hover:border-hedera-blue/30 transition-all duration-300 hover:-translate-y-1 animate-fade-in group relative overflow-hidden"
                style={{ animationDelay: '0.1s' }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-hedera-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-hedera-charcoal/70 dark:text-gray-400">
                    Credit Balance
                  </CardTitle>
                  <div className="p-3 bg-gradient-to-br from-hedera-blue/20 to-hedera-blue/10 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-transform">
                    <CreditCard className="h-5 w-5 text-hedera-blue" />
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  <div className="text-3xl font-black hedera-gradient-text">
                    <AnimatedCounter value={user.balance?.credits || 0} />
                  </div>
                  <p className="text-sm text-hedera-smoke dark:text-gray-400 mt-1">
                    Portal credits
                  </p>
                  <div className="mt-3 h-2 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden backdrop-blur-sm">
                    <div
                      className="h-full bg-gradient-to-r from-hedera-blue to-hedera-purple animate-gradient-pulse rounded-full"
                      style={{
                        width: `${Math.min(((user.balance?.credits || 0) / 10000) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card
                className="bg-white dark:bg-gray-800 border border-hedera-green/10 shadow-lg hover:shadow-xl hover:border-hedera-green/30 transition-all duration-300 hover:-translate-y-1 animate-fade-in group relative overflow-hidden"
                style={{ animationDelay: '0.2s' }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-hedera-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-hedera-charcoal/70 dark:text-gray-400">
                    Account Status
                  </CardTitle>
                  <div className="p-3 bg-gradient-to-br from-hedera-green/20 to-hedera-green/10 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-transform">
                    <Activity className="h-5 w-5 text-hedera-green animate-pulse" />
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-hedera-green rounded-full animate-pulse shadow-lg shadow-hedera-green/50" />
                    <div className="text-2xl font-black text-hedera-green">
                      Active
                    </div>
                  </div>
                  <p className="text-sm text-hedera-smoke dark:text-gray-400 font-mono">
                    {user.accountId}
                  </p>
                  <p className="text-xs text-hedera-smoke/70 dark:text-gray-500 mt-2">
                    Last seen: just now
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <CreditPurchase key={user.balance?.credits} />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
              <OperationPricing />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '0.5s' }}>
              <CreditHistory />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
