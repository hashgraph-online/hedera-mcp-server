import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * API route handler for fetching authentication metrics from the MCP server
 * Requires authentication and returns parsed Prometheus metrics
 * @returns {Promise<NextResponse>} JSON response with authentication metrics or error
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const response = await fetch(`${process.env.MCP_SERVER_URL}/metrics`, {
      headers: {
        'Authorization': `Bearer ${session.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch metrics from MCP server');
    }

    const rawMetrics = await response.text();
    
    const metrics = parsePrometheusMetrics(rawMetrics);
    
    const authSuccessRate = calculateSuccessRate(metrics);
    const activeApiKeys = metrics.api_keys_active_total || 0;
    const recentFailures = metrics.auth_failures_total || 0;
    const anomaliesDetected = metrics.anomaly_detections_total || 0;
    const avgResponseTime = calculateAvgResponseTime(metrics);

    return NextResponse.json({
      authSuccessRate,
      activeApiKeys,
      recentFailures,
      anomaliesDetected,
      avgResponseTime
    });
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

/**
 * Parses raw Prometheus metrics text format into a key-value object
 * @param {string} rawMetrics - Raw Prometheus metrics in text format
 * @returns {Record<string, number>} Parsed metrics as key-value pairs
 */
function parsePrometheusMetrics(rawMetrics: string): Record<string, number> {
  const metrics: Record<string, number> = {};
  const lines = rawMetrics.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:{[^}]*})?\s+([0-9.]+(?:[eE][+-]?[0-9]+)?)/);
    if (match) {
      const [, name, value] = match;
      metrics[name] = parseFloat(value);
    }
  }
  
  return metrics;
}

/**
 * Calculates the authentication success rate from total success and failure counts
 * @param {Record<string, number>} metrics - Parsed metrics object
 * @returns {number} Success rate as a percentage (0-100)
 */
function calculateSuccessRate(metrics: Record<string, number>): number {
  const success = metrics.auth_success_total || 0;
  const failures = metrics.auth_failures_total || 0;
  const total = success + failures;
  
  if (total === 0) return 100;
  return (success / total) * 100;
}

/**
 * Calculates the average HTTP request response time from Prometheus metrics
 * @param {Record<string, number>} metrics - Parsed metrics object containing duration sums and counts
 * @returns {number} Average response time in milliseconds, defaults to 150ms if no data
 */
function calculateAvgResponseTime(metrics: Record<string, number>): number {
  return metrics.http_request_duration_seconds_sum 
    ? (metrics.http_request_duration_seconds_sum / metrics.http_request_duration_seconds_count) * 1000
    : 150;
}