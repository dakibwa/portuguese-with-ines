/**
 * Every transactional email the site sends, as seventeen templates (16 October
 * 2026, Dan: forty emails consolidated into as few as is sensible).
 *
 * A template owns its words and structure: subject, heading, introduction,
 * note, facts, steps, action and footer. Callers decide what happened and
 * pass facts already formatted (dates on the reader's clock, amounts as the
 * site writes them); the layout in email.mjs draws every one the same way.
 * One event is one template, its variants differing only in the lines that
 * must: who made the change, one lesson or a run, how it is paid.
 *
 *   studentBooked        01 02 05 06   lessonBookedTeacher   03 04 07 08 17
 *   lessonReminder       09 10
 *   studentMoved         11 12 15      lessonMovedTeacher    13 14 16
 *   studentCancelled     18 19 22      lessonCancelledTeacher 20 21 23
 *   paymentReceipt       24 25 27      paymentReceivedTeacher 26 28
 *   paymentFailed        29 30
 *   welcome              32 33 34
 *   signInLink 36 · passwordReset 37 · emailChangeConfirm 38 ·
 *   emailChangeNotice 39 · homeworkSubmitted 40 · dormantInvite 41
 *
 * Inês's card-declined (31) and card-added (35) emails are no longer sent:
 * both are cards in her Needs you list, read from D1 (teacher-calendar.ts).
 *
 * Subjects, and the headings and preheaders of her payment emails, are read by
 * her inbox filters and fatura-recibo automation ("same-day fee" especially),
 * so they are kept word for word. Change them only together with that.
 */

export const SIGN_OFF = "Sent automatically by the booking system.";
export const FREE_LABEL = "Free";
/*
 * A welcome is the first email many students have from this address, so it
 * says who sent it and why, and keeps passwords and cards out of its subject,
 * preheader and button: a sign-in link from an unknown sender asking for a
 * card is what spam filters treat as phishing (27 October 2026, students
 * found it in spam).
 */
const WELCOME_FOOTER = [
  "You’re getting this because Inês added you as one of her students. Reply to write to her.",
  "The button lasts 14 days.", "Later, press Sign in on the website, then “Email me a sign-in link”."
];
const MANAGE_LABEL = "Change or cancel this lesson";
const ALL_LESSONS_LABEL = "See all your lessons";

const hello = (first) => `Olá ${first},`;

/** Her receipt automation reads this row on every email about a student's lessons. */
export function nifRow(nif) {
  return { label: "NIF", value: nif || "Not given (consumidor final)" };
}

/** The student beside her copy: name, address (or that there is none yet), phone. */
function studentRows({ name, email, phone, nif, notes }, { withPhone = true } = {}) {
  return [
    { label: "Student", value: `${name}\n${email}${withPhone && phone ? `\n${phone}` : ""}` },
    nifRow(nif),
    ...(notes ? [{ label: "Notes", value: notes }] : [])
  ];
}

/*
 * How a lesson is paid, as the Price row says it.
 *   free · paid · card (saved card, after the lesson) · untilCard (hers, until
 *   their card is added) · asUsual (hers, paid to her) · onTheDay (older terms)
 */
export function priceValue({ terms, amount, run = false }) {
  const each = run ? `${amount} a lesson` : amount;
  switch (terms) {
    case "free": return FREE_LABEL;
    case "paid": return `${amount} · paid`;
    case "card": return run ? `${each} · charged to your saved card after each lesson` : `${each} · charged to your saved card after the lesson`;
    case "untilCard": return `${each} · pay Inês as usual until you add your card`;
    case "asUsual": return `${each} · pay Inês as usual`;
    default: return `${each} · pay on the day, in person`;
  }
}

/*
 * The change policy under a student's lesson, said once and never repeating
 * a fee the note above it states.
 *   free · paid (locks inside the window) · card · unpaid · again (no fee to name)
 */
function policyFooter(policy, { notice, fee, run = false }) {
  const lesson = run ? "any lesson" : "the lesson";
  const before = run ? `${notice} before it` : `${notice} before the lesson`;
  switch (policy) {
    case "free": return run
      ? [`Please give Inês at least ${notice}' notice to move or cancel a lesson.`]
      : ["Need to change it? Use the link above.", `Please give Inês at least ${notice}' notice.`];
    case "paid": return [`Move or cancel ${lesson} free until ${before}.`, "After that, it can’t be changed or refunded."];
    case "card": return [`Move or cancel ${lesson} free until ${before}.`, `After that, moving or cancelling costs ${fee}.`, `A no-show costs ${fee} instead of the lesson price.`];
    case "unpaid": return run
      ? [`Moving or cancelling a lesson is free until ${before}; after that it costs ${fee}.`]
      : ["Need to change it? Use the link above.", `It’s free until ${before}; after that it costs ${fee}.`];
    default: return [run ? "You can move or cancel any lesson from your lesson calendar." : "You can move or cancel it again from the same link."];
  }
}

/* The way in, as numbered steps right above the button that takes it. */
function welcomeSteps(welcome, { book = false } = {}) {
  // With no lesson yet, the last step is theirs: choosing one (16 October 2026, Inês).
  if (book) {
    const items = ["Press the button below to sign in.", ...(welcome.card ? ["Add your card."] : []), "Choose a day and time for your next lesson."];
    return { title: items.length === 3 ? "Three quick steps" : "Two quick steps", items };
  }
  return welcome.card ? { title: "Two quick steps", items: ["Press the button below to sign in.", "Add your card. That’s it."] } : null;
}

function welcomeAction(welcome, { book = false } = {}) {
  return { label: book ? "Choose a time" : "See your lessons", url: welcome.url };
}

/** How her own email says the student was brought in. */
function welcomeNote(welcome) {
  return welcome?.card ? ", with a link to sign in and add their card" : welcome ? ", with a link to sign in" : "";
}

/** What her copy says when the student has not been emailed. */
function notEmailed(noEmailYet) {
  return `They haven't been emailed: ${noEmailYet ? "add their email under Edit details, then send their welcome" : "send their welcome from Students when you're ready"}`;
}

/*
 * A run's facts: what, where, how often, then its dates. With any Meet link
 * ready each lesson is its own line, linked or saying when its link comes;
 * otherwise the dates are one list.
 */
/** A run's lessons its change left alone, too close to move or cancel. */
function keptNote(kept, verb) {
  if (!kept) return "";
  return kept.count === 1 ? ` One lesson was too close to ${verb} and stays as it was.` : ` ${kept.count} lessons were too close to ${verb} and stay as they were.`;
}

function keptRows(kept, zone = "") {
  return kept ? [{ label: zone ? `Still booked, ${zone}` : "Still booked", value: kept.dates, dates: true }] : [];
}

function runRows({ lesson, place, repeats, occurrences, forTeacher = false, price = null }) {
  const linked = occurrences.some((item) => item.meetingUrl);
  return [
    { label: "Lesson", value: lesson },
    { label: "Where", value: place },
    ...(price ? [{ label: "Price", value: price }] : []),
    { label: repeats.label, value: repeats.value },
    ...(linked
      ? occurrences.map((item) => ({
          label: item.short,
          value: [item.price, item.meetingUrl ? "Join Google Meet" : item.online ? (forTeacher ? "Meet link not ready yet" : "Online link will appear in your booking") : item.place].filter(Boolean).join("\n"),
          url: item.meetingUrl,
          lesson: true,
          quiet: !item.meetingUrl && item.online
        }))
      : [{ label: "Dates", value: occurrences.map((item) => `${item.long}${item.price ? ` — ${item.price}` : ""}`).join("\n"), dates: true }])
  ];
}

/* One lesson's facts, on the student's copy or hers. */
function lessonRows({ lesson, place, meetingUrl, reference, price, cancelled = false }) {
  return [
    { label: "Lesson", value: lesson },
    cancelled || !meetingUrl ? { label: "Where", value: place } : { label: "Where", value: "Join Google Meet", url: meetingUrl },
    ...(price ? [{ label: "Price", value: price }] : []),
    { label: "Reference", value: reference }
  ];
}

/* ------------------------------------------------------------------ booked */

/**
 * 01 02 05 06 — a student's lesson or run is booked, by them or by Inês.
 *
 * `run` is absent for one lesson; for a run it is { oneOff, occurrences,
 * fixed (a set number of lessons), twoTimes, slot ("Tuesday", "17:30") when
 * Inês set up a plain weekly slot, repeats, occurrences, skippedNote }.
 */
export function studentBooked({ first, byInes, welcome = null, lesson, lessonName, place, meetingUrl, reference, when, shortWhen,
  price, policy, paid = false, notice, fee, manageUrl, lessonsUrl, run = null }) {
  if (!run) {
    return {
      subject: byInes ? `Inês has booked your Portuguese lesson — ${shortWhen}` : `Your Portuguese lesson is booked — ${shortWhen}`,
      content: {
        heading: "Your lesson is booked",
        preheader: welcome ? "Inês has booked your lesson. You can see it on her website." : `${lessonName} · ${when}`,
        intro: byInes
          ? welcome?.neverIn
            ? `${hello(first)} Inês has booked your next lesson. From now on you can see and change your lessons on Inês's website. A calendar invitation is attached.`
            : `${hello(first)} Inês has booked this lesson for you. A calendar invitation is attached.`
          : `${hello(first)} your lesson with Inês is ${paid ? "paid and confirmed" : "confirmed"}. A calendar invitation is attached.`,
        hero: when,
        rows: lessonRows({ lesson, place, meetingUrl, reference, price }),
        steps: welcome ? welcomeSteps(welcome) : null,
        action: welcome ? welcomeAction(welcome) : manageUrl ? { label: MANAGE_LABEL, url: manageUrl } : null,
        footer: welcome
          ? [policy === "free" ? `Please give Inês at least ${notice}' notice to change it.` : `It’s free to change until ${notice} before the lesson; after that it costs ${fee}.`, ...WELCOME_FOOTER]
          : policyFooter(policy, { notice, fee })
      }
    };
  }

  const times = run.twoTimes ? "both times are" : "the same time is";
  const plainSlot = byInes && !run.oneOff && run.slot;
  const intro = plainSlot
    ? `${hello(first)} Inês has kept ${run.slot.weekday}s at ${run.slot.time} for you. ${
        run.fixed ? "Every lesson is in your calendar attachment." : "New weeks appear on their own until the slot is stopped."
      }${welcome?.neverIn ? " You can see and change them on Inês's website." : ""}`
    : run.oneOff
      ? `${hello(first)} your selected lessons are booked. Every date is in the calendar attachment, and you can move or cancel each lesson from your lesson calendar.`
      : run.fixed
        ? `${hello(first)} ${times} now held for you each week. Every lesson is in the calendar attachment, and you can move or cancel any one of them on your lesson calendar.`
        : `${hello(first)} ${times} now held for you each week. Your current lessons are in the calendar attachment, and new weeks will appear automatically on your lesson calendar without extra confirmation emails.`;
  // A slot Inês set up reads as one line, its day and time, rather than a long
  // list of dates (12 October 2026, Dan: simple to understand).
  const rows = plainSlot
    ? [
        { label: "Lesson", value: lesson },
        { label: "Where", value: place },
        { label: "Price", value: price },
        { label: "When", value: `Every ${run.slot.weekday}, ${run.slot.time}${run.fixed ? ` · ${run.count} lessons` : ""}` }
      ]
    : runRows({ lesson, place, price, repeats: run.repeats, occurrences: run.occurrences });
  return {
    subject: byInes
      ? `Inês has booked your weekly Portuguese lessons — from ${shortWhen}`
      : `Your ${run.oneOff ? "" : "weekly "}Portuguese lessons are booked — from ${shortWhen}`,
    content: {
      heading: run.oneOff ? "Your lessons are booked" : "Your weekly lessons are booked",
      preheader: `${lessonName} · ${run.repeats.value}`,
      intro,
      callout: run.skippedNote,
      hero: when,
      rows,
      steps: welcome ? welcomeSteps(welcome) : null,
      action: welcome ? welcomeAction(welcome) : { label: ALL_LESSONS_LABEL, url: lessonsUrl },
      footer: welcome ? [...policyFooter(policy, { notice, fee, run: true }), ...WELCOME_FOOTER] : policyFooter(policy, { notice, fee, run: true })
    }
  };
}

/**
 * 03 04 07 08 17 — Inês's copy of a booking: a student's, one she added, or
 * an open-ended run carried forward (`extended`).
 */
export function lessonBookedTeacher({ student, byInes, held = false, noEmailYet = false, welcome = null, lesson, lessonName, place, meetingUrl, reference,
  when, heroNote = "", shortWhen, paidAmount = "", calendarAttached = true, run = null, extended = false }) {
  const name = student.name;
  if (!run) {
    return {
      subject: byInes ? `You added a lesson — ${name}, ${shortWhen}` : `New booking — ${name}, ${shortWhen}`,
      content: {
        heading: byInes ? "You added a lesson" : "New booking",
        preheader: `${name} · ${lessonName} · ${when}`,
        intro: byInes
          ? held ? `You added a lesson for ${name}. ${notEmailed(noEmailYet)}.` : `You added a lesson for ${name}. They have been emailed the details${welcomeNote(welcome)}.`
          // The invitation carries PARTSTAT=ACCEPTED: there is nothing to accept.
          : `${name} has booked a lesson. ${calendarAttached ? "The attached invitation goes straight into your calendar." : "It is in your calendar."}`,
        callout: paidAmount ? `Stripe received ${paidAmount} today. Issue the appropriate Portal das Finanças document for this payment today.` : "",
        hero: when,
        heroNote,
        rows: [...lessonRows({ lesson, place, meetingUrl, reference }), ...studentRows(student)],
        footer: SIGN_OFF
      }
    };
  }
  const subject = extended
    ? `Weekly slot extended — ${name}, to ${run.lastShort}`
    : byInes
      ? `You added a weekly slot — ${name}, from ${shortWhen}`
      : `${run.oneOff ? "Lesson bookings" : "Weekly booking"} — ${name}, from ${shortWhen}`;
  return {
    subject,
    content: {
      heading: extended ? "Weekly lessons extended" : byInes ? "You added weekly lessons" : run.oneOff ? "New bookings" : "New weekly booking",
      preheader: `${name} · ${run.repeats.value}`,
      intro: extended
        ? `${name}'s open-ended weekly slot has been carried forward. The new lessons will appear in your calendar.`
        : byInes
          ? `You added a weekly slot for ${name}. ${held ? notEmailed(noEmailYet) : `They have been emailed the details${welcomeNote(welcome)}`}, and every lesson will appear in your calendar.`
          : `${name} booked ${run.oneOff ? "these individual lessons" : run.twoTimes ? "two times each week" : "the same slot each week"}. Every lesson will appear in your calendar.`,
      callout: run.skippedNote,
      hero: when,
      rows: [...runRows({ lesson, place, repeats: run.repeats, occurrences: run.occurrences, forTeacher: true }), ...studentRows(student)],
      footer: SIGN_OFF
    }
  };
}

/* --------------------------------------------------------------- reminder */

/**
 * 09 10 — the day-before reminder, and the Meet link sent on its own when it
 * was not ready for the confirmation (`linkOnly`).
 */
export function lessonReminder({ first, lessonName, lesson, place, reference, when, shortWhen, meetingUrl = "", meetComing = false,
  manageUrl, cutoff = "", policy = "card", fee = "", linkOnly = false }) {
  const manage = manageUrl ? { label: MANAGE_LABEL, url: manageUrl } : null;
  if (linkOnly) {
    return {
      subject: "Your online lesson link",
      content: {
        heading: "Your online lesson link",
        preheader: "Join your lesson from your email or booking.",
        intro: `${hello(first)} here’s the Google Meet link for your lesson with Inês.`,
        hero: when,
        rows: [...(lesson ? [{ label: "Lesson", value: lesson }] : []), { label: "Reference", value: reference }],
        action: { label: "Join Google Meet", url: meetingUrl },
        ...(manage ? { link: manage } : {}),
        footer: "You can also find this link in your booking. See you soon!"
      }
    };
  }
  // The cut-off is where the change policy starts charging: always the moment
  // that is true, with no "today" or "tomorrow".
  const footer = policy === "free"
    ? [`If you need to change or cancel it, please do so by ${cutoff}.`]
    : [`Free to change or cancel until ${cutoff}.`, policy === "paid" ? "After that, it can’t be changed or refunded." : `After that, there’s a ${fee} late change fee.`];
  return {
    subject: `Your lesson is coming up — ${shortWhen}`,
    content: {
      heading: "Your lesson is coming up",
      preheader: `${lessonName} · ${meetingUrl ? "Your Google Meet link is in this email." : place}`,
      intro: meetingUrl
        ? `${hello(first)} your lesson with Inês is coming up. Here’s the Google Meet link to join it.`
        : meetComing
          ? `${hello(first)} your lesson with Inês is coming up. Its Google Meet link isn’t ready yet; we’ll email it to you as soon as it is.`
          : `${hello(first)} your lesson with Inês is coming up.`,
      hero: when,
      rows: [{ label: "Lesson", value: lesson }, { label: "Where", value: place }, { label: "Reference", value: reference }],
      // Coral marks the one thing still to do: join, when there is a link.
      action: meetingUrl ? { label: "Join Google Meet", url: meetingUrl } : manage,
      ...(meetingUrl && manage ? { link: manage } : {}),
      footer
    }
  };
}

/* ------------------------------------------------------------------ moved */

/** 11 12 15 — a student's lesson (or weekly run) has moved or changed length. */
export function studentMoved({ first, byInes, lengthChanged = false, minutes, lesson, lessonName, place, meetingUrl, reference, when, shortWhen,
  price, lateNote = "", policy, notice, fee, manageUrl, lessonsUrl, welcome = null, run = null }) {
  if (run) {
    return {
      subject: `Your weekly Portuguese lessons have moved — from ${shortWhen}`,
      content: {
        heading: "Your weekly lessons have moved",
        preheader: `${lessonName} · ${run.repeats.value}`,
        intro: `${hello(first)} your upcoming weekly lessons now use this new time.${keptNote(run.kept, "move")} The updated dates are in the calendar attachment, and you can still manage any one lesson from your lesson calendar.`,
        callout: run.skippedNote,
        hero: when,
        rows: [...runRows({ lesson, place, price, repeats: run.repeats, occurrences: run.occurrences }), ...keptRows(run.kept)],
        action: welcome ? welcomeAction(welcome) : { label: ALL_LESSONS_LABEL, url: lessonsUrl },
        footer: welcome ? [...policyFooter(policy, { notice, fee, run: true }), ...WELCOME_FOOTER] : policyFooter(policy, { notice, fee, run: true })
      }
    };
  }
  // Written for someone who did not ask for this when Inês moved it.
  const intro = byInes
    ? `${hello(first)} Inês has moved your lesson to the time below. An updated calendar invitation is attached. If the new time doesn't suit, choose another time or reply to this email.`
    : lengthChanged
      ? `${hello(first)} your lesson is now ${minutes} minutes at the time below. An updated calendar invitation is attached.`
      : `${hello(first)} your new lesson time is below. An updated calendar invitation is attached.`;
  return {
    subject: byInes ? `Inês has moved your lesson — now ${shortWhen}` : lengthChanged ? `Your lesson has changed — ${shortWhen}` : `Your lesson has moved — ${shortWhen}`,
    content: {
      heading: lengthChanged && !byInes ? "Your lesson has changed" : "Your lesson has moved",
      preheader: `${lessonName} · ${when}`,
      intro,
      callout: byInes ? "" : lateNote,
      hero: when,
      rows: lessonRows({ lesson, place, meetingUrl, reference, price }),
      action: manageUrl ? { label: MANAGE_LABEL, url: manageUrl } : null,
      // A late move on a saved card states its fee in the note, so the footer adds only what it doesn't say.
      footer: byInes ? "No charge for a change she makes." : policy === "late" ? "This fee applies once per lesson." : policyFooter(policy, { notice, fee })
    }
  };
}

/** 13 14 16 — Inês's copy of a move: the student's, her own, or a weekly run's. */
export function lessonMovedTeacher({ student, byInes, held = false, lengthChanged = false, fromMinutes, minutes, previousWhen = "", late = false,
  lateNote = "", notice, lesson, lessonName, place, meetingUrl, reference, when, heroNote = "", shortWhen, run = null }) {
  const name = student.name;
  if (run) {
    return {
      subject: `Weekly slot moved — ${name}, from ${shortWhen}`,
      content: {
        heading: "Weekly lessons moved",
        preheader: `${name} · ${run.repeats.value}`,
        intro: `${name}'s upcoming weekly lessons have moved.${keptNote(run.kept, "move")} The updated events will appear in your calendar.`,
        callout: run.skippedNote,
        hero: when,
        rows: [...runRows({ lesson, place, repeats: run.repeats, occurrences: run.occurrences, forTeacher: true }), ...keptRows(run.kept), ...studentRows(student)],
        footer: SIGN_OFF
      }
    };
  }
  const from = previousWhen ? ` from ${previousWhen}` : "";
  return {
    subject: byInes
      ? `You moved ${name}'s lesson — ${shortWhen}`
      : lengthChanged ? `Lesson changed — ${name}, ${shortWhen}` : `${late ? "Late change" : "Lesson moved"} — ${name}, ${shortWhen}`,
    content: {
      heading: byInes ? "You moved this lesson" : lengthChanged ? "Lesson changed" : late ? `Moved less than ${notice} before` : "Lesson moved",
      preheader: `${name} · ${lessonName} · ${when}`,
      intro: byInes
        ? `You moved ${name}'s lesson${from}. ${held ? "They haven't been emailed yet" : "They have been told"}, and your calendar has been updated.`
        : lengthChanged
          ? `${name} changed their lesson from ${fromMinutes} to ${minutes} minutes${previousWhen ? ` and moved it${from}` : ""}. Your calendar has been updated.`
          : `${name} moved their lesson${from}. Your calendar has been updated.`,
      callout: lateNote,
      hero: when,
      heroNote,
      rows: [...lessonRows({ lesson, place, meetingUrl, reference }), ...studentRows(student)],
      footer: SIGN_OFF
    }
  };
}

/* -------------------------------------------------------------- cancelled */

/** 18 19 22 — a student's lesson, or the rest of their weekly run, is cancelled. */
export function studentCancelled({ first, byInes, message = "", note = "", lesson, lessonName, place, reference, when, shortWhen, run = null }) {
  if (run) {
    return {
      subject: `Your weekly lessons are cancelled — ${run.count}`,
      content: {
        heading: "Your weekly lessons are cancelled",
        preheader: `${run.count} removed from your calendar.`,
        intro: `${hello(first)} the rest of your weekly run has been cancelled and removed from your calendar.${keptNote(run.kept, "cancel")}`,
        rows: [{ label: `Cancelled, ${run.zone}`, value: run.dates, dates: true }, ...keptRows(run.kept, run.zone)],
        footer: "You’re welcome back any time — booking is always open on the website."
      }
    };
  }
  return {
    subject: byInes ? `Inês has cancelled your lesson on ${shortWhen}` : `Your lesson on ${shortWhen} is cancelled`,
    content: {
      heading: "Your lesson is cancelled",
      preheader: `${lessonName} · ${when}`,
      intro: byInes
        ? message
          ? `${hello(first)} Inês has cancelled this lesson and left you a message below. A cancellation update for your calendar is attached.`
          : `${hello(first)} Inês has cancelled this lesson. Sorry about that — reply to arrange another time. A cancellation update for your calendar is attached.`
        : `${hello(first)} your lesson has been cancelled and removed from your calendar.`,
      message: message ? { label: "Message from Inês", body: message } : null,
      callout: note,
      hero: when,
      // A cancelled lesson has no call to join, so its place is named, not linked.
      rows: lessonRows({ lesson, place, reference, cancelled: true }),
      footer: byInes ? "A cancellation Inês makes never costs you anything." : "You’re welcome back any time — booking is always open on the website."
    }
  };
}

/** 20 21 23 — Inês's copy of a cancellation. */
export function lessonCancelledTeacher({ student, byInes, held = false, late = false, notice, note = "", message = "", lesson, lessonName, place,
  reference, when, longWhen, heroNote = "", shortWhen, run = null }) {
  const name = student.name;
  if (run) {
    return {
      subject: `Weekly run cancelled — ${name}, ${run.count}`,
      content: {
        heading: "Weekly lessons cancelled",
        preheader: `${name} · ${run.count}`,
        intro: `${name} cancelled the rest of their weekly lessons. They are off your calendar.${keptNote(run.kept, "cancel")}`,
        rows: [...studentRows(student, { withPhone: false }), { label: "Cancelled", value: run.dates, dates: true }, ...keptRows(run.kept)],
        footer: SIGN_OFF
      }
    };
  }
  return {
    subject: byInes ? `You cancelled ${name}'s lesson — ${shortWhen}` : `${late ? "Late cancellation" : "Cancellation"} — ${name}, ${shortWhen}`,
    content: {
      heading: byInes ? "You cancelled this lesson" : late ? `Cancelled less than ${notice} before` : "Lesson cancelled",
      preheader: `${name} · ${lessonName} · ${when}`,
      intro: byInes
        ? `You cancelled ${name}'s lesson on ${longWhen}. ${held ? "They hadn't been emailed about it" : "They have been told"}, and it is off your calendar.`
        : `${name} cancelled their lesson on ${longWhen}. It has been removed from your calendar.`,
      message: message ? { label: "Your message to the student", body: message } : null,
      callout: note,
      hero: when,
      heroNote,
      rows: [...lessonRows({ lesson, place, reference, cancelled: true }), ...studentRows(student)],
      footer: SIGN_OFF
    }
  };
}

/* --------------------------------------------------------------- payments */

const ITEM = { lesson: "lesson payment", "no-show": "no-show fee", fee: "late change fee" };

/** 24 25 27 — the student's receipt for a charge to their saved card; the line item varies. */
export function paymentReceipt({ first, item, amount, lesson, lessonName, shortWhen, reference, nif = "", noticeHours }) {
  const fee = item === "fee";
  const heading = fee ? "Your late change fee is paid" : item === "no-show" ? "Your no-show fee is paid" : "Your lesson is paid";
  return {
    subject: fee ? `Late change fee paid — ${reference}` : `${heading} — ${shortWhen}`,
    content: {
      heading,
      preheader: fee ? `${lessonName} · ${amount}` : `${lessonName} · ${amount} charged to your saved card`,
      intro: fee
        ? `${hello(first)} your saved card was charged ${amount} for moving or cancelling this lesson less than ${noticeHours} hours before it.`
        : item === "no-show"
          ? `${hello(first)} Inês marked this lesson as a no-show. Your saved card was charged ${amount} instead of the lesson price.`
          : `${hello(first)} your lesson is finished. ${amount} was charged to your saved card.`,
      callout: fee ? "You will not be charged this fee again for the same lesson." : "",
      rows: [
        { label: "Lesson", value: `${lesson} · ${shortWhen}` },
        { label: fee ? "Late change fee" : item === "no-show" ? "No-show fee" : "Paid", value: `${amount} · saved card` },
        { label: "Reference", value: reference },
        // Lets the student check the number before Inês issues the receipt.
        ...(nif ? [{ label: "NIF", value: `${nif} · on your receipt from Inês` }] : [])
      ],
      footer: SIGN_OFF
    }
  };
}

/**
 * 26 28 — Inês is told a payment arrived, to issue its fiscal document today.
 * Subject, heading and preheader are read by her receipt automation.
 */
export function paymentReceivedTeacher({ studentName, item, amount, lessonName, longWhen, shortWhen, reference, nif, noticeHours }) {
  const fee = item === "fee";
  return {
    subject: fee ? `Payment received — ${studentName}, ${amount} same-day fee` : `Payment received — ${studentName}, ${shortWhen}`,
    content: {
      heading: fee ? "A same-day fee was paid" : item === "no-show" ? "A no-show fee was paid" : "A lesson was paid",
      preheader: fee ? `${studentName} · same-day fee · ${amount}` : `${studentName} · ${lessonName} · ${amount}`,
      intro: fee
        ? `The ${amount} fee for ${studentName} moving or cancelling less than ${noticeHours} hours before their lesson was charged successfully.`
        : `${amount} for ${studentName}'s ${item === "no-show" ? "no-show" : "lesson"} was charged successfully after the scheduled end time.`,
      callout: "Issue the appropriate Portal das Finanças document for this payment today.",
      rows: [
        { label: "Lesson", value: `${lessonName} · ${longWhen}` },
        { label: "Reference", value: reference },
        nifRow(nif)
      ],
      footer: SIGN_OFF
    }
  };
}

/** 29 30 — the saved card was declined: a secure link to pay. */
export function paymentFailed({ first, item, amount, lesson, lessonName, shortWhen, reference, payUrl }) {
  return {
    subject: `${item === "fee" ? "Late change fee" : item === "no-show" ? "No-show fee" : "Lesson payment"} — the card didn't go through`,
    content: {
      heading: "The card didn't go through",
      preheader: `${lessonName} · ${amount} still to pay`,
      intro: `${hello(first)} we couldn't charge the ${amount} ${ITEM[item]} to your saved card. Please use the secure payment link below.`,
      rows: [
        { label: "Lesson", value: `${lesson} · ${shortWhen}` },
        { label: item === "fee" ? "Late change fee" : item === "no-show" ? "No-show fee" : "Price", value: amount },
        { label: "Reference", value: reference }
      ],
      action: { label: `Pay ${amount}`, url: payUrl },
      footer: SIGN_OFF
    }
  };
}

/* ---------------------------------------------------------------- welcome */

/**
 * 32 33 34 — her welcome: their lessons and prices and the one-click way in;
 * with no lesson yet, an invitation to book one (`rows` then holds prices only).
 */
export function welcome({ first, welcome, book, free, rows }) {
  return {
    subject: book ? "Book your next lesson with Inês" : "Your lessons with Inês, in one place",
    content: {
      heading: book ? "Book your next lesson" : "Your lessons, in one place",
      preheader: book ? "Choose a time on Inês’s new website." : "Your lessons and prices on Inês’s new website.",
      intro: book
        ? `${hello(first)} Inês now takes bookings on her own website, and she has set you up there, so you can choose a time for your next lesson whenever it suits you.`
        : `${hello(first)} Inês has set up your lessons on her website. Here they are; sign in to see or change them.`,
      callout: free ? "Your lessons with Inês are free: there’s no card to add and nothing to pay." : "",
      rows,
      steps: welcomeSteps(welcome, { book }),
      action: welcomeAction(welcome, { book }),
      footer: WELCOME_FOOTER
    }
  };
}

/* ---------------------------------------------------------------- dormant */

/**
 * 41 — her come-back email to a student she marked dormant (22 October 2026,
 * Dan): the subject and words she wrote for them, greeting included, then the
 * way back to booking. A student gets the one-click sign-in her welcome
 * carries; a teacher who is also a student signs in as themselves, so theirs
 * opens the booking page.
 */
export function dormantInvite({ subject, message, signInUrl = "", bookUrl }) {
  return {
    subject,
    content: {
      heading: "Book your next lesson",
      preheader: "Choose a time on Inês’s website.",
      intro: message,
      action: signInUrl ? { label: "Choose a time", url: signInUrl } : { label: "Book a lesson", url: bookUrl },
      footer: signInUrl ? WELCOME_FOOTER : "Reply to this email to write to Inês."
    }
  };
}

/* ---------------------------------------------------------------- account */

/** 36 */
export function signInLink({ first, url }) {
  return {
    subject: "Your sign-in link — Português com a Inês",
    content: {
      heading: "Sign in",
      preheader: "One click and you're in. The link works for 30 minutes.",
      intro: `${hello(first)} use the button below to sign in. It works for 30 minutes, and only once.`,
      action: { label: "Sign in", url },
      footer: "If you didn't ask for this, you can ignore it."
    }
  };
}

/** 37 */
export function passwordReset({ first, url }) {
  return {
    subject: "Reset your password — Português com a Inês",
    content: {
      heading: "Reset your password",
      preheader: "Choose a new password — the link works for one hour.",
      intro: `${hello(first)} use the button below to choose a new password. The link works for one hour, and only once.`,
      action: { label: "Choose a new password", url },
      footer: "If you didn't ask for this, you can ignore it — your password has not changed."
    }
  };
}

/** 38 — to the new address. */
export function emailChangeConfirm({ first, email, url }) {
  return {
    subject: "Confirm your new email — Português com a Inês",
    content: {
      heading: "Confirm this address",
      preheader: "One click, and this becomes the address you sign in with.",
      intro: `${hello(first)} confirm this address and it becomes the one you sign in with and receive lesson emails at. The link works for one hour, and only once.`,
      rows: [{ label: "New address", value: email }],
      action: { label: "Confirm this address", url },
      footer: "If you didn't ask for this, ignore it — nothing has changed."
    }
  };
}

/** 39 — to the address on file, the one that would notice a change nobody asked for. */
export function emailChangeNotice({ first, email }) {
  return {
    subject: "Someone asked to change your email — Português com a Inês",
    content: {
      heading: "A change was requested",
      preheader: "Your address has not changed yet.",
      intro: `${hello(first)} someone signed in to your account and asked to move it to ${email}. Nothing has changed yet — it only takes effect if that address confirms.`,
      callout: "If this wasn't you, change your password now and tell Inês.",
      rows: [{ label: "Requested address", value: email }],
      footer: SIGN_OFF
    }
  };
}

/** 40 — to Inês, once per submission, with no answers or marks. */
export function homeworkSubmitted({ name, title = "", when = "", url }) {
  return {
    subject: `${name} sent you their homework`,
    content: {
      heading: "Homework to review",
      preheader: `${name.split(" ")[0]}’s answers are ready for you to check.`,
      intro: `${name} has sent you their homework. Check the marks and send your feedback back when you’re ready.`,
      rows: [
        ...(title ? [{ label: "Sheet", value: title }] : []),
        ...(when ? [{ label: "Lesson", value: when }] : [])
      ],
      action: { label: "Review homework", url },
      footer: SIGN_OFF
    }
  };
}
