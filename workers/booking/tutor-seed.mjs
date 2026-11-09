/**
 * What a new tutor's database starts with, after schema.sql.
 *
 * seed.sql is Inês's alone: her prices, her hours, her name and her lesson
 * descriptions. It never goes into another tutor's database. A new tutor starts
 * with their own rules from their record, their name, and the three lesson
 * types the booking code knows by id, switched off and unpriced until they set
 * their prices. No teaching hours either, so nothing can be booked until they
 * choose them.
 *
 *   node workers/booking/tutor-seed.mjs <tutor-id> > seed-<tutor-id>.sql
 */
import { pathToFileURL } from "node:url";

const text = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const whole = (value, fallback) => (Number.isInteger(value) && value >= 0 ? value : fallback);

/** The lesson types the code knows by id, as a new tutor starts: off and unpriced. */
const STARTER_TYPES = [
  ["trial", "trial-lesson", "Trial lesson", 60, 1],
  ["single", "single-lesson", "Single lesson", 60, 2],
  ["long", "long-lesson", "Longer lesson", 90, 3]
];

export function tutorSeed(tutor) {
  const defaults = tutor.defaults ?? {};
  const settings = [
    ["minimum_notice_hours", whole(defaults.noticeHours, 24)],
    ["booking_horizon_days", whole(defaults.bookingHorizonDays, 84)],
    ["slot_interval_minutes", 15],
    ["lesson_buffer_minutes", 15],
    ["same_day_change_fee_cents", whole(defaults.lateChangeFeeCents, 0)],
    ["teacher_name", tutor.name],
    ["teacher_email", ""],
    ["reply_to_email", ""]
  ];
  return [
    `-- ${tutor.name}'s database, after schema.sql. Generated from tutors/${tutor.id}/tutor.json.`,
    "INSERT OR REPLACE INTO lesson_types (id, slug, name, description, duration_minutes, price_cents, sort_order, active) VALUES",
    STARTER_TYPES.map(([id, slug, name, minutes, order]) => `  (${text(id)}, ${text(slug)}, ${text(name)}, '', ${minutes}, 0, ${order}, 0)`).join(",\n") + ";",
    "DELETE FROM availability_rules;",
    "INSERT OR REPLACE INTO settings (key, value) VALUES",
    settings.map(([key, value]) => `  (${text(key)}, ${text(value)})`).join(",\n") + ";",
    ""
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { TUTORS } = await import("./directory.mjs");
  const tutor = TUTORS.find((record) => record.id === process.argv[2]);
  if (!tutor) {
    console.error(`No tutor ${process.argv[2] ?? ""} in workers/booking/directory.mjs.`);
    process.exit(1);
  }
  const { DEFAULT_TUTOR } = await import("./tutor.mjs");
  if (tutor.id === DEFAULT_TUTOR.id) {
    console.error("Inês's database is seeded from seed.sql.");
    process.exit(1);
  }
  process.stdout.write(tutorSeed(tutor));
}
