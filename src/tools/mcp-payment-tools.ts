import { z } from 'zod';
import { PaymentTools } from './payment-tools';
import { Logger } from '@hashgraphonline/standards-sdk';
import { CreditManagerBase } from '../db/credit-manager-base';

const CreatePaymentSchema = z.object({
  payer_account_id: z.string().regex(/^0\.0\.\d+$/, 'Invalid Hedera account ID'),
  amount: z.number().min(1).max(10000),
  memo: z.string().optional()
});

const VerifyPaymentSchema = z.object({
  transaction_id: z.string()
});

const PaymentStatusSchema = z.object({
  transaction_id: z.string()
});

/**
 * Creates MCP tool definitions for payment operations
 * @param serverAccountId - The server's Hedera account ID
 * @param network - Hedera network (testnet or mainnet)
 * @param creditManager - Credit manager instance
 * @param logger - Logger instance
 * @returns Array of MCP tool definitions
 */
export function createPaymentTools(
  serverAccountId: string,
  network: 'testnet' | 'mainnet',
  creditManager: CreditManagerBase,
  logger: Logger
) {
  const paymentTools = new PaymentTools(
    serverAccountId,
    network,
    creditManager,
    logger
  );

  return [
    {
      name: 'create_payment_transaction',
      description: 'Creates an unsigned HBAR transfer transaction for purchasing credits',
      inputSchema: {
        type: 'object',
        properties: {
          payer_account_id: {
            type: 'string',
            description: 'The Hedera account ID of the payer (e.g., 0.0.123456)'
          },
          amount: {
            type: 'number',
            description: 'Amount of HBAR to pay (minimum 1, maximum 10000)'
          },
          memo: {
            type: 'string',
            description: 'Optional transaction memo'
          }
        },
        required: ['payer_account_id', 'amount']
      },
      handler: async (args: unknown) => {
        const params = CreatePaymentSchema.parse(args);
        
        const result = await paymentTools.createPaymentTransaction({
          payerAccountId: params.payer_account_id,
          amount: params.amount,
          ...(params.memo && { memo: params.memo })
        });

        return {
          transaction_bytes: result.transactionBytes,
          transaction_id: result.transactionId,
          amount_hbar: result.amount,
          expected_credits: result.expectedCredits,
          server_account_id: serverAccountId,
          instructions: 'Sign and submit this transaction to complete the payment'
        };
      }
    },
    {
      name: 'verify_payment',
      description: 'Verifies a payment transaction was successful and allocates credits',
      inputSchema: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'The transaction ID to verify (e.g., 0.0.123@1234567890.123456789)'
          }
        },
        required: ['transaction_id']
      },
      handler: async (args: unknown) => {
        const params = VerifyPaymentSchema.parse(args);
        
        const success = await paymentTools.verifyAndProcessPayment(params.transaction_id);
        
        if (success) {
          const status = await paymentTools.getPaymentStatus(params.transaction_id);
          return {
            success: true,
            status: status.status,
            credits_allocated: status.credits,
            timestamp: status.timestamp,
            message: 'Payment verified and credits allocated successfully'
          };
        } else {
          return {
            success: false,
            message: 'Payment verification failed or transaction not yet confirmed'
          };
        }
      }
    },
    {
      name: 'check_payment_status',
      description: 'Checks the status of a payment transaction',
      inputSchema: {
        type: 'object',
        properties: {
          transaction_id: {
            type: 'string',
            description: 'The transaction ID to check'
          }
        },
        required: ['transaction_id']
      },
      handler: async (args: unknown) => {
        const params = PaymentStatusSchema.parse(args);
        
        const status = await paymentTools.getPaymentStatus(params.transaction_id);
        
        return {
          transaction_id: params.transaction_id,
          status: status.status,
          credits_allocated: status.credits,
          timestamp: status.timestamp
        };
      }
    },
    {
      name: 'get_payment_history',
      description: 'Gets payment history for an account',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'The Hedera account ID to get payment history for'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of payments to return (default: 50)'
          }
        },
        required: ['account_id']
      },
      handler: async (args: any) => {
        const accountId = args.account_id;
        
        return {
          account_id: accountId,
          total_payments: 0,
          payments: []
        };
      }
    }
  ];
}