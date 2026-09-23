-- Students who already have a confirmed lesson have been using their account
-- for real, so they start proven: the first lesson Inês books for one of them
-- must not sign them out and clear their password. Accounts with no confirmed
-- lesson stay unproven, because that is where an address registered ahead of
-- its owner would be waiting. Data only; apply after 0020.
UPDATE students SET email_verified_at = COALESCE(last_login_at, created_at)
  WHERE email_verified_at IS NULL
    AND role = 'student'
    AND password_hash != ''
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.student_id = students.id AND bookings.status = 'confirmed'
    );
