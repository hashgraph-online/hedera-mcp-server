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
import { getMCPClient } from '@/lib/mcp-client';
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

const logger = new Logger({ module: 'CreditHistory' });

export function CreditHistory() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchHistory = async () => {
      try {
        const mcpClient = getMCPClient();
        const result = await mcpClient.getCreditHistory(user.accountId, 20);
        setTransactions(result.transactions);
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
  }, [user]);

  /**
   * Formats an ISO date string into a human-readable format
   * @param {string} dateString - The ISO date string to format
   * @returns {string} Formatted date string in locale format
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  /**
   * Returns the appropriate color class based on transaction type
   * @param {string} type - The transaction type ('purchase' or 'consumption')
   * @returns {string} Tailwind CSS color class for the transaction
   */
  const getTransactionColor = (type: string) => {
    return type === 'purchase' ? 'text-green' : 'text-red';
  };

  /**
   * Returns the appropriate sign symbol based on transaction type
   * @param {string} type - The transaction type ('purchase' or 'consumption')
   * @returns {string} Plus or minus sign for display
   */
  const getTransactionSign = (type: string) => {
    return type === 'purchase' ? '+' : '-';
  };

  if (isLoading) {
    return (
      <Card className="bg-card border border-hedera-purple/10 shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl font-black hedera-gradient-text">
            Transaction History
          </CardTitle>
          <CardDescription className="text-secondary">
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
      <Card className="bg-card border border-hedera-purple/10 shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl font-black hedera-gradient-text">
            Transaction History
          </CardTitle>
          <CardDescription className="text-secondary">
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
    <Card className="bg-card border border-hedera-purple/10 shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-xl font-black hedera-gradient-text">
          Transaction History
        </CardTitle>
        <CardDescription className="text-secondary">
          Your recent credit transactions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-secondary">No transactions found</p>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 border border-primary rounded-lg hover:border-hedera-purple/30 transition-all duration-200 bg-tertiary"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${getTransactionColor(transaction.transactionType)}`}
                    >
                      {getTransactionSign(transaction.transactionType)}
                      {transaction.amount} credits
                    </span>
                    <span className="text-sm text-secondary">
                      Balance: {transaction.balanceAfter}
                    </span>
                  </div>
                  {transaction.description && (
                    <p className="text-sm text-secondary mt-1">
                      {transaction.description}
                    </p>
                  )}
                  {transaction.relatedOperation && (
                    <p className="text-xs text-secondary opacity-70 mt-1">
                      Operation: {transaction.relatedOperation}
                    </p>
                  )}
                </div>
                <div className="text-sm text-secondary">
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
