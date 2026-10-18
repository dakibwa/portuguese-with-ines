-- Apply before releasing the Worker. A removal must also retire a first card
-- setup still open at Stripe, for which card_consent_at is already NULL.
ALTER TABLE students ADD COLUMN card_setup_version INTEGER NOT NULL DEFAULT 0;
