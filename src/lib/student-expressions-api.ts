import { BOOKING_API_BASE_URL } from "@/lib/config";
import { AuthApiError, forgetSession } from "@/lib/auth-api";
import { BOOKING_REPLY_ERROR, isApiRecord } from "@/lib/api-response";
import { isExpression, type Expression } from "@/lib/expressions";

export type StudentExpressions = {
  expression: Expression | null;
  canPick: boolean;
  hasPublished: boolean;
  shuffleLabels: string[];
};

export async function fetchStudentExpressions(token: string, requestId?: string): Promise<StudentExpressions> {
  let response: Response;
  try {
    response = await fetch(`${BOOKING_API_BASE_URL}/me/expressions${requestId ? "/pick" : ""}`, {
      method: requestId ? "POST" : "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(requestId ? { "Content-Type": "application/json" } : {}) },
      ...(requestId ? { body: JSON.stringify({ requestId }) } : {}),
    });
  } catch {
    throw new Error("We couldn’t reach your expressions. Please try again.");
  }
  const data: unknown = await response.json().catch(() => null);
  if (response.status === 401) forgetSession(token);
  if (!response.ok) throw new AuthApiError(isApiRecord(data) && typeof data.error === "string" ? data.error : "Your expressions couldn’t be loaded.", response.status);
  if (!isApiRecord(data) || !(data.expression === null || (isExpression(data.expression) && data.expression.published === 1)) ||
      typeof data.canPick !== "boolean" || typeof data.hasPublished !== "boolean" ||
      !Array.isArray(data.shuffleLabels) || data.shuffleLabels.length > 8 ||
      !data.shuffleLabels.every((label: unknown) => typeof label === "string" && label.length > 0 && label.length <= 240)) {
    throw new AuthApiError(BOOKING_REPLY_ERROR, 502);
  }
  return data as StudentExpressions;
}

/**
 * Where a reading's expressions come from: the collection as it stands (the
 * last one painted, whether another can be, and unseen phrases for the wax),
 * and a pick saved under `requestId`, so asking again with the same request
 * returns the same expression.
 */
export type ExpressionSource = {
  load(): Promise<StudentExpressions>;
  pick(requestId: string): Promise<StudentExpressions>;
};

/** A student's own: the Worker picks and saves each one. */
export function workerExpressions(token: string): ExpressionSource {
  return { load: () => fetchStudentExpressions(token), pick: (requestId) => fetchStudentExpressions(token, requestId) };
}
