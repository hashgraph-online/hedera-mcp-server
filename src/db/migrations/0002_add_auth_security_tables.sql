-- Add status column to api_keys if it doesn't exist
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Create indexes for api_keys
CREATE INDEX IF NOT EXISTS api_keys_account_id_idx ON api_keys(hedera_account_id);
CREATE INDEX IF NOT EXISTS api_keys_status_idx ON api_keys(status);

-- Create indexes for api_key_usage
CREATE INDEX IF NOT EXISTS api_key_usage_api_key_idx ON api_key_usage(api_key_id);
CREATE INDEX IF NOT EXISTS api_key_usage_created_at_idx ON api_key_usage(created_at);

-- Create anomaly_events table
CREATE TABLE IF NOT EXISTS anomaly_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id TEXT NOT NULL,
    hedera_account_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    details TEXT,
    detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved INTEGER DEFAULT 0,
    resolved_at TEXT,
    action_taken TEXT
);

CREATE INDEX IF NOT EXISTS anomaly_events_api_key_idx ON anomaly_events(api_key_id);
CREATE INDEX IF NOT EXISTS anomaly_events_account_idx ON anomaly_events(hedera_account_id);
CREATE INDEX IF NOT EXISTS anomaly_events_detected_at_idx ON anomaly_events(detected_at);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL,
    api_key_id TEXT,
    hedera_account_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    endpoint TEXT,
    method TEXT,
    status_code INTEGER,
    response_time_ms INTEGER,
    details TEXT,
    severity TEXT DEFAULT 'info',
    request_id TEXT
);

CREATE INDEX IF NOT EXISTS audit_logs_api_key_idx ON audit_logs(api_key_id);
CREATE INDEX IF NOT EXISTS audit_logs_account_idx ON audit_logs(hedera_account_id);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx ON audit_logs(event_type);

-- Create rate_limit_buckets table
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    bucket_key TEXT NOT NULL,
    window_start TEXT NOT NULL,
    request_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_identifier_idx ON rate_limit_buckets(identifier);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_bucket_key_idx ON rate_limit_buckets(bucket_key);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_expires_at_idx ON rate_limit_buckets(expires_at);

-- Create api_key_historical_stats table
CREATE TABLE IF NOT EXISTS api_key_historical_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id TEXT NOT NULL,
    hour INTEGER NOT NULL,
    avg_request_count REAL DEFAULT 0,
    avg_response_time REAL DEFAULT 0,
    error_rate REAL DEFAULT 0,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS api_key_historical_stats_api_key_idx ON api_key_historical_stats(api_key_id);
CREATE INDEX IF NOT EXISTS api_key_historical_stats_hour_idx ON api_key_historical_stats(hour);

-- Create session_cache table
CREATE TABLE IF NOT EXISTS session_cache (
    id TEXT PRIMARY KEY,
    api_key_id TEXT NOT NULL,
    hedera_account_id TEXT NOT NULL,
    session_data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS session_cache_api_key_idx ON session_cache(api_key_id);
CREATE INDEX IF NOT EXISTS session_cache_expires_at_idx ON session_cache(expires_at);