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

const BRAND = {
  blue: "#203e82",
  ink: "#1a3169",
  paper: "#f5ecd9",
  paperLight: "#fbf4e5",
  lavender: "#aaa4e6",
  lavenderInk: "#665fa6",
  lavenderWash: "#eeecf9",
  coral: "#ef5d3c",
  coralWash: "#fdeae5",
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

function safeMeetingLink(url) {
  return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url ?? "") ? url : null;
}

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * One email layout, built to the constraints that actually bite:
 *
 * - Tables and inline styles only. No flexbox, no grid, no <style> block.
 * - Images are blocked by default in most clients, so the banner sits on a
 *   `bgcolor` that carries the brand on its own and has real alt text.
 * - A preheader controls the grey preview line in the inbox list. Without one,
 *   clients scrape the first visible text, which is usually the greeting.
 */
function layout({ heading, preheader, intro, hero, heroNote, rows, callout, action, footer }) {
  // Each fact is a line beside one of the confirm step's dabs, its label small
  // above it: a list to glance down rather than a ruled table.
  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows
        .map(({ label, value, url }, index) => {
          const meeting = safeMeetingLink(url);
          const content = meeting
            ? `<a href="${escapeHtml(url)}" style="color:${BRAND.blue};font-weight:700;text-decoration:underline">${meetMark()}${escapeRich(value)}</a>`
            : escapeRich(value);
          return `
        <tr>
          <td width="28" valign="top" style="width:28px;padding:${index ? 16 : 4}px 0 0;line-height:0"><img src="${DABS[index % DABS.length]}" width="14" height="14" alt="" style="display:block;border:0"></td>
          <td valign="top" style="padding:${index ? 12 : 0}px 0 0">
            <p style="margin:0;font:700 10.5px/1.4 ${SANS};letter-spacing:.11em;text-transform:uppercase;color:${BRAND.lavenderInk}">${escapeHtml(label)}</p>
            <p style="margin:2px 0 0;font:400 15px/1.5 ${SANS};color:${BRAND.ink}">${content}</p>
          </td>
        </tr>`;
        })
        .join("")}</table>`
    : "";
  const when = hero ? splitWhen(hero) : null;
  const meetingAction = action && safeMeetingLink(action.url);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(
    preheader ?? ""
  )}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${
    BRAND.paper
  };border-collapse:collapse">
  <tr><td align="center" style="padding:28px 14px 40px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border-collapse:collapse;background:${
      BRAND.paperLight
    };border-radius:16px;overflow:hidden">

      <tr><td bgcolor="${BRAND.blue}" style="background:${BRAND.blue};line-height:0">
        <img src="${BANNER_URL}" width="560" alt="Português com a Inês" style="display:block;width:100%;max-width:560px;height:auto;border:0">
      </td></tr>

      <tr><td style="padding:30px 32px 0">
        <h1 style="margin:0;font:600 24px/1.25 ${SANS};letter-spacing:-.01em;color:${BRAND.ink}">${escapeHtml(
          heading
        )}</h1>
        <p style="margin:12px 0 0;font:400 15px/1.65 ${SANS};color:${BRAND.ink}">${escapeRich(intro)}</p>
      </td></tr>

      ${
        when
          ? `<tr><td style="padding:22px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${
          BRAND.lavenderWash
        };border-radius:18px 12px 16px 14px">
          <tr><td style="padding:18px 22px">
            <p style="margin:0;font:600 19px/1.35 ${SANS};color:${BRAND.blue}">${escapeHtml(when.date)}</p>
            ${when.time ? `<p style="margin:3px 0 0;font:400 16px/1.45 ${SANS};color:${BRAND.ink}">${escapeHtml(when.time)}</p>` : ""}
            ${
              heroNote
                ? `<p style="margin:6px 0 0;font:400 13px/1.5 ${SANS};color:${BRAND.lavenderInk}">${escapeHtml(
                    heroNote
                  )}</p>`
                : ""
            }
          </td></tr>
        </table>
      </td></tr>`
          : ""
      }

      ${
        callout
          ? `<tr><td style="padding:20px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${
          BRAND.coralWash
        };border-radius:12px">
          <tr>
            <td width="4" bgcolor="${BRAND.coral}" style="background:${BRAND.coral};width:4px;line-height:0">&nbsp;</td>
            <td style="padding:14px 18px;font:400 15px/1.6 ${SANS};color:${
              BRAND.ink
            }">${escapeRich(callout)}</td>
          </tr>
        </table>
      </td></tr>`
          : ""
      }

      ${rowsHtml ? `<tr><td style="padding:22px 32px 0">${rowsHtml}</td></tr>` : ""}

      ${
        action
          ? `<tr><td align="center" style="padding:26px 32px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate">
          <tr><td bgcolor="${BRAND.coralAction}" style="background:${
            BRAND.coralAction
          };border-radius:24px 16px 22px 18px" align="center">
            <a href="${escapeHtml(action.url)}" style="display:block;padding:15px 30px;font:700 15px/1.2 ${SANS};letter-spacing:.02em;color:#ffffff;text-decoration:none;border-radius:24px 16px 22px 18px">${
              meetingAction ? `<span style="display:inline-block;background:#ffffff;border-radius:6px;padding:3px 4px 2px;margin-right:9px;vertical-align:-4px;line-height:0">${meetMark(18).replace("margin-right:7px", "margin:0")}</span>` : ""
            }${escapeHtml(action.label)}</a>
          </td></tr>
        </table>
      </td></tr>`
          : ""
      }

      <tr><td style="padding:26px 32px 30px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr><td style="border-top:1px solid ${BRAND.rule};padding-top:18px">
            <p style="margin:0;font:400 13px/1.65 ${SANS};color:${BRAND.lavenderInk}">${escapeRich(footer)}</p>
            <p style="margin:10px 0 0;font:400 13px/1.65 ${SANS};color:${BRAND.lavenderInk}">
              <a href="https://portuguesewithines.com" style="color:${
                BRAND.lavenderInk
              };text-decoration:underline">portuguesewithines.com</a>
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
function plainText({ heading, intro, hero, heroNote, rows, callout, action, footer }) {
  const clean = (value) => String(value ?? "").trim();
  const lines = [heading, "", clean(intro)];
  // heroNote already reads "… — the student's time", so a bracket here nests badly.
  if (hero) {
    const { date, time } = splitWhen(hero);
    lines.push("", date, ...(time ? [time] : []), ...(heroNote ? [heroNote] : []));
  }
  if (callout) lines.push("", clean(callout));
  if (rows.length) {
    lines.push("");
    for (const { label, value, url } of rows) lines.push(`${label}: ${clean(value)}${safeMeetingLink(url) ? ` — ${url}` : ""}`);
  }
  if (action) lines.push("", `${action.label}: ${action.url}`);
  lines.push("", clean(footer), "portuguesewithines.com");
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

    await env.DB.prepare("UPDATE email_log SET status = 'pending', error = NULL, created_at = ? WHERE dedupe_key = ?")
      .bind(now, dedupeKey)
      .run();
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
