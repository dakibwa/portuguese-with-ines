-- Additive: the splat a student chooses to wear beside their name in their
-- account. Existing accounts start with none (their initial shows); no other
-- state changes. Apply to both databases before deploying the Worker that
-- reads it: until then the Worker leaves it out and the site offers no choice.
ALTER TABLE students ADD COLUMN mark TEXT NOT NULL DEFAULT '';
