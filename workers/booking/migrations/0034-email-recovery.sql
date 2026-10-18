-- Apply this additive migration to staging, then production, before deploying
-- the Worker. Never replay schema.sql against an existing database.
ALTER TABLE email_log ADD COLUMN request_json TEXT;
ALTER TABLE email_log ADD COLUMN first_attempt_at TEXT;
ALTER TABLE email_log ADD COLUMN send_claim_id TEXT;
ALTER TABLE email_log ADD COLUMN send_claim_until TEXT;

-- Old attempts had neither a provider idempotency key nor a saved exact body.
-- Their delivery cannot safely be inferred or replayed. Reconcile manually.
UPDATE email_log SET status = 'unconfirmed', error = 'Legacy email delivery requires manual reconciliation.'
WHERE status IN ('pending', 'failed');
