/**
 * Manage-link tokens.
 *
 * A student edits their booking from a link in their own email, with no account
 * and no password. That link is therefore the credential, so it must be
 * unguessable and tamper-evident: `<bookingId>.<HMAC-SHA256(bookingId)>`, signed
 * with a Worker secret. Booking ids are UUIDs, so enumerating them is hopeless
 * even before the signature check.
 */

import { currentTutor } from "./tutor.mjs";

const encoder = new TextEncoder();
const keyCache = new Map();

async function hmacKey(secret) {
  let key = keyCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    keyCache.set(secret, key);
  }
  return key;
}

/** Bytes as unpadded base64url, as every token and hash here is written. */
export function base64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** HMAC-SHA256 of `value` under `secret`, as base64url: every signed token's signature. */
export async function sign(value, secret) {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(value));
  return base64Url(signature);
}

export async function createManageToken(bookingId, secret) {
  return `${bookingId}.${await sign(bookingId, secret)}`;
}

/**
 * Returns the booking id, or null. Comparison is constant-time so a caller
 * cannot recover a valid signature byte by byte from response timing.
 */
export async function readManageToken(token, secret) {
  const raw = String(token ?? "");
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;

  const bookingId = raw.slice(0, separator);
  const provided = raw.slice(separator + 1);
  const expected = await sign(bookingId, secret);

  if (provided.length !== expected.length) return null;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return mismatch === 0 ? bookingId : null;
}

/** Constant-time equality for the admin bearer token. */
export function safeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * Short human reference for emails and her calendar: "PT-7QK4M2", the prefix
 * from the tutor record.
 * Ambiguous glyphs (0/O, 1/I) are excluded so it survives being read aloud.
 */
export function bookingReference(prefix = currentTutor().bookings.referencePrefix) {
  const alphabet = "ACDEFGHJKLMNPQRSTUVWXYZ2345679";
  const random = crypto.getRandomValues(new Uint8Array(6));
  let reference = "";
  for (const byte of random) reference += alphabet[byte % alphabet.length];
  return `${prefix}-${reference}`;
}
