'use client';

import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/components/auth/AuthProvider';
import { Loader2 } from 'lucide-react';
import { getApiClient } from '@/lib/api-client';
import { Logger } from '@hashgraphonline/standards-sdk';

interface CreditTransaction {
  accountId: string;
  transactionType: 'purchase' | 'consumption';
  amount: number;
  balanceAfter: number;
  description?: string;
  relatedOperation?: string;
  createdAt: string;
}

interface CreditHistoryProps {}

const logger = new Logger({ module: 'CreditHistory' });

/**
 * Component that displays a user's credit transaction history with real-time updates
 * Shows purchase and consumption transactions with amounts, balances, and timestamps
 * @param props - Component props (currently unused)
 * @returns Credit history display component with transaction list
 */
export function CreditHistory({}: CreditHistoryProps) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchHistory = async () => {
      try {
        const apiClient = getApiClient();
        const transactions = await apiClient.getCreditHistory(
          user.accountId,
          20
        );
        setTransactions(transactions);
        setError(null);
      } catch (err) {
        setError('Failed to load transaction history');
        logger.error('Error fetching credit history', { error: err });
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();

    const interval = setInterval(fetchHistory, 5000);

    return () => clearInterval(interval);
  }, [user, logger]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getTransactionColor = (type: string) => {
    return type === 'purchase' ? 'text-hedera-green' : 'text-red-600';
  };

  const getTransactionSign = (type: string) => {
    return type === 'purchase' ? '+' : '-';
  };

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-hedera-purple/10 shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl font-black hedera-gradient-text">
            Transaction History
          </CardTitle>
          <CardDescription className="text-hedera-smoke dark:text-gray-400">
            Loading your credit transactions...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-hedera-purple" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-hedera-purple/10 shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl font-black hedera-gradient-text">
            Transaction History
          </CardTitle>
          <CardDescription className="text-hedera-smoke dark:text-gray-400">
            Error loading transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border border-hedera-purple/10 shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-xl font-black hedera-gradient-text">
          Transaction History
        </CardTitle>
        <CardDescription className="text-hedera-smoke dark:text-gray-400">
          Your recent credit transactions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-hedera-smoke dark:text-gray-400">
            No transactions found
          </p>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-hedera-purple/30 transition-all duration-200 bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${getTransactionColor(transaction.transactionType)}`}
                    >
                      {getTransactionSign(transaction.transactionType)}
                      {transaction.amount} credits
                    </span>
                    <span className="text-sm text-hedera-smoke dark:text-gray-400">
                      Balance: {transaction.balanceAfter}
                    </span>
                  </div>
                  {transaction.description && (
                    <p className="text-sm text-hedera-smoke dark:text-gray-400 mt-1">
                      {transaction.description}
                    </p>
                  )}
                  {transaction.relatedOperation && (
                    <p className="text-xs text-hedera-smoke/70 dark:text-gray-500 mt-1">
                      Operation: {transaction.relatedOperation}
                    </p>
                  )}
                </div>
                <div className="text-sm text-hedera-smoke dark:text-gray-400">
                  {formatDate(transaction.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
