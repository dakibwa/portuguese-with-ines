/**
 * Transactional email.
 *
 * Resend is the provider; DRY_RUN records the message in email_log without
 * sending, so the whole flow is testable before her domain is verified.
 *
 * Sending is deliberately never allowed to fail a booking. A student who has
 * just picked a time must get a confirmed booking even if the mail provider is
 * having a bad afternoon — the failure is recorded in email_log for the
 * reconciliation sweep instead of being thrown back at them.
 */

import { isNoEmailYet, realEmail } from "./no-email.mjs";

const BRAND = {
  blue: "#203e82",
  ink: "#1a3169",
  paper: "#f5ecd9",
  paperLight: "#fbf4e5",
  lavender: "#aaa4e6",
  lavenderInk: "#554f91",
  lavenderWash: "#eeecf9",
  coralAction: "#b43a26",
  rule: "#ded8f0"
};

/**
 * Absolute, and on her own domain: an email is read long after it was sent and
 * far from the site, so nothing here can be a relative path. Rebuild it with
 * `npm run build:email-banner`.
 */
const BANNER_URL = "https://portuguesewithines.com/email/banner.png";

/**
 * The confirm step's splat dabs, one per fact, and Google Meet's mark beside a
 * lesson's call (10 October 2026, at Dan's request). Rebuild them with
 * `npm run build:email-icons`. Decorative, so blocked images leave nothing
 * behind but the facts themselves.
 */
const EMAIL_ASSETS = "https://portuguesewithines.com/email";
const DABS = ["dab-blue", "dab-lavender", "dab-coral", "dab-ink"].map(name => `${EMAIL_ASSETS}/${name}.png`);
const MEET_MARK = `${EMAIL_ASSETS}/google-meet.png`;
const SANS = "Montserrat,Arial,Helvetica,sans-serif";
/** One small label above a fact or a message, as the site labels its fields. */
const LABEL = `font:700 11px/1.4 ${SANS};letter-spacing:.1em;text-transform:uppercase;color:${BRAND.lavenderInk}`;
/** The panels (date, note, steps) share the date box's wash and hand-cut corners. */
const PANEL = `border-collapse:collapse;background:${BRAND.lavenderWash};border-radius:18px 12px 16px 14px`;

/**
 * "Tuesday, 13 October 2026 at 17:00, Porto time" read as two lines, the date
 * and then the time with its clock: the "at" said nothing the layout doesn't
 * (10 October 2026, at Dan's request). Anything else stays as it was given.
 */
export function splitWhen(value) {
  const match = /^(.+?) at (\d{1,2}:\d{2})(?:, (.+))?$/.exec(String(value ?? ""));
  if (!match) return { date: String(value ?? ""), time: "" };
  return {
    date: match[1].replace(/^([A-Za-z]+),/, "$1"),
    time: match[3] ? `${match[2]} · ${match[3]}` : match[2]
  };
}

function meetMark(size = 18) {
  return `<img src="${MEET_MARK}" width="${size}" height="${Math.round(size * 0.8)}" alt="" style="display:inline-block;border:0;vertical-align:-3px;margin-right:7px">`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escaped, then newlines turned into line breaks.
 *
 * Four fields used to be interpolated raw so that callers could pass `<br>` —
 * which meant a student's own name, email or lesson notes went into Inês's
 * inbox as markup. She is the one person who reads every one of these, so she
 * was the one person exposed. Callers now send "\n" and get a line break;
 * anything else they send arrives as text, which is what it is.
 */
function escapeRich(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

/*
 * Nothing left alone on a line (14 October 2026, Dan: the site's bullets and
 * calm). A date, a time and its clock, and a number and its word never break
 * inside, and a short line keeps its last two words together. HTML only: the
 * text part is exactly what the caller passed.
 *
 *   "text"  every rule: headings, intros, notes, steps, footers.
 *   "date"  all but the last two words: the date panel, where a line is a date.
 *   "row"   dates and clocks only. A row can hold a phone number, an email or a
 *           student's own notes, which the general number rule must never touch.
 */
const NBSP = "\u00a0";
function keepTogether(value, mode = "text") {
  return String(value ?? "").split(/\r?\n/).map((line) => {
    let tied = line.replace(/ · ([^·]+ time)$/, (_, clock) => `${NBSP}·${NBSP}${clock.replace(/ /g, NBSP)}`);
    if (mode !== "row") tied = tied.replace(/(\b\d{1,2}|€\d+(?:[.,]\d{2})?) (?=\S)/g, `$1${NBSP}`);
    tied = tied
      // A day keeps its month even in a row, where other numbers are left alone.
      .replace(/\b(\d{1,2}) (?=(?:January|February|March|April|May|June|July|August|September|October|November|December)\b)/g, `$1${NBSP}`)
      .replace(/\b([A-Z][a-z]+) (?=\d{4}\b)/g, `$1${NBSP}`)
      .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?=\d)/g, `$1${NBSP}`)
      .replace(/\bat (?=\d{1,2}:\d{2})/g, `at${NBSP}`);
    const last = tied.lastIndexOf(" ");
    if (mode === "text" && last > 0 && tied.length - tied.lastIndexOf(" ", last - 1) - 1 <= 30) {
      tied = `${tied.slice(0, last)}${NBSP}${tied.slice(last + 1)}`;
    }
    return tied;
  }).join("\n");
}

/** Escaped, with line breaks, kept together. */
function richTogether(value, mode = "text") {
  return escapeRich(keepTogether(value, mode)).replace(/\u00a0/g, "&nbsp;");
}

/** A fee in a footer fact reads in coral, as the site's payment facts do. */
function coralAmounts(html) {
  return html.replace(/€\d+(?:[.,]\d{2})?/g, (amount) => `<span class="pwi-amount" style="font-weight:700;color:${BRAND.coralAction};white-space:nowrap">${amount}</span>`);
}

/*
 * Dark mode (16 October 2026). The emails declare both schemes, so a client
 * that honours `prefers-color-scheme` (Apple Mail, iOS Mail, Outlook for Mac,
 * Thunderbird, Samsung) draws them on the site's dark blue with cream text
 * rather than inverting them by guesswork; Outlook.com's own dark mode is
 * steered through its `data-ogsc`/`data-ogsb` attributes. Gmail, which
 * ignores both, inverts on its own, so every coloured cell also carries a
 * `bgcolor` and every text an explicit colour: nothing inherits a background
 * that a client might change without changing the text on it.
 *
 * Phones (16 October 2026): under 480px the side margins and heading shrink
 * and the button fills the width. Clients without media queries keep the
 * fluid 560px card, which already fits a 390px screen.
 */
const DARK = {
  page: "#0f1a38",
  card: "#16264f",
  panel: "#223a73",
  text: "#f3ead7",
  heading: "#fbf4e5",
  label: "#c7c2f2",
  rule: "#34477d",
  amount: "#ff9d86"
};
const darkRules = `.pwi-page{background:${DARK.page}!important}
.pwi-card{background:${DARK.card}!important}
.pwi-panel{background:${DARK.panel}!important}
.pwi-text{color:${DARK.text}!important}
.pwi-h1,.pwi-date{color:${DARK.heading}!important}
.pwi-label,.pwi-quiet{color:${DARK.label}!important}
.pwi-link{color:${DARK.label}!important}
.pwi-rule{border-color:${DARK.rule}!important}
.pwi-amount{color:${DARK.amount}!important}
.pwi-step{background:${BRAND.lavender}!important;color:${DARK.card}!important}
.pwi-dab{filter:brightness(1.3) saturate(1.1)}`;
const STYLE = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
${darkRules}
}
${darkRules.split("\n").filter((rule) => !rule.startsWith(".pwi-dab")).map((rule) => `[data-ogsc] ${rule.replace(/,/g, ",[data-ogsc] ")}`).join("\n")}
@media only screen and (max-width:480px){
.pwi-outer{padding:16px 8px 28px!important}
.pwi-pad{padding-left:22px!important;padding-right:22px!important}
.pwi-h1{font-size:22px!important}
.pwi-panel-pad{padding:16px 18px!important}
.pwi-btn-wrap{width:100%!important}
.pwi-btn{padding:15px 18px!important}
}
</style>`;

const dab = (index) => `<img class="pwi-dab" src="${DABS[index % DABS.length]}" width="14" height="14" alt="" style="display:block;border:0">`;

/**
 * Short facts, one per row beside a dab and without a label, as the confirm
 * step's payment facts are. A table row each (never a padded div) so Outlook's
 * Word engine keeps the spacing; `dabTop` centres the 14px dab on the first line.
 */
function dabLines(lines, { font, colourClass = "pwi-text", dabTop, gap, first = 0 }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${lines
    .map((html, index) => `
          <tr>
            <td width="28" valign="top" style="width:28px;padding:${(index ? gap : 0) + dabTop}px 0 0;line-height:0">${dab(first + index)}</td>
            <td class="${colourClass}" valign="top" style="padding:${index ? gap : 0}px 0 0;font:${font};overflow-wrap:anywhere">${html}</td>
          </tr>`)
    .join("")}</table>`;
}

function safeMeetingLink(url) {
  return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url ?? "") ? url : null;
}

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** One section of the card: the same side margins everywhere, 24px between. */
const section = (html, { top = 24, align = "" } = {}) =>
  `<tr><td class="pwi-pad"${align ? ` align="${align}"` : ""} style="padding:${top}px 32px 0">${html}</td></tr>`;

/**
 * One email layout for every template, built to the constraints that bite:
 *
 * - Tables and inline styles carry the light design on their own. The one
 *   <style> block only adds dark mode and phone widths, so a client that
 *   strips it loses nothing it needs.
 * - Images are blocked by default in most clients, so the banner sits on a
 *   `bgcolor` that carries the brand on its own and has real alt text.
 * - A preheader controls the grey preview line in the inbox list. Without one,
 *   clients scrape the first visible text, which is usually the greeting.
 *
 * Sections, in order: heading and introduction, a message, the date panel, one
 * note, the facts, numbered steps, one button, one quiet link, the footer.
 */
function layout({ heading, preheader, intro, hero, heroNote, rows = [], callout, message, steps, action, link, footer }) {
  // Each fact is a line beside one of the confirm step's dabs, its label small
  // above it: a list to glance down rather than a ruled table.
  //   lesson  the label is the lesson's own short date, bold and sentence case
  //           ("Tue 3 Nov, 08:00"), as the booking confirmation names a run.
  //   quiet   a value that is only a promise ("Online link will appear ...").
  //   dates   one date per line, each its own paragraph so a wrapped date still
  //           reads as one item.
  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows
        .map(({ label, value, url, lesson, quiet, dates }, index) => {
          const meeting = safeMeetingLink(url);
          const valueFont = lesson || dates ? "400 14px/1.5" : "400 15px/1.5";
          const valueColour = quiet ? BRAND.lavenderInk : BRAND.ink;
          const valueClass = quiet ? "pwi-quiet" : "pwi-text";
          const above = index ? 14 : 0;
          const content = dates
            ? String(value ?? "")
                .split(/\r?\n/)
                .map((line, i) => `<p class="${valueClass}" style="margin:${i ? 4 : 2}px 0 0;font:${valueFont} ${SANS};color:${valueColour};overflow-wrap:anywhere">${richTogether(line, "row")}</p>`)
                .join("")
            : `<p class="${valueClass}" style="margin:2px 0 0;font:${valueFont} ${SANS};color:${valueColour};overflow-wrap:anywhere">${
                meeting
                  ? `<a class="pwi-link" href="${escapeHtml(url)}" style="color:${BRAND.blue};font-weight:700;text-decoration:underline">${meetMark()}${escapeRich(value)}</a>`
                  : richTogether(value, "row")
              }</p>`;
          return `
        <tr>
          <td width="28" valign="top" style="width:28px;padding:${above + (lesson ? 3 : 1)}px 0 0;line-height:0">${dab(index)}</td>
          <td valign="top" style="padding:${above}px 0 0">
            <p class="${lesson ? "pwi-text" : "pwi-label"}" style="margin:0;${lesson ? `font:600 15px/20px ${SANS};color:${BRAND.ink}` : LABEL}">${escapeHtml(label)}</p>
            ${content}
          </td>
        </tr>`;
        })
        .join("")}</table>`
    : "";
  const when = hero ? splitWhen(hero) : null;
  const meetingAction = action && safeMeetingLink(action.url);
  const footerFont = `400 13px/1.6 ${SANS};color:${BRAND.lavenderInk}`;

  return `<!doctype html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
${STYLE}
</head>
<body class="pwi-page" style="margin:0;padding:0;background:${BRAND.paper};-webkit-text-size-adjust:100%;text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;mso-hide:all">${escapeHtml(
    preheader ?? ""
  )}</div>
<table class="pwi-page" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.paper}" style="background:${BRAND.paper};border-collapse:collapse">
  <tr><td class="pwi-outer" align="center" style="padding:28px 14px 40px">
    <table class="pwi-card" role="article" aria-label="${escapeHtml(heading)}" width="560" cellpadding="0" cellspacing="0" bgcolor="${BRAND.paperLight}" style="width:100%;max-width:560px;border-collapse:collapse;background:${BRAND.paperLight};border-radius:16px;overflow:hidden">

      <tr><td bgcolor="${BRAND.blue}" style="background:${BRAND.blue};line-height:0">
        <img src="${BANNER_URL}" width="560" alt="Português com a Inês" style="display:block;width:100%;max-width:560px;height:auto;border:0;color:#ffffff;font:600 18px/1.4 ${SANS}">
      </td></tr>

      ${section(`<h1 class="pwi-h1" style="margin:0;font:600 24px/1.25 ${SANS};letter-spacing:-.01em;color:${BRAND.ink};overflow-wrap:anywhere">${richTogether(heading)}</h1>
        <p class="pwi-text" style="margin:12px 0 0;font:400 15px/1.65 ${SANS};color:${BRAND.ink};overflow-wrap:anywhere">${richTogether(intro)}</p>`, { top: 30 })}

      ${message?.body?.trim()
        ? section(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr><td style="border-left:4px solid ${BRAND.lavender};padding:2px 0 2px 18px;overflow-wrap:anywhere;word-break:break-word">
            <p class="pwi-label" style="margin:0;${LABEL}">${escapeHtml(message.label)}</p>
            <p class="pwi-text" style="margin:8px 0 0;font:400 15px/1.65 ${SANS};color:${BRAND.ink}">${escapeRich(message.body)}</p>
          </td></tr>
        </table>`) : ""}

      ${
        when
          ? section(`<table class="pwi-panel" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.lavenderWash}" style="${PANEL}">
          <tr><td class="pwi-panel-pad" style="padding:18px 22px;overflow-wrap:anywhere">
            <p class="pwi-date" style="margin:0;font:600 19px/1.35 ${SANS};color:${BRAND.blue}">${richTogether(when.date, "date")}</p>
            ${when.time ? `<p class="pwi-text" style="margin:3px 0 0;font:400 16px/1.45 ${SANS};color:${BRAND.ink}">${richTogether(when.time, "date")}</p>` : ""}
            ${
              // The student's own time, a labelled fact inside the panel (Inês's copies).
              heroNote
                ? `<p class="pwi-label" style="margin:14px 0 0;${LABEL}">${escapeHtml(heroNote.label)}</p>
            <p class="pwi-text" style="margin:2px 0 0;font:400 14px/1.5 ${SANS};color:${BRAND.ink}">${richTogether(heroNote.value, "date")}</p>`
                : ""
            }
          </td></tr>
        </table>`)
          : ""
      }

      ${
        // One note is one coral dab, not a second panel: the lesson's date is the panel.
        callout ? section(dabLines([richTogether(callout)], { font: `400 15px/1.6 ${SANS};color:${BRAND.ink}`, dabTop: 5, gap: 0, first: 2 })) : ""
      }

      ${rowsHtml ? section(rowsHtml) : ""}

      ${
        // What to do next, numbered, right above the one button that does it
        // (12 October 2026, Dan: the first email a student Inês brings gets
        // should be beautiful and simple to understand).
        steps?.items?.length
          ? section(`<table class="pwi-panel" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.lavenderWash}" style="${PANEL}">
          <tr><td class="pwi-panel-pad" style="padding:18px 22px 6px">
            <p class="pwi-date" style="margin:0;font:600 16px/1.4 ${SANS};color:${BRAND.blue}">${escapeHtml(steps.title)}</p>
          </td></tr>
          ${steps.items
            .map(
              (item, index) => `<tr><td style="padding:10px 22px ${index === steps.items.length - 1 ? 18 : 0}px">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
              <td width="26" valign="top" style="width:26px;padding-top:1px">
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>
                  <td class="pwi-step" width="22" height="22" align="center" bgcolor="${BRAND.blue}" style="width:22px;height:22px;background:${
                    BRAND.blue
                  };border-radius:11px;font:700 12px/22px ${SANS};color:#ffffff">${index + 1}</td>
                </tr></table>
              </td>
              <td class="pwi-text" valign="top" style="padding-left:10px;font:400 15px/1.55 ${SANS};color:${BRAND.ink};overflow-wrap:anywhere">${richTogether(item)}</td>
            </tr></table>
          </td></tr>`
            )
            .join("")}
        </table>`)
          : ""
      }

      ${
        action
          ? section(`<table class="pwi-btn-wrap" role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate">
          <tr><td bgcolor="${BRAND.coralAction}" style="background:${BRAND.coralAction};border-radius:24px 16px 22px 18px" align="center">
            <a class="pwi-btn" href="${escapeHtml(action.url)}" style="display:block;padding:15px 30px;font:700 15px/1.2 ${SANS};letter-spacing:.02em;color:#ffffff;text-decoration:none;border-radius:24px 16px 22px 18px">${
              meetingAction ? `<span style="display:inline-block;background:#ffffff;border-radius:6px;padding:3px 4px 2px;margin-right:9px;vertical-align:middle;line-height:0">${meetMark(18).replace("margin-right:7px", "margin:0")}</span>` : ""
            }${escapeHtml(action.label)}</a>
          </td></tr>
        </table>`, { top: 30, align: "center" })
          : ""
      }

      ${
        // A rare action under the one button, quiet and underlined (14 October
        // 2026): the day-before reminder's "Change or cancel this lesson" when
        // its button is Join Google Meet. The padding makes a 45px tap target.
        link
          ? section(`<a class="pwi-link" href="${escapeHtml(link.url)}" style="display:inline-block;padding:12px 8px;font:600 14px/1.5 ${SANS};color:${BRAND.blue};text-decoration:underline">${escapeHtml(link.label)}</a>`, { top: 10, align: "center" })
          : ""
      }

      <tr><td class="pwi-pad" style="padding:32px 32px 30px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr><td class="pwi-rule" style="border-top:1px solid ${BRAND.rule};padding-top:18px">
            ${
              // Short facts are the confirm step's dabs; a sign-off stays a sentence.
              Array.isArray(footer)
                ? dabLines(footer.filter(Boolean).map((fact) => coralAmounts(richTogether(fact))), { font: footerFont, colourClass: "pwi-quiet", dabTop: 3, gap: 8 })
                : footer
                  ? `<p class="pwi-quiet" style="margin:0;font:${footerFont};overflow-wrap:anywhere">${richTogether(footer)}</p>`
                  : ""
            }
            <p class="pwi-quiet" style="margin:${footer && footer.length ? 10 : 0}px 0 0;font:${footerFont}">
              <a class="pwi-link" href="https://portuguesewithines.com" style="color:${BRAND.lavenderInk};text-decoration:underline">portuguesewithines.com</a>
            </p>
          </td></tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/*
 * The text alternative. These values are what the caller passed — plain text
 * with newlines — not markup, so nothing here strips tags: doing so quietly
 * deleted anything a student had written between angle brackets, including part
 * of an address, from the text part while the HTML part showed it correctly.
 */
function plainText({ heading, intro, hero, heroNote, rows = [], callout, message, steps, action, link, footer }) {
  const clean = (value) => String(value ?? "").trim();
  const lines = [heading, "", clean(intro)];
  if (message?.body?.trim()) lines.push("", clean(message.label), clean(message.body));
  // heroNote already names its clock ("Jessica’s time: …"), so it stands on its own line.
  if (hero) {
    const { date, time } = splitWhen(hero);
    lines.push("", date, ...(time ? [time] : []), ...(heroNote ? [`${heroNote.label}: ${heroNote.value}`] : []));
  }
  if (callout) lines.push("", clean(callout));
  if (rows.length) {
    lines.push("");
    for (const { label, value, url } of rows) lines.push(`${label}: ${clean(value)}${safeMeetingLink(url) ? ` — ${url}` : ""}`);
  }
  if (steps?.items?.length) lines.push("", steps.title, ...steps.items.map((item, index) => `${index + 1}. ${clean(item)}`));
  if (action) lines.push("", `${action.label}: ${action.url}`);
  if (link) lines.push("", `${link.label}: ${link.url}`);
  lines.push("", clean([].concat(footer ?? "").filter(Boolean).join(" ")), "portuguesewithines.com");
  return lines.join("\n");
}

export function renderEmail(content) {
  return { html: layout(content), text: plainText(content) };
}

/**
 * Sends, or records the attempt. Never throws: callers treat email as
 * best-effort and the log is the audit trail.
 */
export async function deliver(env, { to, subject, content, calendar, dedupeKey, bookingId, kind, replyTo }) {
  // A student with no email yet has nowhere to be written to: nothing is
  // logged, rendered or sent, and the caller is told it went nowhere.
  if (isNoEmailYet(to)) return { ok: true, skipped: "no-email-yet" };
  // Her copies reply to the student; with no address yet there is none.
  replyTo = realEmail(replyTo);
  const { html, text } = renderEmail(content);
  const from = env.MAIL_FROM || "Português com a Inês <bookings@portuguesewithines.com>";
  const now = new Date().toISOString();

  /*
   * Idempotency before anything leaves: a retried request must not send twice.
   *
   * But a failed attempt must not be mistaken for a delivered one. The row was
   * written first and left behind on failure, so a message Resend rejected —
   * or that never reached it — became permanently unsendable: every retry hit
   * the unique key and returned "already sent". A single bad minute at the
   * provider silently cost a student their confirmation, for good.
   *
   * So a row is only a duplicate if it is one. A previous attempt that failed
   * is cleared and tried again, and any other database trouble is reported
   * rather than dressed up as success.
   */
  try {
    await env.DB.prepare(
      "INSERT INTO email_log (booking_id, kind, recipient, dedupe_key, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)"
    )
      .bind(bookingId ?? null, kind, to, dedupeKey, now)
      .run();
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/UNIQUE|constraint/i.test(message)) {
      console.error("email-log-write", kind, message);
      return { ok: false, error: message };
    }

    const previous = await env.DB.prepare("SELECT status FROM email_log WHERE dedupe_key = ?")
      .bind(dedupeKey)
      .first();

    if (previous?.status !== "failed") return { ok: true, skipped: "already-sent" };

    // Two retries can both read 'failed' here, and only the one that flips it
    // sends: the other finds the row already pending and stands down.
    const reset = await env.DB.prepare(
      "UPDATE email_log SET status = 'pending', error = NULL, created_at = ? WHERE dedupe_key = ? AND status = 'failed'"
    )
      .bind(now, dedupeKey)
      .run();
    if (reset?.meta && !reset.meta.changes) return { ok: true, skipped: "already-sent" };
  }

  const attachments = calendar
    ? [
        {
          filename: "lesson.ics",
          content: base64(calendar.body),
          content_type: `text/calendar; charset=utf-8; method=${calendar.method}`
        }
      ]
    : undefined;

  if (!env.RESEND_API_KEY || env.EMAIL_DRY_RUN === "1") {
    await env.DB.prepare("UPDATE email_log SET status = 'dry-run' WHERE dedupe_key = ?").bind(dedupeKey).run();
    console.log(JSON.stringify({ dryRun: true, to, subject, kind, calendar: calendar?.method ?? null }));
    return { ok: true, dryRun: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        ...(attachments ? { attachments } : {})
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      await env.DB.prepare("UPDATE email_log SET status = 'failed', error = ? WHERE dedupe_key = ?")
        .bind(String(payload.message ?? response.status).slice(0, 400), dedupeKey)
        .run();
      return { ok: false, error: payload.message ?? `HTTP ${response.status}` };
    }

    await env.DB.prepare("UPDATE email_log SET status = 'sent', provider_id = ? WHERE dedupe_key = ?")
      .bind(payload.id ?? null, dedupeKey)
      .run();
    return { ok: true, id: payload.id };
  } catch (error) {
    await env.DB.prepare("UPDATE email_log SET status = 'failed', error = ? WHERE dedupe_key = ?")
      .bind(String(error?.message ?? error).slice(0, 400), dedupeKey)
      .run();
    return { ok: false, error: String(error?.message ?? error) };
  }
}
