'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { Logger } from '@hashgraphonline/standards-sdk';
import { getMCPClient } from '@/lib/mcp-client';
import { useAuth } from '@/components/auth/AuthProvider';

interface OperationPricing {
  operationName: string;
  category: 'free' | 'basic' | 'standard' | 'premium' | 'enterprise';
  baseCost: number;
  description: string;
}

interface PricingData {
  operations: Record<string, number>;
  tiers: any[];
  modifiers: any;
  currentHbarToUsdRate?: number;
}

const OPERATION_DESCRIPTIONS: Record<string, string> = {
  health_check: 'Check server health and status',
  get_server_info: 'Get server configuration and capabilities',
  check_credit_balance: 'Check credit balance for your authenticated account',
  get_credit_history: 'Get credit transaction history',
  purchase_credits: 'Purchase credits using HBAR',
  verify_payment: 'Verify payment transaction and allocate credits',
  check_payment_status: 'Check the status of a payment transaction',
  get_payment_history: 'Get payment history for an account',
  get_pricing_configuration:
    'Get pricing configuration including costs and tiers',
  process_hbar_payment:
    'Manually process an HBAR payment for credit allocation',
  refresh_profile: 'Refresh server HCS-11 profile and registration status',
  generate_transaction_bytes:
    'Generate transaction bytes for any Hedera operation without execution',
  schedule_transaction: 'Create scheduled transaction for any Hedera operation',
  execute_transaction: 'Execute any Hedera transaction immediately',
};

const OPERATION_CATEGORIES: Record<
  string,
  'free' | 'basic' | 'standard' | 'premium' | 'enterprise'
> = {
  health_check: 'free',
  get_server_info: 'free',
  check_credit_balance: 'free',
  get_credit_history: 'free',
  purchase_credits: 'free',
  verify_payment: 'free',
  check_payment_status: 'free',
  get_payment_history: 'free',
  get_pricing_configuration: 'free',
  process_hbar_payment: 'free',
  refresh_profile: 'basic',
  generate_transaction_bytes: 'standard',
  schedule_transaction: 'standard',
  execute_transaction: 'premium',
};

const CATEGORY_COLORS = {
  free: 'bg-green-50 text-green dark:bg-green-900/20 border-green-200 dark:border-green-800',
  basic:
    'bg-blue-50 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  standard:
    'bg-hedera-purple bg-opacity-10 text-hedera-purple border-hedera-purple border-opacity-20',
  premium: 'bg-orange-900/20 text-orange border-orange border-opacity-20',
  enterprise:
    'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border-red-200',
};

const logger = new Logger({ module: 'OperationPricing' });
/**
 * Component that displays operation pricing information for MCP server operations
 * Shows credit costs organized by category with dynamic pricing data fetching
 * @param props - Component props (currently unused)
 * @returns Operation pricing display with categorized operations and costs
 */
export function OperationPricing({}) {
  const { apiKey } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [operations, setOperations] = useState<OperationPricing[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPricingData = async () => {
      try {
        setLoading(true);

        let data: PricingData;

        const mcpClient = getMCPClient();

        if (!apiKey) {
          return;
        }

        mcpClient.setApiKey(apiKey);

        try {
          const result = await mcpClient.getPricingConfiguration();

          if (!result) {
            throw new Error('No pricing data received from MCP');
          }

          if (result && typeof result === 'object' && 'error' in result) {
            throw new Error(String(result.error));
          }

          data = result;
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          logger.error('Failed to fetch pricing data from MCP', {
            error,
            message: errorMessage,
          });
          throw error;
        }

        setPricingData(data);

        let ops: OperationPricing[];

        if (!data.operations) {
          throw new Error('Invalid pricing data structure');
        }

        if (Array.isArray(data.operations)) {
          ops = data.operations.map((op: OperationPricing) => ({
            operationName: op.operationName,
            category: OPERATION_CATEGORIES[op.operationName] || 'standard',
            baseCost: op.baseCost,
            description:
              OPERATION_DESCRIPTIONS[op.operationName] ||
              op.description ||
              op.operationName,
          }));
        } else {
          ops = Object.entries(data.operations).map(([name, cost]) => ({
            operationName: name,
            category: OPERATION_CATEGORIES[name] || 'standard',
            baseCost: cost as number,
            description: OPERATION_DESCRIPTIONS[name] || name,
          }));
        }

        setOperations(
          ops.sort((a, b) => {
            const categoryOrder = [
              'free',
              'basic',
              'standard',
              'premium',
              'enterprise',
            ];
            const catCompare =
              categoryOrder.indexOf(a.category) -
              categoryOrder.indexOf(b.category);
            if (catCompare !== 0) return catCompare;
            return a.baseCost - b.baseCost;
          }),
        );
        setError(null);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to fetch pricing data', { error });
        setError(errorMessage || 'Failed to load pricing data');
      } finally {
        setLoading(false);
      }
    };
    if (apiKey) {
      fetchPricingData();
    }
  }, [apiKey]);

  const categories = [
    'free',
    'basic',
    'standard',
    'premium',
    'enterprise',
  ] as const;

  if (loading) {
    return (
      <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-hedera-purple/20">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-hedera-purple" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-hedera-purple/20">
        <CardHeader>
          <CardTitle className="text-2xl font-black hedera-gradient-text">
            Operation Pricing
          </CardTitle>
          <CardDescription className="text-red-500">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            Pricing information is temporarily unavailable. Please try again
            later.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-hedera-purple/20">
      <CardHeader>
        <CardTitle className="text-2xl font-black hedera-gradient-text">
          Operation Pricing
        </CardTitle>
        <CardDescription>
          Credit costs for different MCP operations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {categories.map(category => {
          const categoryOps = operations.filter(op => op.category === category);
          if (categoryOps.length === 0) return null;

          return (
            <div key={category} className="space-y-3">
              <h3 className="text-lg font-bold capitalize flex items-center gap-2">
                <Badge className={`${CATEGORY_COLORS[category]} border`}>
                  {category}
                </Badge>
                <span className="text-sm text-gray-500">
                  (
                  {categoryOps[0].baseCost === 0
                    ? 'Free'
                    : `${categoryOps[0].baseCost}-${categoryOps[categoryOps.length - 1].baseCost} credits`}
                  )
                </span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categoryOps.map(op => (
                  <div
                    key={op.operationName}
                    className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div>
                      <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
                        {op.operationName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {op.description}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-lg text-hedera-purple">
                        {op.baseCost}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">
                        credits
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {pricingData && (
          <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h4 className="font-bold text-sm mb-2">Pricing Modifiers</h4>
            <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <li>• Bulk operations (10+): 20% discount</li>
              <li>• Peak hours (2-10pm UTC): 20% surcharge</li>
              <li>• Mainnet operations: 20-50% surcharge</li>
              <li>• Loyalty discounts: 5-20% based on total credits used</li>
              <li>
                • Current HBAR/USD rate:{' '}
                {pricingData.currentHbarToUsdRate
                  ? `$${pricingData.currentHbarToUsdRate.toFixed(4)}`
                  : 'Market rate'}
              </li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
