# Components

Each piece in one line: what it is, then the first line of what you write. Written by `check.mjs --index` from the cards; never edit it by hand.

## Booking

- **Agreement** Agree to terms & privacy: one raised control that turns blue once pressed, with the terms link kept as its own action.
- **BookingBar** The lesson's three choices in one bar: Lesson (Trial, Single, Weekly), Where (Online, In Porto) and Length with its price.
- **BookingPage** Book a Lesson: the site header becomes a blue bar that names the page, and the booking card beneath it opens on the lesson's choices and the calendar. `<BookingFlow />`
- **BookingSuccess** You're booked in: the lessons, where the confirmation went, Join Google Meet, the way to Your lessons, and the reference.
- **ConfirmBooking** The last step: the choices and chosen lessons on the left, and one card on the right that confirms them.
- **PaymentFacts** What payment means, as four short facts, each led by a dab of paint. `<FeeFacts feeCents={lateFeeCents} noticeHours={noticeHours} noShow={postpay || !lateFeeCents} />`
- **SelectionBar** A chosen time waiting to be confirmed: its lesson's mark, the date and time in full, and the clock it is on.
- **SignIn** Almost there: the chosen lesson stays on the left while the card on the right creates an account or signs in. `<AuthPanel heading="Your account" headingLevel={2} initialError={signInLinkError} initialMode={signInLinkError ? "link" : "signin"} onSignedIn={enterLessons} />`
- **Welcome** What a sign-in link opens: the splat, a handwritten Welcome, one line and one coral button.

## Controls

- **BookingAlert** A problem said plainly in one coral panel, with the ways on beside it. `<div className="booking-alert booking-alert--error" role="alert">`
- **Button** Every call to action: coral to book or commit, blue for Inês's main action, soft lilac for a quiet constructive one, outlined for the way out. `<Link className="button button--coral" href="/book/?lesson=trial">Book a trial lesson</Link>`
- **Segmented** A choice of two or three options on one raised track, the blue thumb sliding to the one chosen; shown here as the time picker's part of the day over its times. `<div className={'segmented${everyWeek ? " segmented--second" : ""}'}>`

## Your lessons

- **CardPrompt** Confirm your card payments: the lessons Inês added with their prices, the two fee facts, the authorisation, and Agree & add card.
- **EmailPrompt** Add your email: asked first when a student with no email arrives, with their lessons held back until it is sent.
- **LessonDialog** A booked lesson opened from the calendar: what and when, Join Google Meet, Change or Cancel, and, for a weekly one, Manage weekly lessons.
- **PastLessons** Lessons already had, newest first, under the calendar in Your lessons.
- **YourDetails** Edit details: the student's splat, name, email, card and NIF, each with a Change, and the code disclosure.
- **YourLessons** A student's home on the site: their name and Book a lesson on one row, the next lesson, then the month with every booked and weekly lesson on it.

## Brand

- **EditorialRule** The drawn rule under a display heading, and the short rule under a principle's heading. `<div className="editorial-rule editorial-rule--green" aria-hidden="true" />`
- **Splats** The organic paint marks that stand in for icons and pictures: eight a student can choose as their own, and the lessons' marks. `<AssetMark asset="/visuals/v2-splats/faq-answers-splat-v2.svg" className="faq-hero__mark" lands priority />`
- **Wordmark** Inês's hand-lettered name, the site's only logo: blue on cream in the header, cream on blue in the footer. `<BrandWordmark tone="cream" className="footer-wordmark" />`

## Expressions

- **ExpressionPicker** Uma expressão para ti: a cream sheet waits to be painted; Paint it reveals an expression, a second press its meaning, with the notes and other languages beside it.

## Site

- **FAQ** Questions before booking: a lilac banner with the FAQ splat, an index of seven groups on a lilac rail, questions that open in place, and Ask me before you book. `<FaqSections indexMark={<AssetMark asset="/visuals/v2-splats/faq-answers-splat-v2.svg" className="faq-index__answer-index" lands />} sections={faqSections} />`
- **HomeHero** The home page's first screen: a blue panel with the title, one line, Book a lesson and two ways in, beside three principles on a lilac rail.
- **HowITeach** How I teach (`/approach/`): the biggest heading on the site over a painted fan, the teaching list on a lilac rail, Meet Inês, and the closing callout.
- **LessonsPage** Lessons and prices: a lilac hero beside a blue panel with the open-centre splat, three lesson cards with their prices, and one blue closing card.
- **SiteFooter** The blue band that closes every page: the cream wordmark, the four links, Terms & privacy and the menu. `<SiteFooter />`
- **SiteHeader** The shared header on every page: the wordmark home on the left, Approach, Lessons and FAQ, and the blue Booking pill. `<SiteHeader currentPage="approach" />`
- **Terms** Terms & privacy: the one policy, in a dialog lifted off the page, its sections in small capitals. `<BookingInformation />`

## Inês's schedule

- **NextLesson** The blue band over Inês's tabs: the lesson happening now or next, and Join Meet. `<NextLesson bookings={bookings} now={now} onOpen={setSelectedBooking} />`
- **Receipts** Receipts: the month's payments with what still needs a receipt issued, and Download CSV. `<ReceiptsTab token={token} today={today} />`
- **ScheduleExpressions** Inês's Expressions tab: write and paint an expression, search her collection, and check the translations students add.
- **ScheduleLessonDialog** A lesson opened from Inês's timetable: who, when, Join Google Meet, how it is paid, the marks she can set, and her three actions.
- **ScheduleProfile** Inês's Profile tab: her name, sign-in email and password, each with one small action.
- **ScheduleTabs** The six tabs of Inês's schedule on one cream track, the chosen tab a blue thumb.
- **StudentInvite** A student's card opened to invite them: one WhatsApp link that signs them in once, within 14 days, in a message she can edit, sent with Copy or Send on WhatsApp.
- **StudentProfile** A student's card opened on their profile: their three checks with Invite and Add a lesson on the same row, then their details, price and plan, each with a pencil to edit, beside their lessons.
- **Students** Inês's Students tab: find a student, add one, see how many are all set, and the students in four groups, each card with three checks and one next button.
- **Timetable** Inês's week in hours: a column per day with its date and Day off switch, lessons as blue blocks, lunch hatched, and hours off shaded.

## Phone

- **PhoneConfirm** The confirm step on a phone: the choices as three full-width rows, the chosen lessons with Change, Add another lesson, then the confirm card.
- **PhoneHome** The home hero on a phone: the blue panel first, Book a lesson full width with the two ways in side by side beneath it, then the three principles.
- **PhoneMenu** The phone menu: the wordmark and a close button, the four destinations with their marks and a line each, and a blue card to book or message.
- **PhoneStudentCard** A student's card opened on a phone: the checks, Invite and Add a lesson, then details, price and plan stacked over the lessons.
- **PhoneTimetable** Inês's timetable on a phone: the days as a row of dates, one day's hours beneath.
- **PhoneYourLessons** Your lessons on a phone: the account button and Book, the next lesson, then the month in seven narrow columns.
