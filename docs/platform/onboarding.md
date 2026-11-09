# Tutor onboarding

How a new tutor joins the tutor platform: from saying hello to a live site, then getting paid and inviting students. Written 9 November 2026, and agreed by Dan the same day. Chapeau is still the platform's working name, and `chapeau.school` stands in for whichever domain is bought.

- Published plan with sketches of the key screens: [Tutor Onboarding Plan](https://claude.ai/artifact/KyUBnDuD7RrKYe5sZvUdAE) (private to Dan's account).
- Source of that page: [onboarding-plan.html](./onboarding-plan.html). Republish it to the same link instead of making a new page.
- This is step 5 of the platform build. It depends on steps 1 to 4: the tutor record, choosing the tutor from the web address, the site drawn from the tutor record, and Stripe Connect.

## Decisions

Agreed by Dan on 9 November 2026:

- **Fully self-serve, with no calls.** "I don't want to have a call with anyone, it should be all end to end." No step needs Dan or a call, including later ones such as connecting a tutor's own domain.
- **The €25 a month starts after 30 days free from going live.** No card is needed to start. The dashboard asks for the card before day 30.
- **A new site goes live straight away.** A support agent reads each new site within an hour of it going live and writes to the tutor about anything worth fixing. It passes a site to Dan only if something looks wrong, such as a site that isn't about teaching.

## The target

From hello to a live site in about twenty minutes. Getting paid and inviting students take about twenty more, straight away or another day. These times are targets to test with the first tutors, not measurements.

## How it should feel

Every screen is checked against these six rules:

1. **Their site from the first answer.** The tutor's real site is drawn beside the questions from the start. Type Maria and the heading reads Spanish with Maria. There is no big reveal at the end.
2. **One question per screen.** Each screen asks one thing in plain words, with a good answer already filled in. Every screen works one-handed on a phone, and every answer saves as it's given.
3. **Nothing starts blank.** Pages are drafted from what the tutor pastes, prices from the rate they charge now, rules from common choices. The drafting never adds a qualification, a number of years or a review the tutor didn't give.
4. **Live before it's finished.** The site goes live once it has a name, a photo, a lesson and some hours. Stripe, students and a domain come after, from the dashboard. Until Stripe is connected, students book and pay the tutor directly.
5. **Terms in plain sentences.** Tutors set their rules by filling in the sentences their students will read ("book at least 24 hours ahead"). The site enforces exactly what the sentence says.
6. **Quiet, with three celebrations.** No confetti, percentage bars, sparkle icons or thinking animations. The hat tips three times: when the site goes live, at the first booking, and when the first card payment arrives.

## The steps

Steps 1 to 9 happen in one sitting, in order, and end with the site live. Steps 10 and 11 then wait on the dashboard and can be done in either order. Only step 10 branches.

### Part one: make it yours (about 18 minutes)

| Step | What it asks | Already filled in | How it should feel |
| --- | --- | --- | --- |
| 1. Say hello (1 min) | An email address, or Continue with Google. No password: a six-digit code arrives by email. | Their name, if they use Google. Google is asked for name and email only, as on Inês's site today. | A door that's already open. The screen after the code is already their site. |
| 2. What you teach (1 min) | What they teach, what students should call them, and where: online, a city, or both. | Their name, and a city guessed from their time zone. | Their own name lands in their site's heading in the first minute. |
| 3. Your photo (2 min) | One photo of themselves. | The crop fitted to the layout's frame and the light balanced. Faces are never retouched or generated. | Handing a photo to someone who frames it well. If it's dark, one kind line says so. |
| 4. Your story (5 min) | Paste anything they've written: a Preply or italki profile, a bio, a flyer. With nothing to paste, three short questions. | Home, About, Lessons and Questions pages drafted in their voice. Drafted lines stay highlighted until read or changed. | A friend who writes well tidied their notes. Tap a line to keep, rewrite or remove it. |
| 5. Your look (3 min) | Swipe through the ten layouts, then tap one of ten colour sets. | Every layout already shows their name, photo and words. Never placeholder text. | Trying on, not browsing other people's sites. Colours can change any time, free. |
| 6. Lessons and prices (2 min) | Check a trial, a lesson and a longer lesson. Change, add or remove. | 30, 60 and 90 minutes. Prices from their pasted rate, saying where it came from, or a middle price for their language. Currency from their country. | A price list on a blackboard: three lines, and done. |
| 7. Your week (2 min) | Shade their hours on a week grid, or tap weekday evenings, mornings or weekends. | Their time zone in words. A button connects Google Calendar for Meet links; it can wait. | Shading a paper diary with a pencil. |
| 8. Your rules (2 min) | One paragraph with blanks: how far ahead and how late students can book, the gap after each lesson, the late-change fee, what a missed lesson costs. | A common choice in every blank, with a note saying so. | Writing house rules on one card. The preview turns to their terms page. |

The drafting rule for step 4: facts come only from the tutor's own words. A missing detail becomes a gap, such as *years teaching*, to fill in or delete.

Why step 8 is safe: the terms page, booking screens and emails all read these numbers, and a change applies to new bookings only, because each booking keeps the terms its student agreed to.

### Part two: go live (about 2 minutes)

| Step | What it asks | Already filled in | How it should feel |
| --- | --- | --- | --- |
| 9. Your address, then live (2 min) | An address such as maria.chapeau.school, checked as they type. A read-through of at most five things worth a look, each fixed in place. Then Put my site live. | An address made from their name. Their own domain can come later, and the free address keeps working. | Opening the shop door. The hat tips, then the link, a QR code, Share on WhatsApp and Copy link. The screen also says 30 days free, no card needed yet. |

### Part three: on the dashboard, in any order (about 20 minutes)

| Step | What it asks | Already filled in | How it should feel |
| --- | --- | --- | --- |
| 10. Get paid (10 min) | One paragraph, then Stripe's own form inside the page in the platform's colours and type: ID and bank account, once. Then how students pay: card after the lesson, by hand, or both. | Name, email, country and site address passed to Stripe so it asks less. Card after the lesson picked to start with. | The bank part is handled by a bank. The money goes straight to them and never passes through us. |
| 11. Bring your students (10 min) | Paste a list as it comes, upload a spreadsheet, or add one person. Optionally a usual weekly time and a personal price for each. | Columns sorted from the paste, phone numbers in international form. A usual time sets up weekly lessons. | Sending a message they'd have sent anyway: the site's WhatsApp invite, one tap per student. |
| 12. The first booking (milestone) | Nothing. | The dashboard shows their week. The setup card lists what's left and goes away once done. | The second hat tip: "Chapeau! Ana booked her first lesson." The third comes with the first card payment. |

The branch at step 10: where Stripe doesn't serve the tutor's country, the card says their students pay them directly, and the site switches to paid by hand on the same plan. It reads as a choice, never as an error.

Marketplace students at step 11: Preply's rules forbid moving students off Preply through Preply's own messages. One line says so and suggests inviting only students the tutor already reaches by phone or email.

If a tutor stops partway, one email the next day says what's left, with a link back to the same screen. It's sent once.

## Left out of onboarding on purpose

Each has a default that works, so none of it stands between a tutor and a first booking.

- **Their own domain:** Settings, any time, self-serve. The free address keeps working and points to it.
- **An intro video:** their About page, from the dashboard.
- **More lesson types and places:** Lessons in Settings. Personal prices sit on each student.
- **Email and message wording:** Settings, starting from defaults that already use their name and terms.
- **Homework, expressions and the curriculum:** off until the tutor turns each on.
- **A different layout:** free to switch themselves, since their words and photos move with them.
- **Receipts and tax details:** asked for when the first card payment arrives.

## What it takes to build

- **The preview is the real site.** Onboarding writes a draft tutor record, and the preview renders the real layout from it, so what tutors see is exactly what goes live.
- **Layouts that fill themselves.** Each of the ten layouts must look right from any tutor's record (few words or many, one photo, two lessons or six). The look picker needs small live renders that are quick on a phone.
- **Drafting.** Claude drafts from pasted text only, in the tutor's voice and site language, and marks gaps. The read-through before going live uses the same check.
- **Payments.** Stripe Connect with Stripe's embedded onboarding form, themed with our colours, font and corner radius. Stripe recommends its newer Accounts v2 for a new platform. Stripe's hosted page is the fallback.
- **Google.** Sign-in asks for name and email only. Calendar uses the narrow permission the site already uses (`calendar.app.created`). Google reviews apps that ask for calendar access before the public can connect without a warning screen, so that review should start early.
- **Addresses.** A wildcard address and certificate for every tutor's free address on Cloudflare, plus a list of reserved and rude names. Tutors' own domains go through Cloudflare for SaaS and stay registered in the tutor's name.
- **Billing.** A €25 monthly subscription on Stripe Billing with a 30-day trial and no card.
- **Invites.** The WhatsApp invite Inês's site already has, run per tutor.
- **Support.** Agents answer tutors' questions and read every new site and every answer to the after-launch question. They pass a case to Dan only when money goes wrong or something looks off.

## How we'll know it works

- Hello to a live site: half of tutors in under 20 minutes.
- Live within a day of signing up: 7 in 10 tutors.
- The first booking: within 7 days of going live.

Each step logs how long it took, never what was typed. A day after going live, one optional question asks what was hard, and support agents read every answer.

## Picking this up in a new session

- **Status, 9 November 2026:** a plan only. Nothing in this document is built yet. Dan has agreed the whole plan and the three decisions at the top.
- **Where it fits:** step 5 of the build plan in [HANDOFF.md](./HANDOFF.md). Build it once steps 1 to 4 can render a draft tutor record that isn't live yet, and pick the tutor from the web address.
- **Still open, and not part of this plan:** the platform's name and domain (Chapeau and `chapeau.school` are proposals awaiting Dan's pick and a trademark search), and the ten real layouts. The layouts in the sketches are placeholders; the templates work defines the real ten.
- **What Dan asked for, in his words:** "a beautiful onboarding and simple onboarding process" for tutors, "all end to end", with no calls. Quality has to sit far above competing tutor tools, which he calls "AI slop", so keep the copy plain, keep the interface quiet, and keep the tutor's real site on screen.
- **Changing the plan:** edit this document first, then bring the sketch page in line and republish it to the same link from [onboarding-plan.html](./onboarding-plan.html).
