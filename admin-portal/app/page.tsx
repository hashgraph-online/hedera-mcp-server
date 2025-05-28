'use client';

import { ConnectWallet } from '@/components/auth/ConnectWallet';
import { useAuth } from '@/components/auth/AuthProvider';
import { AuthRequired } from '@/components/auth/AuthRequired';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { CreditPurchase } from '@/components/credits/CreditPurchase';
import { CreditHistory } from '@/components/credits/CreditHistory';
import { OperationPricing } from '@/components/credits/OperationPricing';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TestChat } from '@/components/chat/TestChat';
import { BearerTokenDisplay } from '@/components/auth/BearerTokenDisplay';
import { Button } from '@/components/ui/button';
import {
  CreditCard,
  Wallet,
  Sparkles,
  ShoppingCart,
  Receipt,
  MessageSquare,
  Zap,
  HelpCircle,
  ArrowRight,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { useState } from 'react';

type DashboardPageProps = Record<string, never>;

/**
 * Main dashboard page with simplified navigation and newbie-friendly design
 * @returns Dashboard page with improved UX for beginners
 */
export default function DashboardPage({}: DashboardPageProps) {
  const { isConnected, user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/20 to-blue-50/20 dark:from-gray-950 dark:via-purple-950/10 dark:to-blue-950/10">
      {/* Simplified Header */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-hedera-purple to-hedera-blue rounded-lg flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Hedera Portal
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Manage your credits & test transactions
                </p>
              </div>
            </div>
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Welcome Section for Non-Connected Users */}
        {!isConnected && !isLoading && (
          <div className="text-center py-12">
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="space-y-4">
                <h2 className="text-4xl font-bold text-gray-900 dark:text-white">
                  Welcome to Hedera Portal
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                  Connect your wallet to start using Hedera services. Buy
                  credits to run transactions and test your applications.
                </p>
              </div>

              {/* How it Works */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                <Card className="border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 bg-hedera-purple/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Wallet className="w-6 h-6 text-hedera-purple" />
                    </div>
                    <CardTitle className="text-lg">1. Connect Wallet</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      Use HashPack or any WalletConnect compatible wallet
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 bg-hedera-blue/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CreditCard className="w-6 h-6 text-hedera-blue" />
                    </div>
                    <CardTitle className="text-lg">2. Buy Credits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      Purchase credits with HBAR to pay for operations
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 bg-hedera-green/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Zap className="w-6 h-6 text-hedera-green" />
                    </div>
                    <CardTitle className="text-lg">3. Start Building</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      Test transactions and integrate with your app
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="pt-4">
                <ConnectWallet />
              </div>
            </div>
          </div>
        )}

        {/* Connected User Dashboard */}
        {isConnected && user && (
          <AuthRequired>
            <div className="space-y-6">
              {/* Quick Stats - Simplified */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        HBAR Balance
                      </CardTitle>
                      <Wallet className="h-4 w-4 text-gray-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      <AnimatedCounter
                        value={user.balance?.hbar || 0}
                        decimals={2}
                        suffix=" ℏ"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Credits
                      </CardTitle>
                      <CreditCard className="h-4 w-4 text-gray-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      <AnimatedCounter value={user.balance?.credits || 0} />
                    </div>
                    {user.balance?.credits === 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Buy credits to get started
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Account
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs text-green-600 dark:text-green-400">
                          Active
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
                      {user.accountId}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Main Navigation - Simplified Tabs */}
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                >
                  <div className="border-b border-gray-200 dark:border-gray-700 px-6">
                    <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-transparent h-auto p-0 gap-4">
                      <TabsTrigger
                        value="overview"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-hedera-purple rounded-none pb-4 pt-4"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Info className="w-4 h-4" />
                          <span className="text-xs font-medium">Overview</span>
                        </div>
                      </TabsTrigger>
                      <TabsTrigger
                        value="buy"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-hedera-purple rounded-none pb-4 pt-4"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <ShoppingCart className="w-4 h-4" />
                          <span className="text-xs font-medium">
                            Buy Credits
                          </span>
                        </div>
                      </TabsTrigger>
                      <TabsTrigger
                        value="history"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-hedera-purple rounded-none pb-4 pt-4"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Receipt className="w-4 h-4" />
                          <span className="text-xs font-medium">History</span>
                        </div>
                      </TabsTrigger>
                      <TabsTrigger
                        value="test"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-hedera-purple rounded-none pb-4 pt-4"
                      >
                        <div className="flex flex-col items-center gap-1 relative">
                          <MessageSquare className="w-4 h-4" />
                          <span className="text-xs font-medium">Test Lab</span>
                          <Badge className="absolute -top-1 -right-2 px-1 py-0 text-[9px] bg-hedera-purple text-white border-0">
                            Try it!
                          </Badge>
                        </div>
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <div className="p-6">
                    <TabsContent value="overview" className="mt-0 space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Getting Started with Hedera Portal
                        </h3>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Card
                            className="border-gray-200 dark:border-gray-700 hover:border-hedera-purple/50 transition-colors cursor-pointer"
                            onClick={() => setActiveTab('buy')}
                          >
                            <CardHeader className="pb-4">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <CardTitle className="text-base">
                                    Buy Credits
                                  </CardTitle>
                                  <CardDescription className="text-sm">
                                    Purchase credits to start using Hedera
                                    services
                                  </CardDescription>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-400" />
                              </div>
                            </CardHeader>
                          </Card>

                          <Card
                            className="border-gray-200 dark:border-gray-700 hover:border-hedera-purple/50 transition-colors cursor-pointer"
                            onClick={() => setActiveTab('test')}
                          >
                            <CardHeader className="pb-4">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <CardTitle className="text-base">
                                    Test Transactions
                                  </CardTitle>
                                  <CardDescription className="text-sm">
                                    Try out Hedera operations in our test lab
                                  </CardDescription>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-400" />
                              </div>
                            </CardHeader>
                          </Card>
                        </div>

                        {/* What are Credits? */}
                        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                          <CardHeader className="pb-3">
                            <div className="flex items-start gap-3">
                              <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                              <div className="space-y-1">
                                <CardTitle className="text-base text-blue-900 dark:text-blue-100">
                                  What are Credits?
                                </CardTitle>
                                <CardDescription className="text-sm text-blue-700 dark:text-blue-300">
                                  Credits are used to pay for operations on the
                                  Hedera network through our MCP server. 1
                                  credit = $0.001 USD. Different operations cost
                                  different amounts of credits.
                                </CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                        </Card>

                        {/* FastMCP Inspector Integration */}
                        <BearerTokenDisplay />

                        {/* Pricing Preview */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Common Operations & Costs
                          </h4>
                          <OperationPricing />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="buy" className="mt-0">
                      <CreditPurchase />
                    </TabsContent>

                    <TabsContent value="history" className="mt-0">
                      <CreditHistory />
                    </TabsContent>

                    <TabsContent value="test" className="mt-0">
                      <div className="space-y-4">
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                Test Lab Instructions
                              </p>
                              <p className="text-sm text-amber-700 dark:text-amber-300">
                                Select a tool from the buttons, then type your
                                request naturally. For example:
                              </p>
                              <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1 mt-2">
                                <li className="flex items-start gap-2">
                                  <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  <span>&quot;Transfer 5 HBAR to 0.0.1234&quot;</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  <span>&quot;Create a token called TestCoin&quot;</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  <span>&quot;Check my balance&quot;</span>
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>
                        <TestChat />
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </Card>

              {/* Help Section */}
              <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Need Help?
                    </CardTitle>
                    <HelpCircle className="w-4 h-4 text-gray-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      asChild
                    >
                      <a
                        href="https://docs.hedera.com"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Documentation
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      asChild
                    >
                      <a
                        href="https://hedera.com/discord"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Join Discord
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      asChild
                    >
                      <a
                        href="https://github.com/hashgraph-online"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        GitHub
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </AuthRequired>
        )}
      </main>
    </div>
  );
}
