-- Credits System Migration
-- Tracks HBAR payments and credit allocations

CREATE TABLE IF NOT EXISTS user_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blocked'))
);

CREATE TABLE IF NOT EXISTS credit_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT UNIQUE NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    total_purchased INTEGER NOT NULL DEFAULT 0,
    total_consumed INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES user_accounts(account_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hbar_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    payer_account_id TEXT NOT NULL,
    target_account_id TEXT,
    hbar_amount REAL NOT NULL,
    credits_allocated INTEGER NOT NULL,
    memo TEXT,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    FOREIGN KEY (payer_account_id) REFERENCES user_accounts(account_id)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'consumption', 'refund', 'admin_adjustment')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    related_operation TEXT,
    hbar_payment_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES user_accounts(account_id),
    FOREIGN KEY (hbar_payment_id) REFERENCES hbar_payments(id)
);

CREATE TABLE IF NOT EXISTS operation_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_name TEXT UNIQUE NOT NULL,
    base_cost INTEGER NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default operation costs
INSERT OR IGNORE INTO operation_costs (operation_name, base_cost, description) VALUES
('generate_transaction_bytes', 5, 'Generate transaction bytes without execution'),
('schedule_transaction', 10, 'Create scheduled transaction'),
('execute_transaction', 15, 'Execute transaction directly'),
('health_check', 0, 'Free health check'),
('get_server_info', 0, 'Free server information'),
('refresh_profile', 2, 'Refresh HCS-11 profile');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_credit_balances_account_id ON credit_balances(account_id);
CREATE INDEX IF NOT EXISTS idx_hbar_payments_transaction_id ON hbar_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_hbar_payments_payer ON hbar_payments(payer_account_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account_id ON credit_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_user_accounts_account_id ON user_accounts(account_id);

-- Create triggers for automatic balance updates
CREATE TRIGGER IF NOT EXISTS update_credit_balance_after_transaction
    AFTER INSERT ON credit_transactions
    FOR EACH ROW
    BEGIN
        INSERT OR REPLACE INTO credit_balances (account_id, balance, total_purchased, total_consumed, updated_at)
        VALUES (
            NEW.account_id,
            NEW.balance_after,
            COALESCE((SELECT total_purchased FROM credit_balances WHERE account_id = NEW.account_id), 0) +
                CASE WHEN NEW.transaction_type = 'purchase' THEN NEW.amount ELSE 0 END,
            COALESCE((SELECT total_consumed FROM credit_balances WHERE account_id = NEW.account_id), 0) +
                CASE WHEN NEW.transaction_type = 'consumption' THEN NEW.amount ELSE 0 END,
            CURRENT_TIMESTAMP
        );
    END;

-- Create trigger for user account activity tracking
CREATE TRIGGER IF NOT EXISTS update_user_last_activity
    AFTER INSERT ON credit_transactions
    FOR EACH ROW
    BEGIN
        UPDATE user_accounts 
        SET last_activity = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE account_id = NEW.account_id;
    END; 