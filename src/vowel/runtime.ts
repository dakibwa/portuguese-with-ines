import type { Boot } from "./types";
export const BOOT: Boot = JSON.parse(
  document.getElementById("vowel-boot")?.textContent || "{}",
);
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  input?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(`/api/platform${path}`, {
    method: method || (input === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    cache: "no-store",
    headers: input === undefined ? {} : { "Content-Type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      typeof value?.error === "string"
        ? value.error
        : "Vowel couldn't save that. Please try again.",
      response.status,
    );
  return value as T;
}
export async function tutorApi<T>(
  siteId: string,
  token: string,
  path: string,
  input?: unknown,
): Promise<T> {
  const response = await fetch(`/api/tutor/${siteId}${path}`, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      value?.error || "That teaching tool couldn't be opened.",
      response.status,
    );
  return value as T;
}
