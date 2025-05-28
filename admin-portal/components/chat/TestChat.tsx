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

type TestChatProps = Record<string, never>;

type MCPTool =
  | 'execute_transaction'
  | 'generate_transaction_bytes'
  | 'schedule_transaction'
  | 'check_credit_balance'
  | 'get_pricing_configuration';

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
      content += `**Configuration:**\n${notes.map(note => `• ${note}`).join('\n')}\n\n`;
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
    const operations = Array.isArray(result.operations)
      ? result.operations
      : Object.entries(result.operations).map(([name, cost]) => ({
          operationName: name,
          baseCost: cost,
        }));

    let content = `📊 **Operation Pricing**\n\n`;

    const categories = {
      free: operations.filter(op => op.baseCost === 0),
      paid: operations.filter(op => op.baseCost > 0),
    };

    if (categories.free.length > 0) {
      content += `**Free Operations:**\n`;
      categories.free.forEach(op => {
        content += `• ${op.operationName}: Free\n`;
      });
      content += `\n`;
    }

    if (categories.paid.length > 0) {
      content += `**Paid Operations:**\n`;
      categories.paid
        .sort((a, b) => a.baseCost - b.baseCost)
        .forEach(op => {
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
  const [executionResult, setExecutionResult] = useState<unknown>(null);
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
      console.log('receipt', receipt, transaction);
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
      <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
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
        className="bg-gradient-to-r from-hedera-purple to-hedera-blue hover:from-hedera-purple/90 hover:to-hedera-blue/90 text-white"
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
        'Welcome to the Test Lab! 👋\n\nI can help you test Hedera operations. Just:\n1. Choose a tool from the buttons above\n2. Type what you want to do in plain English\n\nExamples:\n• "Send 5 HBAR to account 0.0.1234"\n• "Check how many credits I have"\n• "Create a token called MyToken"',
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
            result: { ...msg.result, executionResult: result },
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
      mcpClient.setApiKey(apiKey);

      console.log('MCP Client status before connect:', {
        connected: mcpClient.connected,
        apiKey: !!apiKey,
      });

      if (!mcpClient.connected) {
        console.log('Connecting MCP client...');
        await mcpClient.connect();
        console.log('MCP client connected:', mcpClient.connected);
      }

      let params: Record<string, string> = {};

      if (
        selectedTool === 'execute_transaction' ||
        selectedTool === 'generate_transaction_bytes' ||
        selectedTool === 'schedule_transaction'
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
        parsedResult.transactionBytes || parsedResult.result?.transactionBytes;

      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessage.id
            ? {
                ...msg,
                content: formattedContent,
                status: parsedResult.error ? 'error' : 'success',
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
    <Card className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border border-hedera-purple/10 shadow-xl flex flex-col h-[800px] max-h-[100vh]">
      <CardHeader className="flex-shrink-0 border-b border-hedera-purple/10 pb-4">
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-hedera-purple/20 to-hedera-blue/20 rounded-lg flex-shrink-0">
                <Bot className="w-5 h-5 text-hedera-purple" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-gray-900 dark:text-white truncate">
                  MCP Test Interface
                </h4>
                <p className="text-xs text-gray-500 truncate">
                  Natural language processing enabled
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-hedera-green/30 text-hedera-green self-start sm:self-auto"
            >
              <div className="w-2 h-2 bg-hedera-green rounded-full mr-1 animate-pulse" />
              LIVE
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
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-hedera-purple to-hedera-blue text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
              } animate-fade-in`}
            >
              {message.role !== 'user' && (
                <Avatar className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0">
                  <AvatarFallback
                    className={`${
                      message.role === 'system'
                        ? 'bg-gradient-to-br from-hedera-purple to-hedera-blue text-white'
                        : 'bg-gradient-to-br from-hedera-blue to-hedera-green text-white'
                    }`}
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
                    ? 'bg-gradient-to-br from-hedera-purple to-hedera-blue text-white'
                    : message.role === 'system'
                      ? 'bg-gray-100 dark:bg-gray-700'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                } rounded-2xl px-3 sm:px-4 py-2 sm:py-3 shadow-md`}
              >
                {message.role === 'user' && message.tool && (
                  <div className="text-xs opacity-80 mb-1">
                    Tool: {message.tool}
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs sm:text-sm whitespace-pre-wrap break-words flex-1 overflow-hidden">
                    {message.content}
                  </p>
                  {message.status === 'sending' && (
                    <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin flex-shrink-0" />
                  )}
                  {message.status === 'error' && (
                    <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-red-500 flex-shrink-0" />
                  )}
                  {message.status === 'success' &&
                    message.role === 'assistant' &&
                    message.result && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="p-0.5 sm:p-1 h-auto"
                        onClick={() =>
                          copyToClipboard(
                            JSON.stringify(message.result, null, 2),
                          )
                        }
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    )}
                </div>
                <div className="text-xs opacity-60 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </div>

                {/* Transaction execution button for generate_transaction_bytes */}
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
                <Avatar className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-gray-400 to-gray-600 text-white">
                    <User className="w-3 h-3 sm:w-4 sm:h-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2 sm:gap-3 justify-start animate-fade-in">
              <Avatar className="w-6 h-6 sm:w-8 sm:h-8">
                <AvatarFallback className="bg-gradient-to-br from-hedera-blue to-hedera-green text-white">
                  <Bot className="w-3 h-3 sm:w-4 sm:h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-3 sm:px-4 py-2 sm:py-3 shadow-md">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">
                    Processing with {selectedTool}...
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator className="bg-hedera-purple/10" />

      <CardContent className="flex-shrink-0 p-3 sm:p-4">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={`Type your ${selectedTool.replace(/_/g, ' ')} request naturally...`}
            className="min-h-[50px] sm:min-h-[60px] max-h-[100px] sm:max-h-[120px] resize-none border-hedera-purple/20 focus:border-hedera-purple/40 text-xs sm:text-sm"
            disabled={isLoading || !apiKey}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !input.trim() || !apiKey}
            className="bg-gradient-to-r from-hedera-purple to-hedera-blue hover:from-hedera-purple/90 hover:to-hedera-blue/90 text-white px-3 sm:px-6"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
            ) : (
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </Button>
        </div>
        {!apiKey && (
          <p className="text-xs text-red-500 mt-2">
            Please connect your wallet to use the test interface
          </p>
        )}
      </CardContent>
    </Card>
  );
}
