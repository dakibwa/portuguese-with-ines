# PaymentFacts

What payment means, as four short facts, each led by a dab of paint.

**Markup:** `<ul class="booking-payment-facts" id="booking-payment-summary"><li>No payment is taken now</li><li>Your card is charged at the end of each lesson</li><li><strong class="is-free">Free to change or cancel</strong> a lesson up to 14&nbsp;hours before</li><li><strong>€5</strong> to move or cancel later, or if you don’t show up</li></ul>`

- Each bullet is the FAQ dab (`--payment-dab`) as a mask, in turn `blue-deep`, `lavender`, `coral` and `lavender-ink`; text `ink`.
- The words are the same wherever a student meets them: the free part first, its first four words bold in `ink` (coral is for a charge), then the €5 in `coral-action`.
- When lessons are charged follows the charge window: `after each lesson` while the charge runs an hour after the end, `at the end of each lesson` once that window is nothing. With no fee: `No fee to change or cancel, or for a missed lesson`.
- The full rules stay behind the Terms & privacy link; never a paragraph here.
