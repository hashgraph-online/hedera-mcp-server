#!/bin/bash

# Database initialization script
# Creates initial schema and indexes for Hedera MCP Server

set -e

echo "🗄️  Initializing Hedera MCP Server database..."

# Create schema if it doesn't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    
    -- Create clients table
    CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id VARCHAR(255) UNIQUE NOT NULL,
        client_name VARCHAR(255),
        client_type VARCHAR(100) DEFAULT 'ai_assistant',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP,
        is_active BOOLEAN DEFAULT true
    );
    
    -- Create credit balances table
    CREATE TABLE IF NOT EXISTS credit_balances (
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        balance DECIMAL(20,8) NOT NULL DEFAULT 0,
        reserved_balance DECIMAL(20,8) NOT NULL DEFAULT 0,
        total_spent DECIMAL(20,8) NOT NULL DEFAULT 0,
        last_updated TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (client_id)
    );
    
    -- Create HBAR payments table
    CREATE TABLE IF NOT EXISTS hbar_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        transaction_id VARCHAR(255) UNIQUE NOT NULL,
        hbar_amount DECIMAL(20,8) NOT NULL,
        credits_allocated DECIMAL(20,8) NOT NULL,
        conversion_rate DECIMAL(20,8) NOT NULL,
        payment_memo TEXT,
        network_fee DECIMAL(20,8),
        processed_at TIMESTAMP DEFAULT NOW(),
        consensus_timestamp TIMESTAMP,
        payment_status VARCHAR(50) DEFAULT 'completed',
        hedera_account_id VARCHAR(50)
    );
    
    -- Create credit transactions table
    CREATE TABLE IF NOT EXISTS credit_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        tool_name VARCHAR(255) NOT NULL,
        operational_mode VARCHAR(50) NOT NULL,
        credits_deducted DECIMAL(20,8) NOT NULL,
        credits_refunded DECIMAL(20,8) DEFAULT 0,
        transaction_status VARCHAR(50) NOT NULL,
        execution_time_ms INTEGER,
        request_data JSONB,
        response_data JSONB,
        error_message TEXT,
        hedera_transaction_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
    );
    
    -- Create conversion rates table
    CREATE TABLE IF NOT EXISTS conversion_rates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hbar_per_credit DECIMAL(20,8) NOT NULL,
        credits_per_hbar DECIMAL(20,8) NOT NULL,
        effective_date TIMESTAMP NOT NULL,
        created_by VARCHAR(255) DEFAULT 'system',
        notes TEXT,
        is_active BOOLEAN DEFAULT true
    );
    
    -- Create tool usage statistics table
    CREATE TABLE IF NOT EXISTS tool_usage_stats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_name VARCHAR(255) NOT NULL,
        usage_date DATE NOT NULL,
        total_calls INTEGER DEFAULT 0,
        total_credits_used DECIMAL(20,8) DEFAULT 0,
        avg_execution_time_ms DECIMAL(10,2),
        success_rate DECIMAL(5,4),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tool_name, usage_date)
    );
    
    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_clients_client_id ON clients(client_id);
    CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active, last_seen);
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_client_created ON credit_transactions(client_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_tool ON credit_transactions(tool_name, created_at);
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_status ON credit_transactions(transaction_status);
    CREATE INDEX IF NOT EXISTS idx_hbar_payments_client ON hbar_payments(client_id, processed_at);
    CREATE INDEX IF NOT EXISTS idx_hbar_payments_consensus_time ON hbar_payments(consensus_timestamp);
    CREATE INDEX IF NOT EXISTS idx_hbar_payments_transaction_id ON hbar_payments(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_conversion_rates_effective ON conversion_rates(effective_date DESC, is_active);
    CREATE INDEX IF NOT EXISTS idx_tool_usage_stats_date ON tool_usage_stats(usage_date, tool_name);
    
    -- Insert default conversion rate if not exists
    INSERT INTO conversion_rates (hbar_per_credit, credits_per_hbar, effective_date, created_by, notes)
    VALUES (0.001, 1000, NOW(), 'system', 'Initial conversion rate: 1000 credits per HBAR')
    ON CONFLICT DO NOTHING;
    
    -- Create a function to update the updated_at timestamp
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS \$\$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    \$\$ language 'plpgsql';
    
    -- Create triggers for updated_at
    DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
    CREATE TRIGGER update_clients_updated_at 
        BEFORE UPDATE ON clients 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    DROP TRIGGER IF EXISTS update_credit_balances_updated_at ON credit_balances;
    CREATE TRIGGER update_credit_balances_updated_at 
        BEFORE UPDATE ON credit_balances 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    -- Create a view for client analytics
    CREATE OR REPLACE VIEW client_analytics AS
    SELECT 
        c.id,
        c.client_id,
        c.client_name,
        cb.balance,
        cb.total_spent,
        COUNT(ct.id) as total_transactions,
        COUNT(CASE WHEN ct.transaction_status = 'success' THEN 1 END) as successful_transactions,
        AVG(ct.execution_time_ms) as avg_execution_time,
        MAX(ct.created_at) as last_transaction,
        COUNT(hp.id) as total_payments,
        COALESCE(SUM(hp.hbar_amount), 0) as total_hbar_paid
    FROM clients c
    LEFT JOIN credit_balances cb ON c.id = cb.client_id
    LEFT JOIN credit_transactions ct ON c.id = ct.client_id
    LEFT JOIN hbar_payments hp ON c.id = hp.client_id
    GROUP BY c.id, c.client_id, c.client_name, cb.balance, cb.total_spent;
    
EOSQL

echo "✅ Database initialization completed successfully"
echo "📊 Created tables: clients, credit_balances, hbar_payments, credit_transactions, conversion_rates, tool_usage_stats"
echo "🔍 Created indexes for optimal query performance"
echo "📈 Created client_analytics view for reporting" 