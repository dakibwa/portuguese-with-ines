-- Registering proves nothing about an address. An account now records when its
-- current address was proven to receive mail: any Google sign-in, a completed
-- password reset or a confirmed email change. A lesson Inês books for an
-- unproven address that has a password first clears that password and every
-- session, as a first Google link does, so the lesson cannot reach whoever
-- registered the address before its owner.
--
-- Additive. An account linked to Google has had its address verified by Google
-- (an email change unlinks it), so it is marked proven; every other existing
-- account starts unproven. Apply to both databases before deploying the Worker
-- that reads and writes it: `/health` reports `schema` until the column exists.
ALTER TABLE students ADD COLUMN email_verified_at TEXT;
UPDATE students SET email_verified_at = COALESCE(last_login_at, created_at)
  WHERE google_sub IS NOT NULL AND email_verified_at IS NULL;
