-- Add status column to api_keys if it doesn't exist
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

-- Create indexes for api_keys
CREATE INDEX IF NOT EXISTS pg_api_keys_account_id_idx ON api_keys(hedera_account_id);
CREATE INDEX IF NOT EXISTS pg_api_keys_status_idx ON api_keys(status);

-- Create indexes for api_key_usage
CREATE INDEX IF NOT EXISTS api_key_usage_api_key_idx ON api_key_usage(api_key_id);
CREATE INDEX IF NOT EXISTS api_key_usage_created_at_idx ON api_key_usage(created_at);

-- Create anomaly_events table
CREATE TABLE IF NOT EXISTS anomaly_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_key_id UUID NOT NULL,
    hedera_account_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    details JSONB,
    detected_at TIMESTAMP DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    action_taken VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS anomaly_events_api_key_idx ON anomaly_events(api_key_id);
CREATE INDEX IF NOT EXISTS anomaly_events_account_idx ON anomaly_events(hedera_account_id);
CREATE INDEX IF NOT EXISTS anomaly_events_detected_at_idx ON anomaly_events(detected_at);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    event_type VARCHAR(100) NOT NULL,
    api_key_id UUID,
    hedera_account_id VARCHAR(255),
    ip_address VARCHAR(255),
    user_agent VARCHAR(1000),
    endpoint VARCHAR(255),
    method VARCHAR(50),
    status_code DECIMAL(3, 0),
    response_time_ms DECIMAL(10, 0),
    details JSONB,
    severity VARCHAR(50) DEFAULT 'info',
    request_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS audit_logs_api_key_idx ON audit_logs(api_key_id);
CREATE INDEX IF NOT EXISTS audit_logs_account_idx ON audit_logs(hedera_account_id);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx ON audit_logs(event_type);

-- Create rate_limit_buckets table
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    bucket_key VARCHAR(255) NOT NULL,
    window_start TIMESTAMP NOT NULL,
    request_count DECIMAL(10, 0) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_identifier_idx ON rate_limit_buckets(identifier);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_bucket_key_idx ON rate_limit_buckets(bucket_key);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_expires_at_idx ON rate_limit_buckets(expires_at);

-- Create api_key_historical_stats table
CREATE TABLE IF NOT EXISTS api_key_historical_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_key_id UUID NOT NULL,
    hour DECIMAL(2, 0) NOT NULL,
    avg_request_count DECIMAL(10, 2) DEFAULT 0,
    avg_response_time DECIMAL(10, 2) DEFAULT 0,
    error_rate DECIMAL(5, 4) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_key_historical_stats_api_key_idx ON api_key_historical_stats(api_key_id);
CREATE INDEX IF NOT EXISTS api_key_historical_stats_hour_idx ON api_key_historical_stats(hour);

-- Create session_cache table
CREATE TABLE IF NOT EXISTS session_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_key_id UUID NOT NULL,
    hedera_account_id VARCHAR(255) NOT NULL,
    session_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS pg_session_cache_api_key_idx ON session_cache(api_key_id);
CREATE INDEX IF NOT EXISTS pg_session_cache_expires_at_idx ON session_cache(expires_at);