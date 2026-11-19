import { BOOKING_READ_TIMEOUT_MS } from "@/lib/config";

export type PrimedRead = { url: string; response: Promise<Response>; signal: AbortSignal };

/** Keep the deadline through body parsing. Document reads already have one. */
export async function withBookingReadDeadline<T>(
  early: PrimedRead | null | undefined,
  read: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (early) return read(early.signal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOOKING_READ_TIMEOUT_MS);
  try {
    return await read(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
