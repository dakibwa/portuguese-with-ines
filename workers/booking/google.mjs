/**
 * Google Sign-In: verifying the ID token.
 *
 * The browser gets an ID token from Google Identity Services and posts it here.
 * That token is the only evidence of who the person is, so it is verified
 * properly rather than merely decoded: signature against Google's published
 * keys, issuer, audience, and expiry. Decoding a JWT without checking its
 * signature would let anyone sign in as anyone.
 *
 * Only non-sensitive scopes are involved (name and email), so this needs no
 * additional Calendar permission. Optional Meet provisioning uses a separate
 * OAuth grant; this identity check is shared by both flows.
 */

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

let cachedKeys = null;
let cachedUntil = 0;

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlToJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

/** Google rotates these; the cache follows the Cache-Control it sends back. */
async function googleKeys(refresh = false) {
  if (!refresh && cachedKeys && Date.now() < cachedUntil) return cachedKeys;

  const response = await fetch(CERTS_URL);
  if (!response.ok) throw new Error("Could not fetch Google's signing keys.");

  const body = await response.json();
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("Cache-Control") ?? "")?.[1] ?? 3600);

  cachedKeys = body.keys ?? [];
  cachedUntil = Date.now() + Math.min(maxAge, 86400) * 1000;
  return cachedKeys;
}

/**
 * Returns the verified identity and whether Google owns its email domain, or null.
 *
 * @param clientId the OAuth client id this token must have been issued for.
 *        Without checking it, a token minted for any other Google app would be
 *        accepted here.
 */
export async function verifyGoogleIdToken(token, clientId) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;

  let header;
  let payload;
  let signature;
  try {
    header = base64UrlToJson(parts[0]);
    payload = base64UrlToJson(parts[1]);
    signature = base64UrlToBytes(parts[2]);
  } catch {
    return null;
  }

  if (!header || typeof header !== "object" || Array.isArray(header) || header.alg !== "RS256") return null;
  if (typeof header.kid !== "string" || !header.kid) return null;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (typeof payload.email !== "string" || !payload.email.trim()) return null;
  if (!Number.isFinite(payload.exp)) return null;
  if (payload.iat !== undefined && !Number.isFinite(payload.iat)) return null;

  let jwk = (await googleKeys()).find((candidate) => candidate.kid === header.kid);
  // A token can be signed with a key published after this isolate's cache was
  // filled. Refresh once on a miss rather than refusing Google sign-in until
  // the old cache expires.
  if (!jwk) jwk = (await googleKeys(true)).find((candidate) => candidate.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!verified) return null;

  if (!ISSUERS.has(payload.iss)) return null;
  if (payload.aud !== clientId) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;
  // A little tolerance for clock skew, but a token from the future is wrong.
  if (payload.iat && payload.iat > now + 300) return null;

  // An unverified address must not be trusted: it would let someone claim an
  // account belonging to a real address they do not control.
  if (payload.email_verified !== true && payload.email_verified !== "true") return null;
  const email = payload.email.trim().toLowerCase();
  // Google is authoritative for Gmail and verified Workspace accounts only.
  // An external address may have changed hands since Google first verified it.
  // https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
  const hostedDomain = typeof payload.hd === "string" ? payload.hd : "";
  const workspace = hostedDomain.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostedDomain);
  return {
    sub: payload.sub,
    email,
    name: String(payload.name ?? "").trim(),
    emailVerified: true,
    emailAuthoritative: email.endsWith("@gmail.com") || workspace
  };
}
