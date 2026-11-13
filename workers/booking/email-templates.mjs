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
 * Every email is written the way the welcome is (11 November 2026, Dan: "can
 * we apply this logic to all emails that are sent out please"), for readers
 * who are often reading a second language: one short introduction that says
 * what happened, then the facts as short bullets, each said once. The date
 * panel names the clock, so nothing beneath it does again; a lesson is one
 * line, `Online · 60 minutes · €25`, with how it is paid beneath it; a run's
 * dates are a list, its promise of links said once under them; the footer is
 * at most three short facts, the change-and-fee rule in the site's own words.
 * Labels stay only where the label is the point: Reference, NIF, Notes, the
 * student on Inês's copies, a new address, what a lesson was before.
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
 * so they are kept word for word. Change them only together with that. The
 * `NIF` row and the `Reference` row are read the same way.
 */

import { splitWhen } from "./email.mjs";
import { currentTutor } from "./tutor.mjs";

export const SIGN_OFF = "Sent automatically by the booking system.";
export const FREE_LABEL = "Free";
/*
 * A welcome is the first email many students have from this address, so it
 * says who sent it and why, and keeps passwords and cards out of its subject,
 * preheader and button. This makes the invitation clearer; inbox placement
 * still depends on the receiving provider. It says so in as few plain words
 * as it can (11 November 2026, Dan: "simpler language", "less verbose"):
 * many of its readers are reading a second language. The site's own link
 * under every email is the way in once the button has run out.
 */
const welcomeFooter = (tutor) => [
  "The button works for 14 days.",
  `Questions for ${tutor.shortName}? Just reply to this email.`
];
/* Under a lesson's change rule, the welcome's two lines are one fact, so a footer keeps to three. */
const welcomeLine = (tutor) => welcomeFooter(tutor).join(" ");
const MANAGE_LABEL = "Change or cancel this lesson";
const ALL_LESSONS_LABEL = "See all your lessons";
const JOIN_LABEL = "Join Google Meet";
const CALENDAR_ATTACHED = "A calendar invitation is attached.";
const CALENDAR_UPDATED = "An updated calendar invitation is attached.";
const CALENDAR_CANCELLED = "A calendar update is attached.";
/** Account links that are not a lesson: what to do if the reader did not ask. */
const NOT_YOU = "Didn’t ask for this? You can ignore it.";

const hello = (first, tutor) => `${tutor.language.phrases.hello} ${first},`;

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
 * The emails show it in two parts (`priceParts`): the amount on the lesson's
 * line, and how it is paid as a bullet of its own.
 */
export function priceValue({ tutor = currentTutor(), terms, amount, run = false }) {
  const each = run ? `${amount} a lesson` : amount;
  switch (terms) {
    case "free": return FREE_LABEL;
    case "paid": return `${amount} · paid`;
    case "card": return run ? `${each} · charged to your saved card at the end of each lesson` : `${each} · charged to your saved card at the end of the lesson`;
    case "untilCard": return `${each} · pay ${tutor.shortName} as usual until you add your card`;
    case "asUsual": return `${each} · pay ${tutor.shortName} as usual`;
    default: return `${each} · pay on the day, in person`;
  }
}

/** A Price value as its amount (`€25`, `€25 paid`, `Free`) and, apart, how it is paid. */
function priceParts(price) {
  const text = String(price ?? "");
  const at = text.indexOf(" · ");
  const amount = at < 0 ? text : text.slice(0, at);
  const terms = at < 0 ? "" : text.slice(at + 3);
  if (terms === "paid") return { amount: `${amount} paid`, terms: "" };
  return { amount, terms: terms ? `${terms[0].toUpperCase()}${terms.slice(1)}` : "" };
}

/** "60-minute lesson" is its length, "60 minutes"; a trial keeps its name ("Trial lesson · 30 minutes"). */
function lessonParts(lesson) {
  const text = String(lesson ?? "");
  const plain = /^(\d+)-minute lesson$/.exec(text);
  if (plain) return { name: "", length: `${plain[1]} minutes` };
  const [name = "", length = ""] = text.split(" · ");
  return /^\d+ minutes$/.test(name) ? { name: "", length: name } : { name, length };
}

/** The lesson as one line, as the welcome writes it: `Online · 60 minutes · €25`. */
function lessonLine({ lesson, place = "", amount = "", when = "" }) {
  const { name, length } = lessonParts(lesson);
  return [when, name, place, length, amount].filter(Boolean).join(" · ");
}

/** "Thursday, 3 September 2026 at 17:30" as a list of lessons to come shows it: "Thursday 3 September, 17:30". */
function listDate(long, { year = false } = {}) {
  const match = /^([A-Za-z]+),? (\d{1,2} [A-Za-z]+) (\d{4}) at (\d{1,2}:\d{2})$/.exec(String(long ?? ""));
  return match ? `${match[1]} ${match[2]}${year ? ` ${match[3]}` : ""}, ${match[4]}` : String(long ?? "");
}

/** One bullet per date. */
function dateFacts(dates) {
  return String(dates ?? "").split(/\r?\n/).filter(Boolean).map((line) => ({ fact: listDate(line) }));
}

/*
 * The change rule under a student's lesson, in the site's words (FeeFacts in
 * src/components/CardOnFile.tsx), never repeating a fee the note above states.
 *   free · paid (locks inside the window) · card · unpaid (paid to her: no
 *   no-show fee) · again (nothing to add: the button changes it again)
 * On a saved card a no-show is charged the fee in place of the lesson, which
 * the site's line does not say, so that sentence is kept as it was.
 */
function policyFooter(policy, { notice, fee, run = false, tutor }) {
  const free = `Free to change or cancel a lesson up to ${notice} before.`;
  switch (policy) {
    case "free": return [`Please give ${tutor.shortName} at least ${notice}’ notice to ${run ? "move or cancel a lesson" : "change or cancel it"}.`];
    case "paid": return [free, "After that, it can’t be changed or refunded."];
    case "card": return [free, `${fee} to move or cancel later.`, `A no-show costs ${fee} instead of the lesson price.`];
    case "unpaid": return [free, `${fee} to move or cancel later.`];
    default: return [];
  }
}

/* The way in, as numbered steps right above the button that takes it. */
function welcomeSteps(welcome, { book = false } = {}) {
  // With no lesson yet, the last step is theirs: choosing one (16 October 2026, Inês).
  if (book) {
    const items = ["Press the button below.", ...(welcome.card ? ["Add your card."] : []), "Choose a day and time for your next lesson."];
    return { title: items.length === 3 ? "Three quick steps" : "Two quick steps", items };
  }
  return welcome.card ? { title: "Two quick steps", items: ["Press the button below.", "Add your card."] } : null;
}

function welcomeAction(welcome, { book = false } = {}) {
  return { label: book ? "Choose a time" : "See your lessons", url: welcome.url };
}

/** How her own email says the student was brought in. */
function welcomeNote(welcome) {
  return welcome?.card ? ", with a link to sign in and add their card" : welcome ? ", with a link to sign in" : "";
}

/** What her copy says when the student has not been emailed. */
function notEmailed(name, noEmailYet) {
  return `${name} hasn't been emailed: ${noEmailYet ? "add their email under Edit details, then send their welcome" : "send their welcome from Students when you're ready"}.`;
}

/** Her copy of an email a student was sent, or was not. */
function emailedLine(name, { held, noEmailYet, welcome }) {
  return held ? notEmailed(name, noEmailYet) : `${name} has been emailed the details${welcomeNote(welcome)}.`;
}

/** A run's lessons its change left alone, too close to move or cancel. */
function keptNote(kept, verb) {
  if (!kept) return "";
  return kept.count === 1 ? ` One lesson was too close to ${verb} and stays as it was.` : ` ${kept.count} lessons were too close to ${verb} and stay as they were.`;
}

/* Lessons still on, under a title of their own; the clock is the one already named above. */
function keptRows(kept) {
  return kept ? [{ title: "Still booked" }, ...dateFacts(kept.dates)] : [];
}

/*
 * A run's facts: the lesson as one line, how it is paid, how often, then its
 * dates, one bullet each. A date whose Meet link is ready carries it; the
 * others' promise is said once, under the list. Different prices sit beside
 * their own date, and different ways of paying make each date a lesson of its
 * own (its date bold, its price beneath).
 */
function runRows({ lesson, place, repeats, occurrences, forTeacher = false, price = null, newWeeks = "" }) {
  const { amount, terms } = priceParts(price);
  const each = occurrences.map((item) => priceParts(item.price));
  const priced = occurrences.some((item) => item.price);
  const oneWay = priced && new Set(each.map((part) => part.terms)).size === 1;
  const linked = occurrences.some((item) => item.meetingUrl);
  const waiting = occurrences.some((item) => !item.meetingUrl && item.online);
  const dates = occurrences.map((item, index) => {
    const date = listDate(item.long);
    const elsewhere = item.place && item.place !== place ? item.place : "";
    const meet = item.meetingUrl ? { url: item.meetingUrl, link: JOIN_LABEL } : {};
    if (priced && !oneWay) return { lesson: true, label: date, value: [item.price, elsewhere].filter(Boolean).join(" · "), ...meet };
    return { fact: [date, priced ? each[index].amount : "", elsewhere].filter(Boolean).join(" · "), ...meet };
  });
  const paying = oneWay ? each[0].terms : terms;
  return [
    { fact: lessonLine({ lesson, place, amount: priced ? "" : amount }) },
    ...(paying ? [{ fact: paying }] : []),
    { fact: repeats.value },
    ...(newWeeks ? [{ fact: newWeeks }] : []),
    { title: "Dates" },
    ...dates,
    ...(linked && waiting ? [{ fact: forTeacher ? "The other Meet links aren’t ready yet" : "The other Meet links will appear in your booking", quiet: true }] : [])
  ];
}

/* One lesson's facts, on the student's copy or hers: the lesson, how it is paid, the call, the reference. */
function lessonRows({ lesson, place, meetingUrl, reference, price, cancelled = false, before = "" }) {
  const { amount, terms } = priceParts(price);
  return [
    { fact: lessonLine({ lesson, place, amount }) },
    ...(terms ? [{ fact: terms }] : []),
    // A cancelled lesson has no call to join, so its place is named, not linked.
    ...(meetingUrl && !cancelled ? [{ fact: JOIN_LABEL, url: meetingUrl }] : []),
    ...(before ? [{ label: "Before", value: before }] : []),
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
export function studentBooked({ tutor = currentTutor(), first, byTeacher, welcome = null, restored = false, lesson, lessonName, place, meetingUrl, reference, when, shortWhen,
  price, policy, paid = false, notice, fee, manageUrl, lessonsUrl, run = null }) {
  // A student she brought in is told where their lessons now are, the website by name.
  const website = welcome?.neverIn ? ` You can now see and change your lessons on ${tutor.pronouns.possessive} website, ${tutor.site.domain}.` : "";
  const footer = (rules) => welcome ? [...rules, welcomeLine(tutor)] : rules;
  // A lesson she cancelled and put back (13 November 2026): the same lesson, as it was.
  if (!run && restored) {
    return {
      subject: `Your ${tutor.language.name} lesson is back on — ${shortWhen}`,
      content: {
        heading: "Your lesson is back on",
        preheader: `${tutor.shortName} has put your lesson back · ${when}`,
        intro: `${hello(first, tutor)} ${tutor.shortName} has put back the lesson ${tutor.pronouns.subject} cancelled, just as it was. ${CALENDAR_UPDATED}`,
        hero: when,
        rows: lessonRows({ lesson, place, meetingUrl, reference, price }),
        action: manageUrl ? { label: MANAGE_LABEL, url: manageUrl } : null,
        footer: policyFooter(policy, { notice, fee, tutor })
      }
    };
  }
  if (!run) {
    return {
      subject: byTeacher ? `${tutor.shortName} has booked your ${tutor.language.name} lesson — ${shortWhen}` : `Your ${tutor.language.name} lesson is booked — ${shortWhen}`,
      content: {
        heading: "Your lesson is booked",
        preheader: welcome ? `${tutor.shortName} has booked your lesson. You can see it on ${tutor.pronouns.possessive} website.` : `${lessonName} · ${when}`,
        intro: byTeacher
          ? `${hello(first, tutor)} ${tutor.shortName} has booked ${welcome?.neverIn ? "your next lesson" : "this lesson for you"}.${website} ${CALENDAR_ATTACHED}`
          : `${hello(first, tutor)} your lesson with ${tutor.shortName} is ${paid ? "paid and confirmed" : "confirmed"}. ${CALENDAR_ATTACHED}`,
        hero: when,
        rows: lessonRows({ lesson, place, meetingUrl, reference, price }),
        steps: welcome ? welcomeSteps(welcome) : null,
        action: welcome ? welcomeAction(welcome) : manageUrl ? { label: MANAGE_LABEL, url: manageUrl } : null,
        footer: footer(policyFooter(policy, { notice, fee, tutor }))
      }
    };
  }

  const times = run.twoTimes ? "these two times are" : "the same time is";
  const plainSlot = byTeacher && !run.oneOff && run.slot;
  // Hers either way; with no one time to state, its dates are listed below.
  const intro = byTeacher && !run.oneOff
    ? `${hello(first, tutor)} ${tutor.shortName} has booked a weekly lesson for you.${run.fixed ? " Every lesson is in the calendar attachment." : ""}${website}`
    : run.oneOff
      ? `${hello(first, tutor)} your lessons with ${tutor.shortName} are confirmed. Every date is in the calendar attachment.`
      : `${hello(first, tutor)} ${times} now kept for you each week. ${run.fixed ? "Every lesson is" : "Your lessons so far are"} in the calendar attachment.`;
  // A slot Inês set up reads as one bullet, its day and time over its facts,
  // as the welcome writes a run (12 October 2026, Dan: simple to understand).
  const { amount, terms } = priceParts(price);
  const rows = plainSlot
    ? [
        {
          lesson: true,
          label: `Every ${run.slot.weekday}, ${run.slot.time}${run.fixed ? ` · ${run.count} lessons` : ""}`,
          value: [lessonLine({ lesson, place, amount }), ...(run.fixed ? [] : ["New weeks are added automatically until the slot is stopped"])].join("\n")
        },
        ...(terms ? [{ fact: terms }] : [])
      ]
    : runRows({ lesson, place, price, repeats: run.repeats, occurrences: run.occurrences,
        newWeeks: run.oneOff || run.fixed ? "" : "New weeks are added to your lesson calendar automatically, with no confirmation email" });
  return {
    subject: byTeacher
      ? `${tutor.shortName} has booked your weekly ${tutor.language.name} lessons — from ${shortWhen}`
      : `Your ${run.oneOff ? "" : "weekly "}${tutor.language.name} lessons are booked — from ${shortWhen}`,
    content: {
      heading: run.oneOff ? "Your lessons are booked" : "Your weekly lessons are booked",
      preheader: `${lessonName} · ${run.repeats.value}`,
      intro,
      callout: run.skippedNote,
      hero: when,
      rows,
      steps: welcome ? welcomeSteps(welcome) : null,
      action: welcome ? welcomeAction(welcome) : { label: ALL_LESSONS_LABEL, url: lessonsUrl },
      footer: footer(policyFooter(policy, { notice, fee, run: true, tutor }))
    }
  };
}

/**
 * 03 04 07 08 17 — Inês's copy of a booking: a student's, one she added, or
 * an open-ended run carried forward (`extended`).
 */
export function lessonBookedTeacher({ student, byTeacher, held = false, noEmailYet = false, welcome = null, lesson, lessonName, place, meetingUrl, reference,
  when, heroNote = "", shortWhen, paidAmount = "", calendarAttached = true, run = null, extended = false, again = false, restored = false }) {
  const name = student.name;
  // Her copy of a lesson she put back goes only for its calendar file, before Google Calendar is connected.
  if (!run && restored) {
    return {
      subject: `You put a lesson back — ${name}, ${shortWhen}`,
      content: {
        heading: "You put a lesson back",
        preheader: `${name} · ${lessonName} · ${when}`,
        intro: `${emailedLine(name, { held, noEmailYet, welcome: null })} ${CALENDAR_UPDATED}`,
        hero: when,
        heroNote,
        rows: [...lessonRows({ lesson, place, meetingUrl, reference }), ...studentRows(student)],
        footer: SIGN_OFF
      }
    };
  }
  if (!run) {
    // `again`: a lesson the student cancelled, booked again from its link (10 November 2026).
    return {
      subject: byTeacher ? `You added a lesson — ${name}, ${shortWhen}` : again ? `Booked again after cancelling — ${name}, ${shortWhen}` : `New booking — ${name}, ${shortWhen}`,
      content: {
        heading: byTeacher ? "You added a lesson" : again ? "Booked again" : "New booking",
        preheader: `${name} · ${lessonName} · ${when}`,
        intro: byTeacher
          ? emailedLine(name, { held, noEmailYet, welcome })
          // The invitation carries PARTSTAT=ACCEPTED: there is nothing to accept.
          : `${name} ${again ? "cancelled this lesson and has booked it again" : "has booked a lesson"}. ${calendarAttached ? "The attached invitation goes straight into your calendar." : "It is in your calendar."}`,
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
    : byTeacher
      ? `You added a weekly slot — ${name}, from ${shortWhen}`
      : `${run.oneOff ? "Lesson bookings" : "Weekly booking"} — ${name}, from ${shortWhen}`;
  return {
    subject,
    content: {
      heading: extended ? "Weekly lessons extended" : byTeacher ? "You added weekly lessons" : run.oneOff ? "New bookings" : "New weekly booking",
      preheader: `${name} · ${run.repeats.value}`,
      intro: extended
        ? `${name}'s weekly slot has no end date, so new lessons were added. They will appear in your calendar.`
        : byTeacher
          ? `${emailedLine(name, { held, noEmailYet, welcome })} Every lesson will appear in your calendar.`
          : `${name} booked ${run.oneOff ? "these lessons" : run.twoTimes ? "two times each week" : "the same slot each week"}. Every lesson will appear in your calendar.`,
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
export function lessonReminder({ tutor = currentTutor(), first, lessonName, lesson, place, reference, when, shortWhen, meetingUrl = "", meetComing = false,
  manageUrl, cutoff = "", policy = "card", fee = "", linkOnly = false }) {
  const manage = manageUrl ? { label: MANAGE_LABEL, url: manageUrl } : null;
  if (linkOnly) {
    return {
      subject: "Your online lesson link",
      content: {
        heading: "Your online lesson link",
        preheader: "Join your lesson from your email or booking.",
        intro: `${hello(first, tutor)} here is the Google Meet link for your lesson with ${tutor.shortName}.`,
        hero: when,
        rows: [...(lesson ? [{ fact: lessonLine({ lesson, place: "Online" }) }] : []), { label: "Reference", value: reference }],
        action: { label: JOIN_LABEL, url: meetingUrl },
        ...(manage ? { link: manage } : {}),
        footer: "The link is also in your booking."
      }
    };
  }
  // The cut-off is where the change policy starts charging: always the moment
  // that is true, with no "today" or "tomorrow".
  const footer = policy === "free"
    ? [`Need to change or cancel it? Please do so by ${cutoff}.`]
    : [`Free to change or cancel until ${cutoff}.`, policy === "paid" ? "After that, it can’t be changed or refunded." : `${fee} to move or cancel later.`];
  return {
    subject: `Your lesson is coming up — ${shortWhen}`,
    content: {
      heading: "Your lesson is coming up",
      preheader: `${lessonName} · ${meetingUrl ? "Your Google Meet link is in this email." : place}`,
      intro: `${hello(first, tutor)} your lesson with ${tutor.shortName} is coming up.`,
      hero: when,
      rows: [
        { fact: lessonLine({ lesson, place }) },
        ...(!meetingUrl && meetComing ? [{ fact: "We’ll email you its Google Meet link as soon as it’s ready", quiet: true }] : []),
        { label: "Reference", value: reference }
      ],
      // Coral marks the one thing still to do: join, when there is a link.
      action: meetingUrl ? { label: JOIN_LABEL, url: meetingUrl } : manage,
      ...(meetingUrl && manage ? { link: manage } : {}),
      footer
    }
  };
}

/* ------------------------------------------------------------------ moved */

/** "90 minutes and online": a list in words. */
function inWords(parts) {
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
}

/*
 * Her one change of when, how long and where (10 November 2026), as it now is
 * for the student and as it was for her. `change` is { time | slot, minutes,
 * place } for what changed, `from*` for what it was.
 */
function placeWords(place, tutor) {
  return place === "online" ? "online" : `in person in ${tutor.place.city}`;
}

function nowWords(change, tutor, { run = false } = {}) {
  const parts = [
    ...(run ? change.slot ? [`on ${change.slot.weekday}s at ${change.slot.time}`] : [] : change.time ? ["at a new time"] : []),
    ...(change.minutes ? [`${change.minutes} minutes`] : []),
    ...(change.place ? [placeWords(change.place, tutor)] : [])
  ];
  const moved = run ? change.slot : change.time;
  return `${inWords(parts)}${moved ? "" : run ? ", at the same times" : ", at the same time"}`;
}

/** A run's lessons her change left as they were. */
function teacherKeptNote(kept) {
  if (!kept) return "";
  return kept.count === 1 ? " One lesson stays as it was." : ` ${kept.count} lessons stay as they were.`;
}

/** Only her move of one lesson's time keeps the words it always had. */
function onlyTime(change) {
  return Boolean(change?.time && !change.minutes && !change.place);
}

/** What a student is told when Inês changes a lesson: it costs nothing, and how to answer a time that doesn't suit. */
function herChange(tutor, { time = true } = {}) {
  const free = `No charge for a change ${tutor.pronouns.subject} makes.`;
  return time ? [free, "If the new time doesn’t suit you, choose another or reply to this email."] : free;
}

/** 11 12 15 — a student's lesson (or weekly run) has moved or changed length. */
export function studentMoved({ tutor = currentTutor(), first, byTeacher, lengthChanged = false, minutes, lesson, lessonName, place, meetingUrl, reference, when, shortWhen,
  price, lateNote = "", policy, notice, fee, manageUrl, lessonsUrl, welcome = null, run = null, change = null }) {
  if (run && byTeacher && change) {
    return {
      subject: `${tutor.shortName} has changed your weekly lessons — from ${shortWhen}`,
      content: {
        heading: "Your weekly lessons have changed",
        preheader: `${lessonName} · ${run.repeats.value}`,
        intro: `${hello(first, tutor)} ${tutor.shortName} has changed your weekly lessons: they’re now ${nowWords(change, tutor, { run: true })}.${teacherKeptNote(run.kept)} The updated lessons are in the calendar attachment.`,
        hero: when,
        rows: [...runRows({ lesson, place, price, repeats: run.repeats, occurrences: run.occurrences }), ...keptRows(run.kept)],
        action: welcome ? welcomeAction(welcome) : { label: ALL_LESSONS_LABEL, url: lessonsUrl },
        footer: herChange(tutor, { time: false })
      }
    };
  }
  if (!run && byTeacher && change && !onlyTime(change)) {
    return {
      subject: `${tutor.shortName} has changed your lesson — ${shortWhen}`,
      content: {
        heading: "Your lesson has changed",
        preheader: `${lessonName} · ${when}`,
        intro: `${hello(first, tutor)} ${tutor.shortName} has changed your lesson: it’s now ${nowWords(change, tutor)}. ${CALENDAR_UPDATED}`,
        hero: when,
        rows: lessonRows({ lesson, place, meetingUrl, reference, price }),
        action: manageUrl ? { label: MANAGE_LABEL, url: manageUrl } : null,
        footer: herChange(tutor, { time: Boolean(change.time) })
      }
    };
  }
  if (run) {
    // Inês changed how long they are (9 November 2026, Dan), at the same times.
    const longer = byTeacher && lengthChanged;
    return {
      subject: longer ? `${tutor.shortName} has changed your lessons to ${minutes} minutes — from ${shortWhen}` : `Your weekly ${tutor.language.name} lessons have moved — from ${shortWhen}`,
      content: {
        heading: longer ? `Your lessons are now ${minutes} minutes` : "Your weekly lessons have moved",
        preheader: `${lessonName} · ${run.repeats.value}`,
        intro: longer
          ? `${hello(first, tutor)} ${tutor.shortName} has changed their length only: the times stay the same. The updated lessons are in the calendar attachment.`
          : `${hello(first, tutor)} your weekly lessons with ${tutor.shortName} have a new time.${keptNote(run.kept, "move")} The updated dates are in the calendar attachment.`,
        callout: run.skippedNote,
        hero: when,
        rows: [...runRows({ lesson, place, price, repeats: run.repeats, occurrences: run.occurrences }), ...keptRows(run.kept)],
        action: welcome ? welcomeAction(welcome) : { label: ALL_LESSONS_LABEL, url: lessonsUrl },
        footer: welcome ? [...policyFooter(policy, { notice, fee, run: true, tutor }), welcomeLine(tutor)] : policyFooter(policy, { notice, fee, run: true, tutor })
      }
    };
  }
  // Written for someone who did not ask for this when Inês moved it.
  const intro = byTeacher && lengthChanged
    ? `${hello(first, tutor)} ${tutor.shortName} has changed its length only: the time stays the same. ${CALENDAR_UPDATED}`
    : byTeacher
      ? `${hello(first, tutor)} ${tutor.shortName} has moved your lesson. ${CALENDAR_UPDATED}`
      : lengthChanged
        ? `${hello(first, tutor)} your lesson with ${tutor.shortName} is now ${minutes} minutes. ${CALENDAR_UPDATED}`
        : `${hello(first, tutor)} your lesson with ${tutor.shortName} has a new time. ${CALENDAR_UPDATED}`;
  return {
    subject: byTeacher && lengthChanged ? `${tutor.shortName} has changed your lesson to ${minutes} minutes — ${shortWhen}`
      : byTeacher ? `${tutor.shortName} has moved your lesson — now ${shortWhen}` : lengthChanged ? `Your lesson has changed — ${shortWhen}` : `Your lesson has moved — ${shortWhen}`,
    content: {
      heading: lengthChanged ? "Your lesson has changed" : "Your lesson has moved",
      preheader: `${lessonName} · ${when}`,
      intro,
      callout: byTeacher ? "" : lateNote,
      hero: when,
      rows: lessonRows({ lesson, place, meetingUrl, reference, price }),
      action: manageUrl ? { label: MANAGE_LABEL, url: manageUrl } : null,
      // A late move on a saved card states its fee in the note, so the footer adds only what it doesn't say.
      // With nothing to pay for a change, the button is the way to change it again.
      footer: byTeacher ? herChange(tutor, { time: !lengthChanged })
        : policy === "late" ? "This fee applies once per lesson."
        : policy === "again" ? manageUrl ? [] : ["You can move or cancel it again from your lesson calendar."]
        : policyFooter(policy, { notice, fee, tutor })
    }
  };
}

/** 13 14 16 — Inês's copy of a move: the student's, her own, or a weekly run's. */
export function lessonMovedTeacher({ tutor = currentTutor(), student, byTeacher, held = false, lengthChanged = false, fromMinutes, minutes, previousWhen = "", late = false,
  lateNote = "", notice, lesson, lessonName, place, meetingUrl, reference, when, heroNote = "", shortWhen, run = null, change = null }) {
  const name = student.name;
  const told = (who = name) => `${who} ${held ? who === "They" ? "haven't been emailed yet" : "hasn't been emailed yet" : who === "They" ? "have been told" : "has been told"}, and your calendar has been updated.`;
  // What the lesson was, on her clock, beside what it is now: its date, place and length as they changed.
  const before = ({ time = false, place: from = "", length = false }) => [
    time && previousWhen ? listDate(previousWhen) : "",
    from ? from === "online" ? "Online" : `In ${tutor.place.city}` : "",
    length && fromMinutes ? `${fromMinutes} minutes` : ""
  ].filter(Boolean).join(" · ");
  if (run && byTeacher && change) {
    return {
      subject: `You changed ${name}'s weekly lessons — from ${shortWhen}`,
      content: {
        heading: "You changed these lessons",
        preheader: `${name} · ${run.repeats.value}`,
        intro: `${name}'s lessons are now ${nowWords(change, tutor, { run: true })}.${teacherKeptNote(run.kept)} ${told("They")}`,
        hero: when,
        rows: [...runRows({ lesson, place, repeats: run.repeats, occurrences: run.occurrences, forTeacher: true }), ...keptRows(run.kept), ...studentRows(student)],
        footer: SIGN_OFF
      }
    };
  }
  if (!run && byTeacher && change && !onlyTime(change)) {
    return {
      subject: `You changed ${name}'s lesson — ${shortWhen}`,
      content: {
        heading: "You changed this lesson",
        preheader: `${name} · ${lessonName} · ${when}`,
        intro: told(),
        hero: when,
        heroNote,
        rows: [...lessonRows({ lesson, place, meetingUrl, reference,
          before: before({ time: change.time, place: change.place ? change.fromPlace : "", length: Boolean(change.minutes) }) }), ...studentRows(student)],
        footer: SIGN_OFF
      }
    };
  }
  if (run) {
    const longer = byTeacher && lengthChanged;
    return {
      subject: longer ? `You changed ${name}'s lessons to ${minutes} minutes — from ${shortWhen}` : `Weekly slot moved — ${name}, from ${shortWhen}`,
      content: {
        heading: longer ? "You changed these lessons" : "Weekly lessons moved",
        preheader: `${name} · ${run.repeats.value}`,
        intro: longer
          ? `${name}'s lessons are now ${minutes} minutes. ${told("They")}`
          : `${name} moved their weekly lessons.${keptNote(run.kept, "move")} The updated lessons will appear in your calendar.`,
        callout: run.skippedNote,
        hero: when,
        rows: [...runRows({ lesson, place, repeats: run.repeats, occurrences: run.occurrences, forTeacher: true }), ...keptRows(run.kept), ...studentRows(student)],
        footer: SIGN_OFF
      }
    };
  }
  return {
    subject: byTeacher && lengthChanged
      ? `You changed ${name}'s lesson to ${minutes} minutes — ${shortWhen}`
      : byTeacher
      ? `You moved ${name}'s lesson — ${shortWhen}`
      : lengthChanged ? `Lesson changed — ${name}, ${shortWhen}` : `${late ? "Late change" : "Lesson moved"} — ${name}, ${shortWhen}`,
    content: {
      heading: byTeacher && lengthChanged ? "You changed this lesson" : byTeacher ? "You moved this lesson" : lengthChanged ? "Lesson changed" : late ? `Moved less than ${notice} before` : "Lesson moved",
      preheader: `${name} · ${lessonName} · ${when}`,
      intro: byTeacher
        ? told()
        : lengthChanged
          ? `${name} changed their lesson to ${minutes} minutes${previousWhen ? " and moved it" : ""}. Your calendar has been updated.`
          : `${name} moved their lesson. Your calendar has been updated.`,
      callout: lateNote,
      hero: when,
      heroNote,
      rows: [...lessonRows({ lesson, place, meetingUrl, reference,
        before: before({ time: !(byTeacher && lengthChanged), length: lengthChanged }) }), ...studentRows(student)],
      footer: SIGN_OFF
    }
  };
}

/* -------------------------------------------------------------- cancelled */

/** What a student is told when Inês cancels: it costs nothing, and, with no message of hers, how to rebook. */
function herCancellation(tutor, message) {
  const free = `A cancellation ${tutor.shortName} makes never costs you anything.`;
  return message ? free : [free, "Reply to this email to arrange another time."];
}
const BOOK_AGAIN = "You can book again any time on the website.";

/** 18 19 22 — a student's lesson, or the rest of their weekly run, is cancelled. */
export function studentCancelled({ tutor = currentTutor(), first, byTeacher, message = "", note = "", lesson, lessonName, place, reference, when, shortWhen, run = null }) {
  if (run) {
    return {
      subject: byTeacher ? `${tutor.shortName} has cancelled your weekly lessons — ${run.count}` : `Your weekly lessons are cancelled — ${run.count}`,
      content: {
        heading: "Your weekly lessons are cancelled",
        preheader: `${run.count} removed from your calendar.`,
        intro: byTeacher
          ? `${hello(first, tutor)} ${tutor.shortName} has cancelled these lessons${message ? " and left you a message" : ""}. ${CALENDAR_CANCELLED}`
          : `${hello(first, tutor)} the rest of your weekly lessons with ${tutor.shortName} are removed from your calendar.${keptNote(run.kept, "cancel")}`,
        message: byTeacher && message ? { label: `Message from ${tutor.shortName}`, body: message } : null,
        // No date panel here, so the list's title names the clock.
        rows: [{ title: run.zone ? `Cancelled · ${run.zone}` : "Cancelled" }, ...dateFacts(run.dates), ...keptRows(run.kept)],
        footer: byTeacher ? herCancellation(tutor, message) : BOOK_AGAIN
      }
    };
  }
  return {
    subject: byTeacher ? `${tutor.shortName} has cancelled your lesson on ${shortWhen}` : `Your lesson on ${shortWhen} is cancelled`,
    content: {
      heading: "Your lesson is cancelled",
      preheader: `${lessonName} · ${when}`,
      intro: byTeacher
        ? `${hello(first, tutor)} ${tutor.shortName} has cancelled this lesson${message ? " and left you a message" : ""}. ${CALENDAR_CANCELLED}`
        : `${hello(first, tutor)} your lesson with ${tutor.shortName} has been removed from your calendar.`,
      message: message ? { label: `Message from ${tutor.shortName}`, body: message } : null,
      callout: note,
      hero: when,
      rows: lessonRows({ lesson, place, reference, cancelled: true }),
      footer: byTeacher ? herCancellation(tutor, message) : BOOK_AGAIN
    }
  };
}

/** 20 21 23 — Inês's copy of a cancellation. */
export function lessonCancelledTeacher({ student, byTeacher, held = false, late = false, notice, note = "", message = "", lesson, lessonName, place,
  reference, when, heroNote = "", shortWhen, run = null }) {
  const name = student.name;
  if (run) {
    return {
      subject: byTeacher ? `You cancelled ${name}'s weekly lessons — ${run.count}` : `Weekly run cancelled — ${name}, ${run.count}`,
      content: {
        heading: byTeacher ? "You cancelled these lessons" : "Weekly lessons cancelled",
        preheader: `${name} · ${run.count}`,
        intro: byTeacher
          ? `${name} ${held ? "hadn't been emailed about these lessons" : "has been told"}, and they are off your calendar.`
          : `${name} cancelled the rest of their weekly lessons. They are off your calendar.${keptNote(run.kept, "cancel")}`,
        message: byTeacher && message ? { label: "Your message to the student", body: message } : null,
        rows: [{ title: run.zone ? `Cancelled · ${run.zone}` : "Cancelled" }, ...dateFacts(run.dates), ...keptRows(run.kept), ...studentRows(student, { withPhone: false })],
        footer: SIGN_OFF
      }
    };
  }
  return {
    subject: byTeacher ? `You cancelled ${name}'s lesson — ${shortWhen}` : `${late ? "Late cancellation" : "Cancellation"} — ${name}, ${shortWhen}`,
    content: {
      heading: byTeacher ? "You cancelled this lesson" : late ? `Cancelled less than ${notice} before` : "Lesson cancelled",
      preheader: `${name} · ${lessonName} · ${when}`,
      intro: byTeacher
        ? `${name} ${held ? "hadn't been emailed about this lesson" : "has been told"}, and the lesson is off your calendar.`
        : `${name} cancelled their lesson. It is off your calendar.`,
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

/**
 * 24 25 27 — the student's receipt for a charge to their saved card; the line
 * item varies. The introduction states the amount and the card, so the facts
 * are the lesson it was for, the reference and the NIF.
 */
export function paymentReceipt({ tutor = currentTutor(), first, item, amount, lesson, lessonName, shortWhen, reference, nif = "", noticeHours }) {
  const fee = item === "fee";
  const heading = fee ? "Your late change fee is paid" : item === "no-show" ? "Your no-show fee is paid" : "Your lesson is paid";
  return {
    subject: fee ? `Late change fee paid — ${reference}` : `${heading} — ${shortWhen}`,
    content: {
      heading,
      preheader: fee ? `${lessonName} · ${amount}` : `${lessonName} · ${amount} charged to your saved card`,
      intro: fee
        ? `${hello(first, tutor)} your saved card was charged ${amount} for moving or cancelling this lesson less than ${noticeHours} hours before it.`
        : item === "no-show"
          ? `${hello(first, tutor)} ${tutor.shortName} marked this lesson as a no-show. Your saved card was charged ${amount} instead of the lesson price.`
          : `${hello(first, tutor)} your lesson is finished. ${amount} was charged to your saved card.`,
      callout: fee ? "You will not be charged this fee again for the same lesson." : "",
      rows: [
        { fact: lessonLine({ lesson, when: shortWhen }) },
        { label: "Reference", value: reference },
        // Lets the student check the number before Inês issues the receipt.
        ...(nif ? [{ label: "NIF", value: `${nif} · on your receipt from ${tutor.shortName}` }] : [])
      ],
      footer: SIGN_OFF
    }
  };
}

/**
 * 26 28 — Inês is told a payment arrived, to issue its fiscal document today.
 * Subject, heading and preheader are read by her receipt automation, and the
 * note's words name the document she issues, so they are kept too, as is
 * the labelled Lesson row her records have always had.
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

/** 29 30 — the saved card was declined: a secure link to pay. The amount is in the introduction and on the button. */
export function paymentFailed({ tutor = currentTutor(), first, item, amount, lesson, lessonName, shortWhen, reference, payUrl }) {
  return {
    subject: `${item === "fee" ? "Late change fee" : item === "no-show" ? "No-show fee" : "Lesson payment"} — the card didn't go through`,
    content: {
      heading: "The card didn't go through",
      preheader: `${lessonName} · ${amount} still to pay`,
      intro: `${hello(first, tutor)} we couldn't charge the ${amount} ${ITEM[item]} to your saved card. Please pay with the secure button.`,
      rows: [
        { fact: lessonLine({ lesson, when: shortWhen }) },
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
export function welcome({ tutor = currentTutor(), first, welcome, book, free, rows }) {
  return {
    subject: book ? `Book your next lesson with ${tutor.shortName}` : `Your lessons with ${tutor.shortName}`,
    content: {
      heading: book ? "Book your next lesson" : "Your lessons",
      preheader: book
        ? `You can now book your lessons on ${tutor.shortName}’s website.`
        : `Your lessons are now on ${tutor.shortName}’s website.`,
      // One sentence: who it is from, why, and the website by name.
      intro: book
        ? `${hello(first, tutor)} you can now book your lessons with ${tutor.shortName} on ${tutor.pronouns.possessive} website, ${tutor.site.domain}.`
        : `${hello(first, tutor)} your lessons with ${tutor.shortName} are now on ${tutor.pronouns.possessive} website, ${tutor.site.domain}.`,
      callout: free ? "Your lessons are free: there’s no card to add and nothing to pay." : "",
      rows,
      steps: welcomeSteps(welcome, { book }),
      action: welcomeAction(welcome, { book }),
      footer: welcomeFooter(tutor)
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
export function dormantInvite({ tutor = currentTutor(), subject, message, signInUrl = "", bookUrl }) {
  return {
    subject,
    content: {
      heading: "Book your next lesson",
      preheader: `Choose a time on ${tutor.shortName}’s website.`,
      intro: message,
      action: signInUrl ? { label: "Choose a time", url: signInUrl } : { label: "Book a lesson", url: bookUrl },
      footer: signInUrl ? welcomeFooter(tutor) : `Reply to this email to write to ${tutor.shortName}.`
    }
  };
}

/* ---------------------------------------------------------------- account */

/*
 * An account email is one sentence of what the button does, then at its foot
 * how long the button works and what to do if the reader did not ask.
 */

/** 36 */
export function signInLink({ tutor = currentTutor(), first, url }) {
  return {
    subject: `Your sign-in link — ${tutor.brand}`,
    content: {
      heading: "Sign in",
      preheader: "Press the button to sign in. It works for 30 minutes.",
      intro: `${hello(first, tutor)} press the button to sign in.`,
      action: { label: "Sign in", url },
      footer: ["The button works for 30 minutes, and only once.", NOT_YOU]
    }
  };
}

/** 37 */
export function passwordReset({ tutor = currentTutor(), first, url }) {
  return {
    subject: `Reset your password — ${tutor.brand}`,
    content: {
      heading: "Reset your password",
      preheader: "Choose a new password. The button works for one hour.",
      intro: `${hello(first, tutor)} press the button to choose a new password.`,
      action: { label: "Choose a new password", url },
      footer: ["The button works for one hour, and only once.", `${NOT_YOU} Your password has not changed.`]
    }
  };
}

/** 38 — to the new address. */
export function emailChangeConfirm({ tutor = currentTutor(), first, email, url }) {
  return {
    subject: `Confirm your new email — ${tutor.brand}`,
    content: {
      heading: "Confirm this address",
      preheader: "One click, and this becomes the address you sign in with.",
      intro: `${hello(first, tutor)} confirm this address to sign in with it and get your lesson emails here.`,
      rows: [{ label: "New address", value: email }],
      action: { label: "Confirm this address", url },
      footer: ["The button works for one hour, and only once.", `${NOT_YOU} Nothing has changed.`]
    }
  };
}

/** 39 — to the address on file, the one that would notice a change nobody asked for. */
export function emailChangeNotice({ tutor = currentTutor(), first, email }) {
  return {
    subject: `Someone asked to change your email — ${tutor.brand}`,
    content: {
      heading: "A change was requested",
      preheader: "Your address has not changed yet.",
      intro: `${hello(first, tutor)} someone signed in to your account and asked to change its email address.`,
      callout: `If this wasn't you, change your password now and tell ${tutor.shortName}.`,
      rows: [{ label: "Requested address", value: email }, { fact: "Nothing has changed yet. It changes only if that address confirms it." }],
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
      intro: `${name} has sent you their homework. Check the marks and send your feedback.`,
      rows: [
        ...(title ? [{ label: "Sheet", value: title }] : []),
        ...(when ? [{ label: "Lesson", value: (({ date, time }) => time ? `${date}, ${time}` : date)(splitWhen(when)) }] : [])
      ],
      action: { label: "Review homework", url },
      footer: SIGN_OFF
    }
  };
}
