'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Activity, Key, Shield, AlertTriangle } from 'lucide-react';

interface MetricsData {
  authSuccessRate: number;
  activeApiKeys: number;
  recentFailures: number;
  anomaliesDetected: number;
  avgResponseTime: number;
}

interface AuthMetricsProps {
  refreshInterval?: number;
}

/**
 * Displays real-time authentication metrics
 */
export function AuthMetrics({ refreshInterval = 30000 }: AuthMetricsProps) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('/api/auth/metrics');
        if (!response.ok) throw new Error('Failed to fetch metrics');
        
        const data = await response.json();
        setMetrics(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-0 pb-2">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!metrics) return null;

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 90) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getSuccessRateColor(metrics.authSuccessRate)}`}>
              {metrics.authSuccessRate.toFixed(1)}%
            </div>
            <Progress value={metrics.authSuccessRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active API Keys</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeApiKeys}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Failures</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.recentFailures}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Last 5 minutes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Alerts</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.anomaliesDetected > 0 ? 'text-red-600' : ''}`}>
              {metrics.anomaliesDetected}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Anomalies detected
            </p>
          </CardContent>
        </Card>
      </div>

      {metrics.avgResponseTime > 1000 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Response times are elevated ({metrics.avgResponseTime}ms average).
            This may impact user experience.
          </AlertDescription>
        </Alert>
      )}

      {metrics.anomaliesDetected > 0 && (
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Security anomalies detected. Check the audit logs for suspicious activity.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}