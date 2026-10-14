"use client";

import { useEffect, useState } from "react";
import { StudentExpressions } from "@/components/expressions/StudentExpressions";
import { tryOutExpressions } from "@/lib/expression-try-out";
import type { Expression } from "@/lib/expressions";

/** Her own collection, including drafts; no student pick is spent. */
export function TeacherExpressionTryOut({ accountId, token, rows, fullPage = false }: { accountId: string; token: string; rows: Expression[]; fullPage?: boolean }) {
  const [source] = useState(() => tryOutExpressions(accountId, rows));
  useEffect(() => source.update(rows), [source, rows]);
  return <StudentExpressions fullPage={fullPage} source={source} studentId={accountId} token={token} />;
}
