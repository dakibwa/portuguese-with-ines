# Pages

What each page is for, in the order a student meets them, then Inês's. The screens are under Assets › Screens; the parts are the component cards.

## Home (`/`)

The reader's job: understand in one screen what the lessons are and book one. The blue hero says `Portuguese Lessons` and `One to one, at your pace. Online or in person.`, with coral Book a lesson and two ways in (How I teach, Lessons and prices). Three principles beside it (Just you, Slow is fine, Portuguese you’ll use) say how lessons feel. Book a lesson is in view above the fold at every size, a phone on its side included. Cards: HomeHero, PhoneHome.

## How I teach (`/approach/`)

How lessons go: no class, no rush, talking first. The biggest heading, the teaching list on a lilac rail, Meet Inês (native speaker from Porto, her degree, Portuguese and English), and one closing callout with Book a trial lesson. The only place that says she teaches European Portuguese. Card: HowITeach.

## Lessons and prices (`/lessons/`)

What the lessons cost and how long they are: three cards (Trial €20, 60 minutes €25, 90 minutes €35), each with one button, then one compact blue card (In Porto or online, how payment works, Book a lesson and Payment questions). Card: LessonsPage.

## FAQ (`/faq/`)

Questions before booking, in seven groups (Feeling nervous, In the lesson, Level and language, Online or in Porto, Booking, Payment, Changing a lesson). One group shows at a time; every group is readable without JavaScript. It closes with Ask me before you book. Card: FAQ.

## Booking (`/book/`)

One page for booking and for a student's own lessons. Its banner says `Book a Lesson` to a visitor and `Your Lessons` to a student.

1. **Choose:** the booking bar (Lesson, Where, Length with its price) over the calendar; a chosen day brings its times beside it. Cards: BookingPage, BookingBar, Segmented, SelectionBar.
2. **Sign in or create an account**, the chosen lessons kept on the left. Card: SignIn.
3. **Confirm:** one card with a note, the payment facts, the agreement and the action naming what it books. Cards: ConfirmBooking, PaymentFacts, Agreement.
4. **Booked:** the lessons, Join Google Meet and the way to Your lessons, with the lesson's mark landing in the corner. Card: BookingSuccess.

Signed in, the same page is **Your lessons**: the next lesson and the month with every lesson on it; a lesson opens to Change or Cancel; the account menu's places are Your lessons, Past lessons, Homework and Edit details. A student Inês invited arrives by a link to Welcome, adds an email if they have none, confirms card payments for the lessons she added, then sees their lessons. Cards: YourLessons, LessonDialog, PastLessons, YourDetails, Welcome, EmailPrompt, CardPrompt, BookingAlert, PhoneYourLessons, PhoneConfirm.

Terms & privacy is a dialog over any page (Terms).

## Expressions (`/idioms/`)

Uma expressão para ti: a student paints a sheet to reveal a Portuguese expression, then presses again for its meaning, with Inês's notes and other students' versions. Card: ExpressionPicker.

## Inês's schedule (`/schedule/`)

Her workspace, not a page of the site: one slim blue banner (76px, 64px on a phone) with her cream wordmark, which still leads home, a hairline and `Your schedule` in her hand, the availability splat cut off at the right; then the six tabs. No site header, nav or footer (9 Nov 2026, Dan: "does she even need the rest of the site anymore"). Cards: ScheduleTabs, NextLesson.

- **Students:** find, add, and her students in groups (Needs you, To do, Waiting on them, All set, Dormant), each card with three checks and one next button; a card opens to invite them on WhatsApp or to their profile. Cards: Students, StudentInvite, StudentProfile, PhoneStudentCard.
- **Timetable:** the week in hours, her weekly hours, a lesson opened to join, mark paid or no-show, move or cancel. Cards: Timetable, ScheduleLessonDialog, PhoneTimetable.
- **Receipts:** the month's payments and what needs a receipt. Card: Receipts.
- **Expressions:** her collection and the translations to check. Card: ScheduleExpressions.
- **Profile:** her own sign-in. Card: ScheduleProfile.

## The shell

Every public and booking page shares the header (SiteHeader; PhoneMenu from 820px down) and the footer (SiteFooter); Inês's schedule has only its slim banner. Pages turn into one another along the nav; the header never moves.
