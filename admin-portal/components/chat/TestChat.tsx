'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getMCPClient } from '@/lib/mcp-client';
import { useAuth } from '@/components/auth/AuthProvider';
import { Transaction } from '@hashgraph/sdk';
import { Buffer } from 'buffer';
import {
  Send,
  Bot,
  User,
  Loader2,
  Zap,
  AlertCircle,
  Copy,
  ExternalLink,
  CreditCard,
  Calendar,
  Play,
  CheckCircle,
  Search,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'success' | 'error';
  tool?: string;
  result?: unknown;
  transactionBytes?: string;
}

interface ExecutionResult {
  transactionId: string;
  [key: string]: unknown;
}

type TestChatProps = Record<string, never>;

type MCPTool =
  | 'execute_transaction'
  | 'generate_transaction_bytes'
  | 'schedule_transaction'
  | 'check_credit_balance'
  | 'get_pricing_configuration'
  | 'execute_query';

/**
 * Formats the response from MCP tools into a structured, readable format
 */
function formatResponse(result: any, toolName: string): string {
  if (result.error) {
    return `❌ **Error**\n\n${result.error}\n\n${result.message ? `**Details:** ${result.message}` : ''}`;
  }

  switch (toolName) {
    case 'generate_transaction_bytes':
      return formatTransactionBytesResponse(result);
    case 'execute_transaction':
      return formatExecuteTransactionResponse(result);
    case 'schedule_transaction':
      return formatScheduleTransactionResponse(result);
    case 'check_credit_balance':
      return formatCreditBalanceResponse(result);
    case 'get_pricing_configuration':
      return formatPricingResponse(result);
    case 'execute_query':
      return formatQueryResponse(result);
    default:
      return formatGenericResponse(result);
  }
}

function formatTransactionBytesResponse(result: any): string {
  if (result.transactionBytes || result.result?.transactionBytes) {
    const bytes = result.transactionBytes || result.result?.transactionBytes;
    const message =
      result.message ||
      result.result?.message ||
      'Transaction bytes generated successfully';
    const notes = result.result?.notes || [];

    let content = `📦 **Transaction Bytes Generated**\n\n`;
    content += `**Status:** ${result.status || 'completed'}\n\n`;

    if (message) {
      content += `**Description:**\n${message.replace(/```[\s\S]*?```/g, '').trim()}\n\n`;
    }

    if (notes.length > 0) {
      content += `**Configuration:**\n${notes.map((note: string) => `• ${note}`).join('\n')}\n\n`;
    }

    content += `**Transaction Bytes:**\n\`\`\`\n${bytes}\n\`\`\`\n\n`;
    content += `💡 **Next Steps:**\n`;
    content += `• Copy the transaction bytes above\n`;
    content += `• Sign them with your Hedera wallet\n`;
    content += `• Submit to the network when ready`;

    return content;
  }

  return formatGenericResponse(result);
}

function formatExecuteTransactionResponse(result: any): string {
  const txResult = result.result || result;

  if (txResult.transactionId || result.transactionId) {
    const txId = txResult.transactionId || result.transactionId;
    let content = `✅ **Transaction Executed Successfully**\n\n`;
    content += `**Transaction ID:** \`${txId}\`\n`;
    content += `**Status:** ${result.status || txResult.status || 'SUCCESS'}\n\n`;

    if (txResult.message || result.message) {
      content += `**Details:**\n${txResult.message || result.message}\n\n`;
    }

    content += `🔗 **View on HashScan:**\n`;
    content += `[${txId}](https://hashscan.io/testnet/transaction/${txId})`;

    return content;
  }

  return formatGenericResponse(result);
}

function formatScheduleTransactionResponse(result: any): string {
  const scheduleResult = result.result || result;

  if (scheduleResult.scheduleId || result.scheduleId) {
    const scheduleId = scheduleResult.scheduleId || result.scheduleId;
    let content = `⏰ **Transaction Scheduled**\n\n`;
    content += `**Schedule ID:** \`${scheduleId}\`\n`;
    content += `**Status:** ${result.status || scheduleResult.status || 'PENDING'}\n\n`;

    if (scheduleResult.message || result.message) {
      content += `**Details:**\n${scheduleResult.message || result.message}\n\n`;
    }

    content += `📋 **Next Steps:**\n`;
    content += `• The transaction is now scheduled\n`;
    content += `• Required signatures can be collected\n`;
    content += `• Transaction will execute once all signatures are obtained`;

    return content;
  }

  return formatGenericResponse(result);
}

function formatCreditBalanceResponse(result: any): string {
  const balance = result.balance || result;

  if (balance.current !== undefined || result.current !== undefined) {
    const current = balance.current ?? result.current ?? 0;
    const totalPurchased = balance.totalPurchased ?? result.totalPurchased ?? 0;
    const totalConsumed = balance.totalConsumed ?? result.totalConsumed ?? 0;

    let content = `💰 **Credit Balance**\n\n`;
    content += `**Current Balance:** ${current} credits\n`;
    content += `**Total Purchased:** ${totalPurchased} credits\n`;
    content += `**Total Consumed:** ${totalConsumed} credits\n\n`;

    if (current < 10) {
      content += `⚠️ **Low Balance Warning**\nConsider purchasing more credits to continue using premium operations.`;
    } else if (current > 1000) {
      content += `🎉 **Great! You have plenty of credits for operations.`;
    }

    return content;
  }

  return formatGenericResponse(result);
}

function formatPricingResponse(result: any): string {
  if (result.operations) {
    interface Operation {
      operationName: string;
      baseCost: number;
    }

    const operations: Operation[] = Array.isArray(result.operations)
      ? result.operations
      : Object.entries(result.operations).map(([name, cost]) => ({
          operationName: name,
          baseCost: cost as number,
        }));

    let content = `📊 **Operation Pricing**\n\n`;

    const categories = {
      free: operations.filter((op: Operation) => op.baseCost === 0),
      paid: operations.filter((op: Operation) => op.baseCost > 0),
    };

    if (categories.free.length > 0) {
      content += `**Free Operations:**\n`;
      categories.free.forEach((op: Operation) => {
        content += `• ${op.operationName}: Free\n`;
      });
      content += `\n`;
    }

    if (categories.paid.length > 0) {
      content += `**Paid Operations:**\n`;
      categories.paid
        .sort((a: Operation, b: Operation) => a.baseCost - b.baseCost)
        .forEach((op: Operation) => {
          content += `• ${op.operationName}: ${op.baseCost} credits\n`;
        });
      content += `\n`;
    }

    if (result.currentHbarToUsdRate) {
      content += `**Current HBAR Rate:** $${result.currentHbarToUsdRate.toFixed(4)} USD`;
    }

    return content;
  }

  return formatGenericResponse(result);
}

function formatQueryResponse(result: any): string {
  if (result.error) {
    return `❌ **Query Error**\n\n${result.error}`;
  }

  const queryResult = result.result || result;

  let content = `🔍 **Query Executed Successfully**\n\n`;

  if (queryResult.message || result.message) {
    content += `**Result:**\n${queryResult.message || result.message}\n\n`;
  }

  if (queryResult.data || queryResult.result) {
    const data = queryResult.data || queryResult.result;
    content += `**Data:**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n\n`;
  } else if (typeof queryResult === 'object' && !queryResult.message) {
    content += `**Data:**\n\`\`\`json\n${JSON.stringify(queryResult, null, 2)}\n\`\`\`\n\n`;
  }

  content += `💡 **Tips:**\n`;
  content += `• Queries are read-only and don't cost HBAR\n`;
  content += `• Results reflect the current state of the network\n`;
  content += `• Try queries like "check balance", "get token info", or "show my NFTs"`;

  return content;
}

function formatGenericResponse(result: any): string {
  return `✅ **Operation Completed**\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
}

/**
 * Component for executing transaction bytes with wallet integration
 */
function TransactionExecuteButton({
  transactionBytes,
  messageId,
  onExecutionResult,
}: {
  transactionBytes: string;
  messageId: string;
  onExecutionResult: (messageId: string, result: unknown) => void;
}) {
  const { sdk, isConnected } = useAuth();
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] =
    useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeTransaction = async () => {
    if (!sdk || !isConnected) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }

    setIsExecuting(true);
    setError(null);

    try {
      const transactionBuffer = Buffer.from(transactionBytes, 'base64');
      const transaction = Transaction.fromBytes(transactionBuffer);

      const result = await sdk.executeTransactionWithErrorHandling(
        transaction,
        false,
      );

      if (result.error) {
        throw new Error(result.error);
      }

      const receipt = result.result;
      const executionResponse = {
        transactionId: transaction?.transactionId?.toString() || 'Unknown',
        status: receipt?.status?.toString() || 'SUCCESS',
        timestamp: new Date().toISOString(),
        receipt: receipt,
      };

      setExecutionResult(executionResponse);
      onExecutionResult(messageId, executionResponse);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to execute transaction';
      setError(errorMsg);
      onExecutionResult(messageId, { error: errorMsg });
    } finally {
      setIsExecuting(false);
    }
  };

  if (executionResult) {
    return (
      <div className="mt-3 p-4 bg-gradient-to-r from-emerald-50 via-green-50 to-emerald-50 dark:from-green-900/10 dark:via-emerald-900/10 dark:to-green-900/10 border border-green-200 dark:border-green-800 rounded-xl shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-hedera-green" />
          <span className="text-sm font-bold text-green-700 dark:text-green-300">
            Transaction Executed Successfully
          </span>
        </div>
        <div className="mt-2 text-xs text-green-600 dark:text-green-400">
          Transaction ID: {executionResult.transactionId}
        </div>
        <a
          href={`https://hashscan.io/testnet/transaction/${executionResult.transactionId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          View on HashScan
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      <Button
        onClick={executeTransaction}
        disabled={isExecuting}
        size="sm"
        variant="default"
      >
        {isExecuting ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Executing...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4" />
            <span>Execute Transaction</span>
          </div>
        )}
      </Button>
      <Button
        onClick={() => navigator.clipboard.writeText(transactionBytes)}
        variant="outline"
        size="sm"
      >
        <Copy className="w-4 h-4" />
      </Button>
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}

/**
 * Simplified test chat interface for MCP server with natural language processing
 * @returns Interactive chat component with tool selection
 */
export function TestChat({}: TestChatProps) {
  const { apiKey } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'system',
      content:
        'Welcome to the **Hedera Test Lab** 🚀\n\nI\'m your AI assistant for interacting with the Hedera network using natural language.\n\n**Getting Started:**\n1. Select a tool from above\n2. Type your request naturally\n\n**Example Commands:**\n• 💸 "Send 5 HBAR to 0.0.1234"\n• 💰 "What\'s my HBAR balance?"\n• 🪙 "Create a token called MyToken"\n• 🎨 "Show me my NFTs"\n• 📊 "Get token info for 0.0.456789"\n• 💳 "Check my credit balance"\n\n**Pro tip:** Queries are free and instant! Transactions require credits.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [selectedTool, setSelectedTool] = useState<MCPTool>(
    'execute_transaction',
  );
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  /**
   * Handles execution results from transaction execute button
   */
  const handleExecutionResult = (messageId: string, result: any) => {
    setMessages(prev =>
      prev.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            result: {
              ...(typeof msg.result === 'object' && msg.result !== null
                ? msg.result
                : {}),
              executionResult: result,
            },
          };
        }
        return msg;
      }),
    );
  };

  const tools: {
    value: MCPTool;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }[] = [
    {
      value: 'execute_transaction',
      label: 'Execute Transaction',
      icon: Play,
      description: 'Execute any Hedera transaction immediately',
    },
    {
      value: 'generate_transaction_bytes',
      label: 'Generate Bytes',
      icon: CreditCard,
      description: 'Generate transaction bytes without execution',
    },
    {
      value: 'schedule_transaction',
      label: 'Schedule Transaction',
      icon: Calendar,
      description: 'Create a scheduled transaction',
    },
    {
      value: 'check_credit_balance',
      label: 'Check Balance',
      icon: CreditCard,
      description: 'Check your credit balance',
    },
    {
      value: 'get_pricing_configuration',
      label: 'Get Pricing',
      icon: CreditCard,
      description: 'Get pricing configuration',
    },
    {
      value: 'execute_query',
      label: 'Query Network',
      icon: Search,
      description: 'Query balances, tokens, NFTs, and more',
    },
  ];

  /**
   * Sends the user's input to the MCP server for processing
   * @returns {Promise<void>} Promise that resolves when the request completes
   */
  const handleSend = async () => {
    if (!input.trim() || isLoading || !apiKey) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
      status: 'success',
      tool: selectedTool,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const assistantMessage: Message = {
        id: Date.now().toString() + '-response',
        role: 'assistant',
        content: `Calling ${selectedTool}...`,
        timestamp: new Date(),
        status: 'sending',
      };
      setMessages(prev => [...prev, assistantMessage]);

      const mcpClient = getMCPClient();

      let params: Record<string, string> = {};

      if (
        selectedTool === 'execute_transaction' ||
        selectedTool === 'generate_transaction_bytes' ||
        selectedTool === 'schedule_transaction' ||
        selectedTool === 'execute_query'
      ) {
        params = { request: input.trim() };
      }

      const result = await mcpClient.callTool(selectedTool, params);

      let parsedResult = result;
      if (typeof result === 'string') {
        try {
          parsedResult = JSON.parse(result);
        } catch {
          parsedResult = result;
        }
      }

      const formattedContent = formatResponse(parsedResult, selectedTool);

      const transactionBytes =
        (parsedResult as any)?.transactionBytes ||
        (parsedResult as any)?.result?.transactionBytes;

      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessage.id
            ? {
                ...msg,
                content: formattedContent,
                status: (parsedResult as any)?.error ? 'error' : 'success',
                result: parsedResult,
                transactionBytes: transactionBytes,
              }
            : msg,
        ),
      );
    } catch (error) {
      const errorMessage: Message = {
        id: Date.now().toString() + '-error',
        role: 'assistant',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to execute command'}`,
        timestamp: new Date(),
        status: 'error',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles keyboard events in the textarea to send messages on Enter
   * @param {React.KeyboardEvent} e - The keyboard event
   * @returns {void}
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Copies the given text to the system clipboard
   * @param {string} text - The text to copy
   * @returns {void}
   */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Card className="flex flex-col h-[500px] sm:h-[600px] md:h-[700px] lg:h-[800px] max-h-[80vh] overflow-hidden">
      <CardHeader className="border-b">
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-hedera-purple rounded-xl flex-shrink-0 shadow-lg shadow-hedera-purple/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-gray-900 dark:text-white truncate text-lg">
                  Hedera Test Lab
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-medium">
                  Talk to your MCP Server with natural language
                </p>
              </div>
            </div>
            <Badge
              variant="connected"
              className="self-start sm:self-auto"
            >
              <div className="w-2 h-2 bg-hedera-green rounded-full mr-2 animate-pulse shadow-sm shadow-hedera-green" />
              CONNECTED
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {tools.map(tool => {
              const Icon = tool.icon;
              const isActive = selectedTool === tool.value;
              return (
                <button
                  key={tool.value}
                  onClick={() => setSelectedTool(tool.value)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 transform ${
                    isActive
                      ? 'bg-hedera-purple text-white shadow-lg scale-105'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{tool.label}</span>
                    <span className="sm:hidden">
                      {tool.label.split(' ')[0]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden p-4"
        ref={scrollAreaRef}
      >
        <div className="space-y-4 pb-4">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex gap-2 sm:gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              } animate-in fade-in-0 slide-in-from-bottom-2 duration-300`}
            >
              {message.role !== 'user' && (
                <Avatar size="md" hasRing>
                  <AvatarFallback
                    gradient={message.role === 'system' ? 'system' : 'assistant'}
                  >
                    {message.role === 'system' ? (
                      <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
                    ) : (
                      <Bot className="w-3 h-3 sm:w-4 sm:h-4" />
                    )}
                  </AvatarFallback>
                </Avatar>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[70%] ${
                  message.role === 'user'
                    ? 'bg-hedera-purple text-white shadow-lg'
                    : message.role === 'system'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-lg backdrop-blur-sm'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-lg'
                } rounded-2xl px-4 sm:px-5 py-3 sm:py-4 transition-all duration-200 hover:shadow-xl`}
              >
                {message.role === 'user' && message.tool && (
                  <div className="text-xs mb-1.5 font-semibold flex items-center gap-1 text-white/90">
                    <span className="text-lg">🛠️</span>{' '}
                    {message.tool.replace(/_/g, ' ').toUpperCase()}
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`text-xs sm:text-sm whitespace-pre-wrap break-words flex-1 overflow-hidden prose prose-sm max-w-none ${
                      message.role === 'user'
                        ? 'text-white prose-invert'
                        : 'text-inherit dark:prose-invert'
                    }`}
                  >
                    {message.content.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={i}>{part.slice(2, -2)}</strong>;
                      }
                      return part;
                    })}
                  </div>
                  {message.status === 'sending' && (
                    <Loader2
                      className={`w-3 h-3 sm:w-4 sm:h-4 animate-spin flex-shrink-0 ${
                        message.role === 'user' ? 'text-white' : ''
                      }`}
                    />
                  )}
                  {message.status === 'error' && (
                    <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-red-500 flex-shrink-0" />
                  )}
                  {message.status === 'success' &&
                  message.role !== 'user' &&
                  message.result ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="p-0.5 sm:p-1 h-auto rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        copyToClipboard(
                          JSON.stringify(message.result, null, 2),
                        );
                      }}
                      title="Copy result"
                    >
                      <Copy className="w-3 h-3 hover:scale-110 transition-transform" />
                    </Button>
                  ) : null}
                </div>
                <div
                  className={`text-xs mt-1 font-medium ${
                    message.role === 'user'
                      ? 'text-white/70'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString()}
                </div>

                {message.role === 'assistant' &&
                  message.transactionBytes &&
                  message.status === 'success' && (
                    <TransactionExecuteButton
                      transactionBytes={message.transactionBytes}
                      messageId={message.id}
                      onExecutionResult={handleExecutionResult}
                    />
                  )}
              </div>

              {message.role === 'user' && (
                <Avatar size="md" hasRing>
                  <AvatarFallback gradient="user">
                    <User className="w-3 h-3 sm:w-4 sm:h-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2 sm:gap-3 justify-start animate-fade-in">
              <Avatar size="md" hasRing>
                <AvatarFallback gradient="assistant">
                  <Bot className="w-3 h-3 sm:w-4 sm:h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-2xl px-4 sm:px-5 py-3 sm:py-4 shadow-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-hedera-purple" />
                  <span className="text-sm font-medium bg-gradient-to-r from-hedera-purple to-hedera-blue bg-clip-text text-transparent">
                    Processing {selectedTool.replace(/_/g, ' ')}...
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />

      <CardContent className="flex-shrink-0 p-4 sm:p-5 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={`Type your ${selectedTool.replace(/_/g, ' ')} request naturally...`}
            variant="chat"
            disabled={isLoading || !apiKey}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !input.trim() || !apiKey}
            variant="send"
            size="default"
            className="h-[50px] sm:h-[60px] px-4 sm:px-6"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
            ) : (
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </Button>
        </div>
        {!apiKey && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-2 font-medium flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Please connect your wallet to use the test interface
          </p>
        )}
      </CardContent>
    </Card>
  );
}
