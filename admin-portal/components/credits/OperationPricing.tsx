'use client';

import React, { useState, useEffect } from 'react';
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
  get_pricing_configuration: 'Get pricing configuration including costs and tiers',
  process_hbar_payment: 'Manually process an HBAR payment for credit allocation',
  refresh_profile: 'Refresh server HCS-11 profile and registration status',
  generate_transaction_bytes: 'Generate transaction bytes for any Hedera operation without execution',
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
  free: 'bg-green-100 text-green-800 border-green-200',
  basic: 'bg-blue-100 text-blue-800 border-blue-200',
  standard: 'bg-purple-100 text-purple-800 border-purple-200',
  premium: 'bg-orange-100 text-orange-800 border-orange-200',
  enterprise: 'bg-red-100 text-red-800 border-red-200',
};

interface OperationPricingProps {}

/**
 * Component that displays operation pricing information for MCP server operations
 * Shows credit costs organized by category with dynamic pricing data fetching
 * @param props - Component props (currently unused)
 * @returns Operation pricing display with categorized operations and costs
 */
export function OperationPricing({}: OperationPricingProps) {
  const logger = new Logger({ module: 'OperationPricing' });
  const { apiKey } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [operations, setOperations] = useState<OperationPricing[]>([]);

  useEffect(() => {
    fetchPricingData();
  }, [apiKey]);

  /**
   * Fetches pricing data using the authenticated MCP client with fallback to HTTP API
   * @returns {Promise<void>} Promise that resolves when pricing data is loaded
   */
  async function fetchPricingData() {
    try {
      setLoading(true);

      let data: PricingData;

      if (apiKey) {
        try {
          const mcpClient = getMCPClient();
          mcpClient.setApiKey(apiKey);
          await mcpClient.connect();

          const result = (await mcpClient.callTool(
            'get_pricing_configuration',
            {},
          )) as any;

          if (result) {
            if (result.content && result.content[0]) {
              data = result.content[0]?.text
                ? JSON.parse(result.content[0].text)
                : result.content[0];
            } else if (result.operations) {
              data = result;
            } else {
              throw new Error('No pricing data received from MCP');
            }
          } else {
            throw new Error('No pricing data received from MCP');
          }
        } catch (mcpError) {
          logger.warn('MCP call failed, falling back to HTTP API', {
            error: mcpError,
          });

          const httpApiUrl =
            process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';
          const response = await fetch(`${httpApiUrl}/api/credits/pricing`);

          if (!response.ok) {
            throw new Error('Failed to fetch pricing data from HTTP API');
          }

          data = await response.json();
        }
      } else {
        const httpApiUrl =
          process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002';
        const response = await fetch(`${httpApiUrl}/api/credits/pricing`);

        if (!response.ok) {
          throw new Error('Failed to fetch pricing data');
        }

        data = await response.json();
      }

      setPricingData(data);

      let ops: OperationPricing[];
      
      if (Array.isArray(data.operations)) {
        ops = data.operations.map((op: any) => ({
          operationName: op.operationName,
          category: OPERATION_CATEGORIES[op.operationName] || 'standard',
          baseCost: op.baseCost,
          description: OPERATION_DESCRIPTIONS[op.operationName] || op.description || op.operationName,
        }));
      } else {
        ops = Object.entries(data.operations).map(
          ([name, cost]) => ({
            operationName: name,
            category: OPERATION_CATEGORIES[name] || 'standard',
            baseCost: cost as number,
            description: OPERATION_DESCRIPTIONS[name] || name,
          }),
        );
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
    } catch (error) {
      logger.error('Failed to fetch pricing data', { error });
    } finally {
      setLoading(false);
    }
  }

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
              <li>• Current HBAR/USD rate: {pricingData.currentHbarToUsdRate ? `$${pricingData.currentHbarToUsdRate.toFixed(4)}` : 'Market rate'}</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
