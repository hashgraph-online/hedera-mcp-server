'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/auth/AuthProvider';
import { CREDIT_PACKAGES } from '@/lib/constants/config';
import { getMCPClient } from '@/lib/mcp-client';
import { Loader2, RefreshCw, Calculator } from 'lucide-react';
import { Transaction } from '@hashgraph/sdk';
import { Logger } from '@hashgraphonline/standards-sdk';
import {
  calculateHbarForCredits,
  calculateCreditsForHbar,
  getEffectiveRate,
  getTierForAmount,
  PRICING_TIERS,
} from '@/lib/pricing';

type CreditPackage = (typeof CREDIT_PACKAGES)[number];

interface CreditPurchaseProps {}

/**
 * Component that handles credit purchases with tiered pricing and custom amounts
 * Allows users to buy credits using HBAR with volume discounts and real-time transaction tracking
 * @param props - Component props (currently unused)
 * @returns Credit purchase interface with package selection and payment processing
 */
export function CreditPurchase({}: CreditPurchaseProps) {
  const logger = new Logger({ module: 'CreditPurchase' });
  const { user, refreshBalance, sdk } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(
    null
  );
  const [customAmount, setCustomAmount] = useState<string>('');
  const [customHbar, setCustomHbar] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isCheckingPending, setIsCheckingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<
    'idle' | 'pending' | 'confirming' | 'completed' | 'failed'
  >('idle');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );

  const stopPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [pollingInterval]);

  const checkTransactionStatus = async (txId: string) => {
    try {
      const mcpClient = getMCPClient();
      const result = await mcpClient.checkPaymentStatus(txId);

      if (result.status === 'completed') {
        stopPolling();
        setTransactionStatus('completed');
        await refreshBalance();
        setSelectedPackage(null);
        setTransactionId(null);
        setCustomAmount('');
        setCustomHbar('');
      } else if (result.status === 'failed') {
        stopPolling();
        setTransactionStatus('failed');
        setError('Transaction failed');
      }
    } catch (error) {
      logger.error('Error checking transaction status', { error });
    }
  };

  const handleCheckPendingPayments = async () => {
    if (!user) return;

    setIsCheckingPending(true);
    setError(null);

    try {
      const mcpClient = getMCPClient();
      await mcpClient.connect();

      const result = await mcpClient.callTool('check_pending_payments', {
        accountId: user.accountId,
      });

      logger.info('Pending payments check result', { result });

      await refreshBalance();

      setError(null);
    } catch (err) {
      logger.error('Error checking pending payments', { error: err });
      setError(
        'Failed to check pending payments. The server will automatically check every 30 seconds.'
      );
    } finally {
      setIsCheckingPending(false);
    }
  };

  const handleCustomCreditsChange = (value: string) => {
    setCustomAmount(value);
    if (value && !isNaN(Number(value))) {
      const credits = Number(value);
      const hbar = calculateHbarForCredits(credits);
      setCustomHbar(hbar.toFixed(4));
    } else {
      setCustomHbar('');
    }
  };

  const handleCustomHbarChange = (value: string) => {
    setCustomHbar(value);
    if (value && !isNaN(Number(value))) {
      const hbar = Number(value);
      const credits = calculateCreditsForHbar(hbar);
      setCustomAmount(credits.toString());
    } else {
      setCustomAmount('');
    }
  };

  const handlePurchase = async () => {
    if ((!selectedPackage && !isCustom) || !user || !sdk) return;

    setIsPurchasing(true);
    setError(null);
    setTransactionStatus('pending');

    try {
      const amount = isCustom ? Number(customAmount) : selectedPackage!.amount;

      const hbarAmount = isCustom ? Number(customHbar) : selectedPackage!.price;

      if (amount < 1000) {
        setError('Minimum purchase is 1,000 credits');
        setTransactionStatus('idle');
        setIsPurchasing(false);
        return;
      }

      if (hbarAmount < 10) {
        setError('Minimum purchase is 10 HBAR');
        setTransactionStatus('idle');
        setIsPurchasing(false);
        return;
      }

      const mcpClient = getMCPClient();
      await mcpClient.connect();

      const paymentData = await mcpClient.createPaymentTransaction(
        user.accountId,
        hbarAmount,
        `Credits purchase: ${amount}`
      );

      const transactionBytes = Buffer.from(
        paymentData.transaction_bytes,
        'base64'
      );
      const transaction = Transaction.fromBytes(transactionBytes);

      const result = await sdk.executeTransactionWithErrorHandling(
        transaction,
        true
      );

      if (result.error) {
        setError(result.error);
        setTransactionStatus('failed');
        return;
      }

      if (!result.result) {
        setError('Transaction failed - no result received');
        setTransactionStatus('failed');
        return;
      }

      const txId = paymentData.transaction_id;
      setTransactionId(txId);
      setTransactionStatus('confirming');

      logger.info('Transaction executed, verifying payment', {
        transactionId: txId,
        receiptStatus: result.result?.status?.toString(),
      });

      const verifyResult = await mcpClient.verifyPayment(txId);

      if (!verifyResult.success) {
        const interval = setInterval(() => checkTransactionStatus(txId), 3000);
        setPollingInterval(interval);
      } else {
        setTransactionStatus('completed');
        await refreshBalance();
        setSelectedPackage(null);
        setTransactionId(null);
      }
    } catch (err) {
      logger.error('Purchase error', { error: err });
      setError(
        err instanceof Error ? err.message : 'Failed to complete purchase'
      );
      setTransactionStatus('failed');
    } finally {
      setIsPurchasing(false);
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Purchase Credits</CardTitle>
          <CardDescription>
            Select a credit package or enter a custom amount. Credits are used
            to pay for MCP operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Pricing Tiers Info */}
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">Volume Pricing Tiers</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                {PRICING_TIERS.map((tier) => (
                  <div key={tier.tier} className="flex justify-between">
                    <span className="capitalize">{tier.tier}</span>
                    <span>
                      {tier.minCredits.toLocaleString()} -{' '}
                      {tier.maxCredits === Infinity
                        ? '∞'
                        : tier.maxCredits.toLocaleString()}{' '}
                      credits: {(1 / tier.hbarPerCredit).toFixed(0)}{' '}
                      credits/HBAR
                      {tier.discountPercentage > 0 && (
                        <span className="text-green-600 ml-2">
                          (-{tier.discountPercentage}%)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Package Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CREDIT_PACKAGES.map((pkg) => (
                <button
                  key={pkg.amount}
                  onClick={() => {
                    setSelectedPackage(pkg);
                    setIsCustom(false);
                    setCustomAmount('');
                    setCustomHbar('');
                  }}
                  className={`p-4 rounded-lg border transition-colors text-left ${
                    selectedPackage === pkg && !isCustom
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  disabled={isPurchasing}
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold">{pkg.label}</h3>
                      {pkg.savings !== '0%' && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          Save {pkg.savings}
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-bold">
                      {pkg.amount.toLocaleString()} credits
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {pkg.price.toFixed(2)} HBAR
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(pkg.amount / pkg.price).toFixed(0)} credits/HBAR
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Amount */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Custom Amount
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom-credits">Credits</Label>
                    <Input
                      id="custom-credits"
                      type="number"
                      placeholder="Enter credits"
                      value={customAmount}
                      onChange={(e) => {
                        setIsCustom(true);
                        setSelectedPackage(null);
                        handleCustomCreditsChange(e.target.value);
                      }}
                      min="1000"
                      step="100"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum: 1,000 credits
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-hbar">HBAR</Label>
                    <Input
                      id="custom-hbar"
                      type="number"
                      placeholder="Enter HBAR"
                      value={customHbar}
                      onChange={(e) => {
                        setIsCustom(true);
                        setSelectedPackage(null);
                        handleCustomHbarChange(e.target.value);
                      }}
                      min="10"
                      step="0.1"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum: 10 HBAR
                    </p>
                  </div>
                </div>
                {customAmount && customHbar && (
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <p className="text-sm">
                      <span className="font-medium">
                        {Number(customAmount).toLocaleString()}
                      </span>{' '}
                      credits for{' '}
                      <span className="font-medium">
                        {Number(customHbar).toFixed(4)}
                      </span>{' '}
                      HBAR
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Effective rate:{' '}
                      {(Number(customAmount) / Number(customHbar)).toFixed(0)}{' '}
                      credits/HBAR
                      {(() => {
                        const tier = getTierForAmount(Number(customAmount));
                        return tier.discountPercentage > 0 ? (
                          <span className="text-green-600 ml-1">
                            ({tier.tier} tier: -{tier.discountPercentage}%)
                          </span>
                        ) : null;
                      })()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Messages */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {transactionStatus === 'confirming' && transactionId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-700">
                  Waiting for transaction confirmation...
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Transaction ID: {transactionId}
                </p>
              </div>
            )}

            {transactionStatus === 'completed' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700">
                  Purchase completed successfully! Credits have been added to
                  your account.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handlePurchase}
                disabled={
                  (!selectedPackage && !isCustom) ||
                  isPurchasing ||
                  !user ||
                  !sdk ||
                  (isCustom && (!customAmount || !customHbar))
                }
                className="flex-1"
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Purchase{' '}
                    {isCustom && customAmount
                      ? `${Number(customAmount).toLocaleString()} Credits`
                      : selectedPackage
                        ? `${selectedPackage.amount.toLocaleString()} Credits`
                        : 'Credits'}
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleCheckPendingPayments}
                disabled={isCheckingPending || !user}
                title="Check for pending payments"
              >
                {isCheckingPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
