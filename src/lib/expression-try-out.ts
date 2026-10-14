import type { Expression } from "@/lib/expressions";
import type { ExpressionSource, StudentExpressions } from "@/lib/student-expressions-api";

/** Where her try-out keeps its round on this device, by account. */
const STORE = "ines-expression-try-out";
/** As many unseen phrases as a student's waiting sheet shows in wax. */
const WAX = 8;

/** The expressions she has seen this round, and the last one painted. */
type Round = { seen: string[]; last: string | null };

// Browser storage is a convenience on this device: it can be missing, full or
// blocked, and then the round simply lasts as long as the tab is open.
function readRound(account: string): Round {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(`${STORE}:${account}`) ?? "null");
    if (value && typeof value === "object") {
      const { seen, last } = value as { seen?: unknown; last?: unknown };
      return { seen: Array.isArray(seen) ? seen.filter((id): id is string => typeof id === "string") : [], last: typeof last === "string" ? last : null };
    }
  } catch {
    // Start a fresh round.
  }
  return { seen: [], last: null };
}

function writeRound(account: string, round: Round) {
  try {
    window.localStorage.setItem(`${STORE}:${account}`, JSON.stringify(round));
  } catch {
    // Nothing to do: the round is still kept for this visit.
  }
}

function sample<T>(items: T[], count: number, random: () => number) {
  const pool = [...items];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/**
 * Inês's try-out (14 October 2026, Dan: "publish them but not for students
 * just for ines currently"): the students' paint reveal, painting from her
 * whole collection, drafts included, entirely in her browser. Nothing reaches
 * the Worker and no student's pick is spent. Never the same expression twice
 * in a row, and none again until she has seen them all; then a new round
 * starts. `update` hands it her collection as it changes, so her latest edits
 * are painted.
 */
export function tryOutExpressions(account: string, initial: Expression[], random: () => number = Math.random): ExpressionSource & { update(rows: Expression[]): void } {
  let rows = initial;
  let round = readRound(account);
  let answered: { requestId: string; reply: StudentExpressions } | null = null;
  const reply = (expression: Expression | null): StudentExpressions => {
    const seen = new Set(round.seen);
    const others = rows.filter((row) => row.id !== expression?.id);
    const unseen = others.filter((row) => !seen.has(row.id));
    return {
      expression,
      canPick: rows.length > 0,
      hasPublished: rows.length > 0,
      shuffleLabels: sample(unseen.length ? unseen : others, WAX, random).map((row) => row.expression),
    };
  };
  return {
    update: (next) => { rows = next; },
    load: async () => reply(null),
    pick: async (requestId) => {
      // As with a student's, asking again for the same press paints the same one.
      if (answered?.requestId === requestId) return answered.reply;
      const present = new Set(rows.map((row) => row.id));
      let seen = round.seen.filter((id) => present.has(id));
      let choices = rows.filter((row) => !seen.includes(row.id));
      if (!choices.length) {
        // She has seen them all: a new round, never opening with the one just painted.
        seen = [];
        choices = rows.length > 1 ? rows.filter((row) => row.id !== round.last) : rows;
      }
      const chosen = choices.length ? choices[Math.floor(random() * choices.length)] : null;
      if (chosen) {
        round = { seen: [...seen, chosen.id], last: chosen.id };
        writeRound(account, round);
      }
      answered = { requestId, reply: reply(chosen) };
      return answered.reply;
    },
  };
}
