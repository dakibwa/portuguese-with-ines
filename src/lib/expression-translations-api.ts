import { BOOKING_API_BASE_URL } from "@/lib/config";
import { AuthApiError, forgetSession } from "@/lib/auth-api";
import { BOOKING_REPLY_ERROR, isApiInstant, isApiRecord } from "@/lib/api-response";

/** An approved translation, as anyone reading the expression sees it: no word of who wrote it. */
export type ExpressionTranslation = { id: number; language: string; text: string; createdAt: string };

export const TRANSLATION_LIMITS = { language: 40, text: 500 } as const;

function isTranslation(value: unknown): value is ExpressionTranslation {
  return isApiRecord(value) && Number.isInteger(value.id) && isApiInstant(value.createdAt) &&
    typeof value.language === "string" && value.language.length > 0 && value.language.length <= TRANSLATION_LIMITS.language &&
    typeof value.text === "string" && value.text.length > 0 && value.text.length <= TRANSLATION_LIMITS.text;
}

async function reply(response: Response, fallback: string) {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new AuthApiError(isApiRecord(data) && typeof data.error === "string" ? data.error : fallback, response.status);
  if (!isApiRecord(data)) throw new AuthApiError(BOOKING_REPLY_ERROR, 502);
  return data;
}

export async function fetchTranslations(expressionId: string): Promise<ExpressionTranslation[]> {
  let response: Response;
  try {
    response = await fetch(`${BOOKING_API_BASE_URL}/expressions/${encodeURIComponent(expressionId)}/translations`, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("We couldn’t reach the translations. Please try again.");
  }
  const data = await reply(response, "The translations couldn’t be loaded.");
  if (!Array.isArray(data.translations) || !data.translations.every(isTranslation)) throw new AuthApiError(BOOKING_REPLY_ERROR, 502);
  return data.translations;
}

const CACHE_MS = 60_000;
const CHANGED = "ines:expression-translations-changed";
const loaded = new Map<string, { request: Promise<ExpressionTranslation[]>; expiresAt: number }>();
const ready = new Map<string, ExpressionTranslation[]>();

/** A moderation or publishing change retires both the preview and any old request. */
export function forgetTranslations(expressionId: string) {
  loaded.delete(expressionId);
  ready.delete(expressionId);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGED, { detail: expressionId }));
}

export function subscribeToTranslations(expressionId: string, changed: () => void) {
  const listener = (event: Event) => { if ((event as CustomEvent<string>).detail === expressionId) changed(); };
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

/**
 * Starts loading an expression's approved versions while it paints, so
 * its reading opens with them in place. A failure is forgotten, so opening the
 * reading asks again. A later reading checks again after a minute.
 */
export function prefetchTranslations(expressionId: string) {
  const cached = loaded.get(expressionId);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  ready.delete(expressionId);
  const request = fetchTranslations(expressionId);
  const entry = { request, expiresAt: Date.now() + CACHE_MS };
  loaded.set(expressionId, entry);
  request.then((rows) => {
    if (loaded.get(expressionId) === entry) ready.set(expressionId, rows);
  }, () => {
    if (loaded.get(expressionId) === entry) loaded.delete(expressionId);
  });
  return request;
}

/** The versions already loaded for this expression, if any. */
export const loadedTranslations = (expressionId: string) =>
  (loaded.get(expressionId)?.expiresAt ?? 0) > Date.now() ? ready.get(expressionId) ?? null : null;

/** A student's own translation, which waits for Inês before anyone sees it. */
export async function sendTranslation(token: string, expressionId: string, input: { language: string; text: string }) {
  let response: Response;
  try {
    response = await fetch(`${BOOKING_API_BASE_URL}/me/expressions/${encodeURIComponent(expressionId)}/translations`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("We couldn’t send your translation. Please check your connection and try again.");
  }
  if (response.status === 401) forgetSession(token);
  await reply(response, "Your translation couldn’t be sent. Please try again.");
}
