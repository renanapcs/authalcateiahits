-- Migration number: 0003 	 2025-01-20T00:02:00.000Z
-- Insert default subscription features for each plan
INSERT OR IGNORE INTO subscription_features (subscription_id, feature_type, feature_value) 
SELECT 
    s.id,
    'music_limit',
    CASE 
        WHEN s.plan_type = 'start' THEN 1
        WHEN s.plan_type = 'plus' THEN 2
        WHEN s.plan_type = 'premium' THEN 4
    END
FROM subscriptions s;

INSERT OR IGNORE INTO subscription_features (subscription_id, feature_type, feature_value) 
SELECT 
    s.id,
    'producer_sessions',
    CASE 
        WHEN s.plan_type = 'start' THEN 0
        WHEN s.plan_type = 'plus' THEN 1
        WHEN s.plan_type = 'premium' THEN 4
    END
FROM subscriptions s;

INSERT OR IGNORE INTO subscription_features (subscription_id, feature_type, feature_value) 
SELECT 
    s.id,
    'domain_registration',
    CASE 
        WHEN s.plan_type = 'start' THEN 0
        WHEN s.plan_type = 'plus' THEN 0
        WHEN s.plan_type = 'premium' THEN 1
    END
FROM subscriptions s;