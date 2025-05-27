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
  health_check: 'System health check',
  get_server_info: 'Get server information',
  get_balance: 'Check credit balance',
  get_account_info: 'Query account information',
  get_transaction_info: 'Query transaction details',
  refresh_profile: 'Refresh HCS-11 profile',
  query_balance: 'Query Hedera account balance',
  generate_transaction_bytes: 'Generate transaction bytes',
  create_token: 'Create fungible token',
  schedule_transaction: 'Create scheduled transaction',
  execute_transaction: 'Execute transaction directly',
  create_nft: 'Create NFT collection',
  mint_nft: 'Mint NFT',
  smart_contract_call: 'Call smart contract function',
  multi_sig_transaction: 'Multi-signature transaction',
  batch_transactions: 'Batch transaction processing',
  deploy_contract: 'Deploy smart contract',
  consensus_submit_large: 'Submit large consensus message',
};

const OPERATION_CATEGORIES: Record<string, 'free' | 'basic' | 'standard' | 'premium' | 'enterprise'> = {
  health_check: 'free',
  get_server_info: 'free',
  get_balance: 'free',
  get_account_info: 'basic',
  get_transaction_info: 'basic',
  refresh_profile: 'basic',
  query_balance: 'basic',
  generate_transaction_bytes: 'standard',
  create_token: 'standard',
  schedule_transaction: 'standard',
  execute_transaction: 'standard',
  create_nft: 'premium',
  mint_nft: 'premium',
  smart_contract_call: 'premium',
  multi_sig_transaction: 'premium',
  batch_transactions: 'enterprise',
  deploy_contract: 'enterprise',
  consensus_submit_large: 'enterprise',
};

const CATEGORY_COLORS = {
  free: 'bg-green-100 text-green-800 border-green-200',
  basic: 'bg-blue-100 text-blue-800 border-blue-200',
  standard: 'bg-purple-100 text-purple-800 border-purple-200',
  premium: 'bg-orange-100 text-orange-800 border-orange-200',
  enterprise: 'bg-red-100 text-red-800 border-red-200',
};

interface OperationPricingProps {}

export function OperationPricing({}: OperationPricingProps) {
  const logger = new Logger({ module: 'OperationPricing' });
  const [loading, setLoading] = useState(true);
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [operations, setOperations] = useState<OperationPricing[]>([]);

  useEffect(() => {
    fetchPricingData();
  }, []);

  /**
   * Fetches pricing data from the API
   */
  async function fetchPricingData() {
    try {
      setLoading(true);
      const baseUrl = process.env.NEXT_PUBLIC_MCP_SERVER_URL?.replace('/stream', '') || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/credits/pricing`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch pricing data');
      }

      const data: PricingData = await response.json();
      setPricingData(data);

      const ops: OperationPricing[] = Object.entries(data.operations).map(([name, cost]) => ({
        operationName: name,
        category: OPERATION_CATEGORIES[name] || 'standard',
        baseCost: cost,
        description: OPERATION_DESCRIPTIONS[name] || name,
      }));

      setOperations(ops.sort((a, b) => {
        const categoryOrder = ['free', 'basic', 'standard', 'premium', 'enterprise'];
        const catCompare = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
        if (catCompare !== 0) return catCompare;
        return a.baseCost - b.baseCost;
      }));
    } catch (error) {
      logger.error('Failed to fetch pricing data', { error });
    } finally {
      setLoading(false);
    }
  }

  const categories = ['free', 'basic', 'standard', 'premium', 'enterprise'] as const;

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
        <CardTitle className="text-2xl font-black hedera-gradient-text">Operation Pricing</CardTitle>
        <CardDescription>
          Credit costs for different MCP operations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {categories.map((category) => {
          const categoryOps = operations.filter(op => op.category === category);
          if (categoryOps.length === 0) return null;

          return (
            <div key={category} className="space-y-3">
              <h3 className="text-lg font-bold capitalize flex items-center gap-2">
                <Badge className={`${CATEGORY_COLORS[category]} border`}>
                  {category}
                </Badge>
                <span className="text-sm text-gray-500">
                  ({categoryOps[0].baseCost === 0 ? 'Free' : `${categoryOps[0].baseCost}-${categoryOps[categoryOps.length - 1].baseCost} credits`})
                </span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categoryOps.map((op) => (
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
                      <span className="text-xs text-gray-500 ml-1">credits</span>
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
              <li>• Bulk operations (100+): 5% discount</li>
              <li>• Peak hours (9-11am, 2-4pm): 20% surcharge</li>
              <li>• Network congestion: Dynamic pricing applies</li>
              <li>• Loyalty discounts: 2-10% based on total usage</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}