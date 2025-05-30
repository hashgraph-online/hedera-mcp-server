'use client';

import { ConnectWallet } from '@/components/auth/ConnectWallet';
import { ThemeToggle } from '@/components/ui/theme-toggle';
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
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-semibold">⚡</div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Hedera AI Studio
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <ConnectWallet />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!isConnected && !isLoading && (
          <div className="text-center py-12">
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="space-y-4">
                <h2 className="text-4xl font-bold text-foreground">
                  Welcome to Hedera Portal
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Connect your wallet to start using Hedera services. Buy
                  credits to run transactions and test your applications.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                <Card className="border-border hover:border-border/80 transition-colors">
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Wallet className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">1. Connect Wallet</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground text-center">
                      Use HashPack or any WalletConnect compatible wallet
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border hover:border-border/80 transition-colors">
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CreditCard className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">2. Buy Credits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground text-center">
                      Purchase credits with HBAR to pay for operations
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border hover:border-border/80 transition-colors">
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Zap className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">3. Start Building</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground text-center">
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

        {isConnected && user && (
          <AuthRequired>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        HBAR Balance
                      </CardTitle>
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">
                      <AnimatedCounter
                        value={user.balance?.hbar || 0}
                        decimals={2}
                        suffix=" ℏ"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Credits
                      </CardTitle>
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">
                      <AnimatedCounter value={user.balance?.credits || 0} />
                    </div>
                    {user.balance?.credits === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Buy credits to get started
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Account
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        <span className="text-xs text-primary">Active</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-mono text-muted-foreground">
                      {user.accountId}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-card border-border">
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                >
                  <div className="border-b border-border px-6">
                    <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-transparent h-auto p-0 gap-4">
                      <TabsTrigger
                        value="overview"
                        className="data-[state=active]:bg-tertiary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold rounded-none pb-4 pt-4"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Info className="w-4 h-4" />
                          <span className="text-xs font-medium">Overview</span>
                        </div>
                      </TabsTrigger>
                      <TabsTrigger
                        value="buy"
                        className="data-[state=active]:bg-tertiary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold rounded-none pb-4 pt-4"
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
                        className="data-[state=active]:bg-tertiary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold rounded-none pb-4 pt-4"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Receipt className="w-4 h-4" />
                          <span className="text-xs font-medium">History</span>
                        </div>
                      </TabsTrigger>
                      <TabsTrigger
                        value="test"
                        className="data-[state=active]:bg-tertiary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold rounded-none pb-4 pt-4"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <MessageSquare className="w-4 h-4" />
                          <span className="text-xs font-medium">MCP Chat</span>
                        </div>
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <div className="p-6">
                    <TabsContent value="overview" className="mt-0 space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-primary">
                          Getting Started with Hedera Portal
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Card
                            className="hashscan-card hover:border-accent transition-colors cursor-pointer"
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
                                <ArrowRight className="w-5 h-5 text-secondary" />
                              </div>
                            </CardHeader>
                          </Card>

                          <Card
                            className="hashscan-card hover:border-accent transition-colors cursor-pointer"
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
                                <ArrowRight className="w-5 h-5 text-secondary" />
                              </div>
                            </CardHeader>
                          </Card>
                        </div>

                        <Card className="hashscan-card">
                          <CardHeader className="pb-3">
                            <div className="flex items-start gap-3">
                              <HelpCircle className="w-5 h-5 text-secondary" />
                              <div className="space-y-1">
                                <CardTitle className="text-base">
                                  What are Credits?
                                </CardTitle>
                                <CardDescription className="text-sm">
                                  Credits are used to pay for operations on the
                                  Hedera network through our MCP server. 1
                                  credit = $0.001 USD. Different operations cost
                                  different amounts of credits.
                                </CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                        </Card>

                        <BearerTokenDisplay />

                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-primary">
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
                        <Card className="hashscan-card">
                          <CardContent className="pt-6">
                            <div className="flex items-start gap-3">
                              <Info className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-primary">
                                  Chat with MCP Server
                                </p>
                                <p className="text-sm text-secondary">
                                  Select a tool from the buttons, then type your
                                  request naturally to interact with your MCP server. For example:
                                </p>
                                <ul className="text-sm text-secondary space-y-1 mt-2">
                                  <li className="flex items-start gap-2">
                                    <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    <span>
                                      &quot;Transfer 5 HBAR to 0.0.1234&quot;
                                    </span>
                                  </li>
                                  <li className="flex items-start gap-2">
                                    <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    <span>
                                      &quot;Create a token called TestCoin&quot;
                                    </span>
                                  </li>
                                  <li className="flex items-start gap-2">
                                    <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    <span>&quot;Check my balance&quot;</span>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <TestChat />
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </Card>

              <Card className="hashscan-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-primary">
                      Need Help?
                    </CardTitle>
                    <HelpCircle className="w-4 h-4 text-secondary" />
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
