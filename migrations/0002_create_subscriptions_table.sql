-- Migration number: 0002 	 2024-12-27T22:30:00.000Z
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('start', 'plus', 'premium')),
    status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired', 'pending')) DEFAULT 'pending',
    mercadopago_subscription_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscription_features (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    subscription_id TEXT NOT NULL,
    feature_type TEXT NOT NULL CHECK (feature_type IN ('music_limit', 'producer_sessions', 'domain_registration', 'consultation_hours')),
    feature_value INTEGER NOT NULL DEFAULT 0,
    used_value INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS producer_sessions (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    subscription_id TEXT NOT NULL,
    producer_name TEXT NOT NULL,
    session_date TIMESTAMP NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled')) DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_access (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('ebook', 'course', 'masterclass', 'template')),
    content_id TEXT NOT NULL,
    accessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Insert default subscription features for each plan
INSERT INTO subscription_features (subscription_id, feature_type, feature_value) 
SELECT 
    s.id,
    'music_limit',
    CASE 
        WHEN s.plan_type = 'start' THEN 1
        WHEN s.plan_type = 'plus' THEN 2
        WHEN s.plan_type = 'premium' THEN 4
    END
FROM subscriptions s;

INSERT INTO subscription_features (subscription_id, feature_type, feature_value) 
SELECT 
    s.id,
    'producer_sessions',
    CASE 
        WHEN s.plan_type = 'start' THEN 0
        WHEN s.plan_type = 'plus' THEN 1
        WHEN s.plan_type = 'premium' THEN 4
    END
FROM subscriptions s;

INSERT INTO subscription_features (subscription_id, feature_type, feature_value) 
SELECT 
    s.id,
    'domain_registration',
    CASE 
        WHEN s.plan_type = 'start' THEN 0
        WHEN s.plan_type = 'plus' THEN 0
        WHEN s.plan_type = 'premium' THEN 1
    END
FROM subscriptions s;