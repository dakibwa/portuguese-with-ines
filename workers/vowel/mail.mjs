import { escapeHtml, problem } from "./security.mjs";

/** Transactional product mail. Never put a code, a token or a provider body in logs. */
export async function sendMail(
  env,
  { to, subject, heading, text, action, id },
) {
  if (env.VOWEL_EMAIL_ENABLED !== "1")
    throw problem("Email isn't open yet. Please try again later.", 503);
  if (!env.RESEND_API_KEY || !env.VOWEL_MAIL_SENDER)
    throw problem("Email is not configured yet. Please try again later.", 503);
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f7f4;color:#142019;font:16px/1.65 Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:white;border-top:4px solid #0e6b4c"><p style="font:700 24px Georgia,serif;color:#0e6b4c">vowel</p><h1 style="font:600 30px Georgia,serif">${escapeHtml(heading)}</h1><p style="white-space:pre-line">${escapeHtml(text)}</p>${action ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#0e6b4c;color:white;padding:12px 20px;border-radius:6px;text-decoration:none">${escapeHtml(action.label)}</a></p>` : ""}<p style="font-size:13px;color:#56635b">Vowel · A place for your teaching.</p></main></body></html>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `vowel:${id}`,
    },
    body: JSON.stringify({
      from: `Vowel <${env.VOWEL_MAIL_SENDER}>`,
      to: [to],
      subject,
      html,
      text: `${heading}\n\n${text}${action ? `\n\n${action.label}: ${action.url}` : ""}\n\nVowel`,
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw problem("The email could not be sent. Please try again.", 503);
  }
  await response.body?.cancel();
}
