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
  // The final row carries no rule: :last-child is unreliable across email
  // clients, and the footer already draws one, which doubled the line.
  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows
        .map(({ label, value, url }, index) => {
          const rule = index === rows.length - 1 ? "none" : `1px solid ${BRAND.rule}`;
          return `
        <tr>
          <td style="padding:11px 0;border-bottom:${rule};font:700 11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${
            BRAND.lavenderInk
          };width:36%;vertical-align:top">${escapeHtml(label)}</td>
          <td style="padding:11px 0;border-bottom:${rule};font:400 15px/1.5 Arial,Helvetica,sans-serif;color:${
            BRAND.ink
          }">${safeMeetingLink(url) ? `<a href="${escapeHtml(url)}" style="color:${BRAND.blue};font-weight:700;text-decoration:underline">${escapeRich(value)}</a>` : escapeRich(value)}</td>
        </tr>`;
        })
        .join("")}</table>`
    : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(heading)}</title>
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
        <h1 style="margin:0;font:400 26px/1.2 Georgia,'Times New Roman',serif;color:${BRAND.ink}">${escapeHtml(
          heading
        )}</h1>
        <p style="margin:12px 0 0;font:400 16px/1.65 Arial,Helvetica,sans-serif;color:${BRAND.ink}">${escapeRich(intro)}</p>
      </td></tr>

      ${
        hero
          ? `<tr><td style="padding:22px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${
          BRAND.lavenderWash
        };border-radius:12px">
          <tr><td style="padding:18px 22px">
            <p style="margin:0;font:700 11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.11em;text-transform:uppercase;color:${
              BRAND.lavenderInk
            }">When</p>
            <p style="margin:6px 0 0;font:400 21px/1.35 Georgia,'Times New Roman',serif;color:${
              BRAND.blue
            }">${escapeHtml(hero)}</p>
            ${
              heroNote
                ? `<p style="margin:5px 0 0;font:400 14px/1.5 Arial,Helvetica,sans-serif;color:${BRAND.lavenderInk}">${escapeHtml(
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
            <td style="padding:14px 18px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${
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
          };border-radius:8px" align="center">
            <a href="${escapeHtml(action.url)}" style="display:block;padding:16px 34px;font:700 16px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(
              action.label
            )}</a>
          </td></tr>
        </table>
      </td></tr>`
          : ""
      }

      <tr><td style="padding:26px 32px 30px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr><td style="border-top:1px solid ${BRAND.rule};padding-top:18px">
            <p style="margin:0;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:${BRAND.lavenderInk}">${escapeRich(footer)}</p>
            <p style="margin:10px 0 0;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:${BRAND.lavenderInk}">
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
  if (hero) lines.push("", `When: ${hero}`, ...(heroNote ? [heroNote] : []));
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
