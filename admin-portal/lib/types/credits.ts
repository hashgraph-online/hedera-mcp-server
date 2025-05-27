export interface CreditBalance {
  accountId: string;
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
  updatedAt: string;
}

export interface CreditTransaction {
  accountId: string;
  transactionType: 'purchase' | 'consumption' | 'refund' | 'admin_adjustment';
  amount: number;
  balanceAfter: number;
  description?: string;
  relatedOperation?: string;
  hbarPaymentId?: number;
  createdAt: string;
}

export interface HbarPayment {
  transactionId: string;
  payerAccountId: string;
  targetAccountId?: string;
  hbarAmount: number;
  creditsAllocated: number;
  memo?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  timestamp?: string;
}