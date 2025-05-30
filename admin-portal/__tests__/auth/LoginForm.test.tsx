import { describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from '../../components/auth/LoginForm';
import { useAuth } from '../../hooks/useAuth';
import { McpAuthClient } from '../../lib/auth/mcp-auth-client';

jest.mock('../../hooks/useAuth');
jest.mock('../../lib/auth/mcp-auth-client');
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn()
  })
}));

describe('LoginForm', () => {
  let mockUseAuth: any;
  let mockMcpAuthClient: any;

  beforeEach(() => {
    mockUseAuth = {
      login: jest.fn(),
      isLoading: false,
      error: null
    };
    
    mockMcpAuthClient = {
      generateChallenge: jest.fn(),
      signChallenge: jest.fn(),
      verifySignature: jest.fn()
    };

    (useAuth as any).mockReturnValue(mockUseAuth);
    (McpAuthClient as any).mockImplementation(() => mockMcpAuthClient);
  });

  it('should render login form', () => {
    render(<LoginForm />);
    
    expect(screen.getByText('Sign in to Hedera AI Studio')).toBeInTheDocument();
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
  });

  it('should handle successful login flow', async () => {
    const mockAccountId = '0.0.12345';
    const mockChallenge = 'test-challenge';
    const mockSignature = 'test-signature';

    mockMcpAuthClient.generateChallenge.mockResolvedValue({
      challenge: mockChallenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
    
    mockMcpAuthClient.signChallenge.mockResolvedValue({
      signature: mockSignature,
      accountId: mockAccountId
    });
    
    mockMcpAuthClient.verifySignature.mockResolvedValue({
      apiKey: 'hma_test123',
      accountId: mockAccountId
    });
    
    mockUseAuth.login.mockResolvedValue({ success: true });

    render(<LoginForm />);
    
    const connectButton = screen.getByText('Connect Wallet');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mockMcpAuthClient.generateChallenge).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockMcpAuthClient.signChallenge).toHaveBeenCalledWith(mockChallenge);
    });

    await waitFor(() => {
      expect(mockMcpAuthClient.verifySignature).toHaveBeenCalledWith(
        mockAccountId,
        mockSignature,
        mockChallenge
      );
    });

    await waitFor(() => {
      expect(mockUseAuth.login).toHaveBeenCalledWith({
        accountId: mockAccountId,
        apiKey: 'hma_test123'
      });
    });
  });

  it('should show loading state', async () => {
    mockMcpAuthClient.generateChallenge.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 1000))
    );

    render(<LoginForm />);
    
    const connectButton = screen.getByText('Connect Wallet');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });
  });

  it('should handle wallet connection errors', async () => {
    mockMcpAuthClient.generateChallenge.mockRejectedValue(
      new Error('Wallet not connected')
    );

    render(<LoginForm />);
    
    const connectButton = screen.getByText('Connect Wallet');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/wallet not connected/i)).toBeInTheDocument();
    });
  });

  it('should handle challenge expiry', async () => {
    mockMcpAuthClient.generateChallenge.mockResolvedValue({
      challenge: 'test-challenge',
      expiresAt: new Date(Date.now() - 1000).toISOString()
    });

    render(<LoginForm />);
    
    const connectButton = screen.getByText('Connect Wallet');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/challenge expired/i)).toBeInTheDocument();
    });
  });

  it('should handle signature verification failure', async () => {
    mockMcpAuthClient.generateChallenge.mockResolvedValue({
      challenge: 'test-challenge',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
    
    mockMcpAuthClient.signChallenge.mockResolvedValue({
      signature: 'test-signature',
      accountId: '0.0.12345'
    });
    
    mockMcpAuthClient.verifySignature.mockRejectedValue(
      new Error('Invalid signature')
    );

    render(<LoginForm />);
    
    const connectButton = screen.getByText('Connect Wallet');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid signature/i)).toBeInTheDocument();
    });
  });

  it('should show auth provider error', () => {
    mockUseAuth.error = 'Authentication failed';
    
    render(<LoginForm />);
    
    expect(screen.getByText('Authentication failed')).toBeInTheDocument();
  });

  it('should disable button while loading', () => {
    mockUseAuth.isLoading = true;
    
    render(<LoginForm />);
    
    const connectButton = screen.getByRole('button');
    expect(connectButton).toBeDisabled();
  });
});