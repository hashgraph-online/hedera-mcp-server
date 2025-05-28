import { describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiKeyManager } from '../../components/auth/ApiKeyManager';

jest.mock('../../hooks/useApiKeys');

Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
  },
});

/**
 * Test suite for the ApiKeyManager component
 * Tests API key management functionality including generation, display, copying, and revocation
 */
describe('ApiKeyManager', () => {
  let mockUseApiKeys: any;

  beforeEach(() => {
    mockUseApiKeys = {
      keys: [],
      isLoading: false,
      error: null,
      generateKey: jest.fn(),
      revokeKey: jest.fn(),
      refreshKeys: jest.fn(),
    };

    (useApiKeys as any).mockReturnValue(mockUseApiKeys);
    (navigator.clipboard.writeText as any).mockResolvedValue(undefined);
  });

  it('should render empty state', () => {
    render(<ApiKeyManager />);

    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    expect(screen.getByText('Generate Key')).toBeInTheDocument();
  });

  it('should render API keys list', () => {
    mockUseApiKeys.keys = [
      {
        id: 'key-1',
        name: 'Production Key',
        key: 'hma_prod123',
        permissions: ['read', 'write'],
        status: 'active',
        createdAt: new Date('2024-01-01').toISOString(),
        lastUsedAt: new Date('2024-01-15').toISOString(),
      },
      {
        id: 'key-2',
        name: 'Development Key',
        key: 'hma_dev456',
        permissions: ['read'],
        status: 'active',
        createdAt: new Date('2024-01-05').toISOString(),
        lastUsedAt: null,
      },
    ];

    render(<ApiKeyManager />);

    expect(screen.getByText('Production Key')).toBeInTheDocument();
    expect(screen.getByText('Development Key')).toBeInTheDocument();
    expect(screen.getByText('read, write')).toBeInTheDocument();
    expect(screen.getByText('read')).toBeInTheDocument();
    expect(screen.getByText('Last used:')).toBeInTheDocument();
    expect(screen.getByText('Never used')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    mockUseApiKeys.isLoading = true;

    render(<ApiKeyManager />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should show error state', () => {
    mockUseApiKeys.error = 'Failed to load API keys';

    render(<ApiKeyManager />);

    expect(screen.getByText('Failed to load API keys')).toBeInTheDocument();
  });

  it('should handle key generation', async () => {
    const newKey = {
      id: 'key-3',
      name: 'New Key',
      key: 'hma_new789',
      permissions: ['read'],
      status: 'active',
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };

    mockUseApiKeys.generateKey.mockResolvedValue(newKey);

    render(<ApiKeyManager />);

    const generateButton = screen.getByText('Generate Key');
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(mockUseApiKeys.generateKey).toHaveBeenCalled();
    });
  });

  it('should show new key modal after generation', async () => {
    const newKey = {
      id: 'key-3',
      name: 'New Key',
      key: 'hma_new789_full_key_shown_once',
      permissions: ['read'],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    mockUseApiKeys.generateKey.mockResolvedValue(newKey);

    render(<ApiKeyManager />);

    const generateButton = screen.getByText('Generate Key');
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText('New API Key Generated')).toBeInTheDocument();
      expect(
        screen.getByText(/hma_new789_full_key_shown_once/),
      ).toBeInTheDocument();
      expect(screen.getByText(/this is the only time/i)).toBeInTheDocument();
    });
  });

  it('should copy key to clipboard', async () => {
    const key = 'hma_test123';
    mockUseApiKeys.keys = [
      {
        id: 'key-1',
        name: 'Test Key',
        key: key,
        permissions: ['read'],
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    ];

    render(<ApiKeyManager />);

    const copyButton = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(key);
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('should handle key revocation', async () => {
    const keyId = 'key-1';
    mockUseApiKeys.keys = [
      {
        id: keyId,
        name: 'Test Key',
        key: 'hma_test123',
        permissions: ['read'],
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    ];

    render(<ApiKeyManager />);

    const revokeButton = screen.getByRole('button', { name: /revoke/i });
    fireEvent.click(revokeButton);

    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /yes.*revoke/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockUseApiKeys.revokeKey).toHaveBeenCalledWith(keyId);
    });
  });

  it('should show revoked keys with different styling', () => {
    mockUseApiKeys.keys = [
      {
        id: 'key-1',
        name: 'Revoked Key',
        key: 'hma_revoked123',
        permissions: ['read'],
        status: 'revoked',
        createdAt: new Date().toISOString(),
      },
    ];

    render(<ApiKeyManager />);

    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /revoke/i }),
    ).not.toBeInTheDocument();
  });

  it('should show key age warning for old keys', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    mockUseApiKeys.keys = [
      {
        id: 'key-1',
        name: 'Old Key',
        key: 'hma_old123',
        permissions: ['read'],
        status: 'active',
        createdAt: oldDate.toISOString(),
      },
    ];

    render(<ApiKeyManager />);

    expect(screen.getByText(/consider rotating this key/i)).toBeInTheDocument();
  });

  it('should refresh keys list', async () => {
    render(<ApiKeyManager />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockUseApiKeys.refreshKeys).toHaveBeenCalled();
    });
  });
});
