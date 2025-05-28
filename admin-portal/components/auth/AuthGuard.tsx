'use client';

import { useAuth } from './AuthProvider';
import { LoginForm } from './LoginForm';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingComponent?: React.ReactNode;
}

/**
 * Authentication guard component that protects routes requiring authentication
 * Shows login form if user is not authenticated, otherwise renders children
 */
export function AuthGuard({ 
  children, 
  fallback,
  loadingComponent 
}: AuthGuardProps) {
  const { isConnected, isLoading } = useAuth();

  if (isLoading) {
    return loadingComponent || (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isConnected) {
    return fallback || <LoginForm />;
  }

  return <>{children}</>;
}