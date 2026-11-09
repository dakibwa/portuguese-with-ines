import bookingWorker from "../booking/index.mjs";
import { asTutor } from "../booking/tutor.mjs";
import {
  createSession,
  readSession,
  sessionHash,
  sessionVersion,
} from "../booking/auth.mjs";
import { sqliteDatabase } from "./sqlite.mjs";
import { withDerived } from "../booking/rates.mjs";
import { body, json, problem, signature } from "./security.mjs";
import { tutorRecord } from "./model.mjs";
import { connectStatus } from "./payments.mjs";
import { curriculumRequest } from "./curriculum.mjs";

const EXTRA_COLUMNS = {
  bookings: {
    policy_notice_hours: "INTEGER",
    policy_fee_cents: "INTEGER",
    policy_no_show: "TEXT",
    policy_no_show_cents: "INTEGER",
  },
  booking_series: {
    policy_notice_hours: "INTEGER",
    policy_fee_cents: "INTEGER",
    policy_no_show: "TEXT",
    policy_no_show_cents: "INTEGER",
    policy_price_cents: "INTEGER",
  },
  lesson_types: {
    first_lesson_only: "INTEGER NOT NULL DEFAULT 0",
    can_repeat: "INTEGER NOT NULL DEFAULT 1",
    student_price_applies: "INTEGER NOT NULL DEFAULT 1",
  },
};

/** One SQLite-backed Durable Object per tutor; never has a binding to Inês's D1. */
export class TutorDatabase {
  constructor(ctx, env, schema, extraSchema) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.db = sqliteDatabase(ctx.storage);
    ctx.storage.transactionSync(() => {
      this.sql.exec(
        schema.replace(
          "duration_minutes IN (60, 90)",
          "duration_minutes BETWEEN 15 AND 240",
        ),
      );
      for (const [table, columns] of Object.entries(EXTRA_COLUMNS)) {
        const existing = new Set(
          this.rows(`PRAGMA table_info(${table})`).map((row) => row.name),
        );
        for (const [name, definition] of Object.entries(columns))
          if (!existing.has(name))
            this.sql.exec(
              `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`,
            );
      }
      this.sql.exec(extraSchema);
      this.rows(
        "INSERT OR IGNORE INTO vowel_migrations VALUES(1,?)",
        new Date().toISOString(),
      );
    });
  }
  rows(query, ...values) {
    return this.sql.exec(query, ...values).toArray();
  }
  one(query, ...values) {
    return this.rows(query, ...values)[0] ?? null;
  }
  async configure(site, origin, user = null) {
    const old = this.one("SELECT * FROM vowel_config WHERE id=1");
    if (old && old.version > site.version)
      throw problem("This site has changed. Please try again.", 409);
    const previous = old ? JSON.parse(old.record) : null;
    if (!old || old.version !== site.version || old.origin !== origin)
      this.ctx.storage.transactionSync(() => {
        if (
          !previous ||
          JSON.stringify(previous.lessons) !== JSON.stringify(site.lessons)
        ) {
          this.rows("UPDATE lesson_types SET active=0");
          for (const [index, lesson] of site.lessons.entries())
            this.rows(
              `INSERT INTO lesson_types(id,slug,name,description,duration_minutes,price_cents,sort_order,active,first_lesson_only,can_repeat,student_price_applies)
          VALUES(?,?,?,'',?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,duration_minutes=excluded.duration_minutes,price_cents=excluded.price_cents,sort_order=excluded.sort_order,active=excluded.active,first_lesson_only=excluded.first_lesson_only,can_repeat=excluded.can_repeat,student_price_applies=excluded.student_price_applies`,
              lesson.id,
              lesson.id,
              lesson.name,
              lesson.durationMinutes,
              lesson.priceCents,
              index,
              Number(lesson.active),
              Number(lesson.firstLessonOnly),
              Number(lesson.canRepeat),
              Number(!lesson.firstLessonOnly),
            );
        }
        if (
          !previous ||
          JSON.stringify(previous.hours) !== JSON.stringify(site.hours)
        ) {
          this.rows("DELETE FROM availability_rules");
          for (const hours of site.hours)
            this.rows(
              "INSERT INTO availability_rules(weekday,start_minute,last_start_minute,active) VALUES(?,?,?,1)",
              hours.weekday,
              hours.startMinute,
              hours.endMinute,
            );
        }
        if (
          !previous ||
          JSON.stringify(previous.rules) !== JSON.stringify(site.rules) ||
          previous.name !== site.name
        ) {
          const rules = site.rules;
          for (const [key, value] of Object.entries({
            minimum_notice_hours: rules.noticeHours,
            booking_horizon_days: rules.horizonDays,
            slot_interval_minutes: rules.intervalMinutes,
            lesson_buffer_minutes: rules.bufferMinutes,
            same_day_change_fee_cents: rules.lateFeeCents,
            no_show_mode: rules.noShow,
            no_show_cents: rules.noShowCents,
            payment_mode: rules.paymentMode === "manual" ? "off" : "postpay",
            teacher_name: site.name,
          }))
            this.rows(
              "INSERT OR REPLACE INTO settings VALUES(?,?)",
              key,
              String(value),
            );
          this.rows(
            "INSERT OR REPLACE INTO settings VALUES('availability_revision',?)",
            String(site.version),
          );
        }
        this.rows(
          "INSERT OR REPLACE INTO vowel_config VALUES(1,?,?,?)",
          site.version,
          JSON.stringify(site),
          origin,
        );
      });
    if (user) this.seedTeacher(site, user);
    if (site.state === "live" && !(await this.ctx.storage.getAlarm()))
      await this.ctx.storage.setAlarm(Date.now() + 60000);
  }
  seedTeacher(site, user) {
    const existing = this.one(
      "SELECT * FROM students WHERE email=?",
      user.email,
    );
    if (existing && existing.id !== `teacher-${user.id}`)
      throw problem(
        "This email is already a student on this site. Contact support before changing its role.",
        409,
      );
    this.rows(
      `INSERT INTO students(id,email,name,password_hash,role,email_verified_at,timezone,created_at) VALUES(?,?,?,'','teacher',?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,email_verified_at=COALESCE(students.email_verified_at,excluded.email_verified_at)`,
      `teacher-${user.id}`,
      user.email,
      site.name || user.name || "Tutor",
      new Date().toISOString(),
      site.place.timeZone,
      new Date().toISOString(),
    );
    for (const key of ["teacher_email", "reply_to_email"])
      this.rows("INSERT OR REPLACE INTO settings VALUES(?,?)", key, user.email);
  }
  async ownEnv(site, origin, withPayments = true) {
    const tutor = tutorRecord(site, this.env, origin);
    const bookingSecret = await signature(
      `tutor:${site.id}:booking`,
      this.env.VOWEL_AUTH_SECRET,
    );
    const own = {
      DB: this.db,
      TUTOR: tutor,
      BOOKING_TOKEN_SECRET: bookingSecret,
      ADMIN_TOKEN: await signature(
        `tutor:${site.id}:admin`,
        this.env.VOWEL_AUTH_SECRET,
      ),
      ALLOWED_ORIGIN: [
        ...new Set(
          [
            origin,
            new URL(tutor.site.url).origin,
            this.env.VOWEL_ORIGIN,
          ].filter(Boolean),
        ),
      ].join(","),
      EMAIL_DRY_RUN: this.env.VOWEL_EMAIL_ENABLED === "1" ? "0" : "1",
      RESEND_API_KEY: this.env.RESEND_API_KEY,
      TEACHER_NOTIFICATIONS_ENABLED: "1",
      TEACHER_EMAIL:
        this.one("SELECT value FROM settings WHERE key='teacher_email'")
          ?.value || "",
      GOOGLE_CLIENT_ID: this.env.GOOGLE_CLIENT_ID,
      EXPRESSIONS_FOR_STUDENTS: "0",
      HOMEWORK_AI_ENABLED:
        site.features.homework && this.env.VOWEL_AI_ENABLED === "1" ? "1" : "0",
      ANTHROPIC_API_KEY: this.env.ANTHROPIC_API_KEY,
      HOMEWORK_AI_MODEL: this.env.VOWEL_AI_MODEL,
      HOMEWORK_AI_MONTHLY_LIMIT: this.env.VOWEL_AI_MONTHLY_LIMIT || "200",
      GOOGLE_CALENDAR_ENABLED:
        this.env.VOWEL_GOOGLE_CALENDAR_ENABLED === "1" ? "1" : "0",
      GOOGLE_CALENDAR_CLIENT_ID: this.env.GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: this.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      GOOGLE_CALENDAR_TOKEN_KEY: await signature(
        `tutor:${site.id}:calendar`,
        this.env.VOWEL_AUTH_SECRET,
      ),
      GOOGLE_CALENDAR_REDIRECT_URI: `${origin}/api/tutor/${site.id}/google-calendar/callback`,
      STRIPE_EXPECTED_MODE: this.env.VOWEL_STRIPE_EXPECTED_MODE,
      STRIPE_UI_MODE: "embedded",
    };
    if (
      withPayments &&
      site.stripeAccount &&
      site.rules.paymentMode !== "manual"
    ) {
      const status = await connectStatus(this.env, site.stripeAccount).catch(
        (error) => {
          if (site.rules.paymentMode === "both") return { ready: false };
          throw error;
        },
      );
      if (status.ready)
        Object.assign(own, {
          STRIPE_SECRET_KEY: this.env.VOWEL_STRIPE_SECRET_KEY,
          STRIPE_ACCOUNT: site.stripeAccount,
          STRIPE_WEBHOOK_SECRET: this.env.VOWEL_STRIPE_WEBHOOK_SECRET,
        });
    }
    return own;
  }
  async siteRecord(site, origin) {
    await this.configure(site, origin);
    return {
      ...site,
      lessons: this.rows("SELECT * FROM lesson_types ORDER BY sort_order").map(
        (row) => ({
          id: row.id,
          name: row.name,
          durationMinutes: row.duration_minutes,
          priceCents: row.price_cents,
          active: Boolean(row.active),
          firstLessonOnly: Boolean(row.first_lesson_only),
          canRepeat: Boolean(row.can_repeat),
        }),
      ),
    };
  }
  async teacherSession(site, user, origin) {
    await this.configure(site, origin, user);
    const own = await this.ownEnv(site, origin, false);
    const teacher = this.one(
      "SELECT id,session_version FROM students WHERE id=? AND role='teacher'",
      `teacher-${user.id}`,
    );
    if (!teacher)
      throw problem("Your teacher account could not be opened.", 403);
    return createSession(
      teacher.id,
      own.BOOKING_TOKEN_SECRET,
      teacher.session_version,
    );
  }
  async student(request, env, teacher = false) {
    const token =
      request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
    const id = await readSession(token, env.BOOKING_TOKEN_SECRET);
    const student = id
      ? this.one("SELECT * FROM students WHERE id=?", id)
      : null;
    if (
      !student ||
      student.session_version !== sessionVersion(token) ||
      this.one(
        "SELECT token_hash FROM revoked_sessions WHERE token_hash=?",
        await sessionHash(token),
      ) ||
      (teacher && student.role !== "teacher")
    )
      throw problem("Please sign in to continue.", 401);
    return student;
  }
  async dispatch(request, site, origin) {
    try {
      await this.configure(site, origin);
      const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
      const manualBooking =
        path === "/bookings" &&
        request.method === "POST" &&
        site.rules.paymentMode === "both" &&
        (await body(request.clone())).paymentPreference === "manual";
      const own = await this.ownEnv(site, origin, !manualBooking);
      if (manualBooking) own.VOWEL_MANUAL_BOOKING = "1";
      if (path === "/admin/settings" && request.method === "POST") {
        await this.student(request, own, true);
        throw problem(
          "Change your teaching rules in the Vowel dashboard, then publish them for new bookings.",
          409,
        );
      }
      if (path === "/me/recurring-rates") {
        const student = await this.student(request, own);
        if (request.method !== "GET")
          throw problem(
            "Review your tutor's price offer in Your lessons.",
            409,
          );
        const rates = this.rows(
          "SELECT duration_minutes,amount_cents FROM student_recurring_rates WHERE student_id=?",
          student.id,
        );
        const byLesson = this.rows(
          "SELECT lesson_type_id,amount_cents FROM student_lesson_rates WHERE student_id=?",
          student.id,
        );
        return json({
          rates: withDerived(
            Object.fromEntries(
              rates.map((row) => [row.duration_minutes, row.amount_cents]),
            ),
          ),
          byLesson: Object.fromEntries(
            byLesson.map((row) => [row.lesson_type_id, row.amount_cents]),
          ),
        });
      }
      if (
        request.method === "POST" &&
        /^\/admin\/students\/[^/]+\/prices$/.test(path)
      ) {
        await this.student(request, own, true);
        throw problem(
          "Offer the new price from Students in your Vowel dashboard. The student accepts it before it changes their lessons.",
          409,
        );
      }
      if (path.startsWith("/vowel/"))
        return await asTutor(own.TUTOR, () => this.extra(request, own, site));
      if (
        site.rules.paymentMode === "both" &&
        request.method === "POST" &&
        path === "/bookings"
      ) {
        const input = await body(request.clone());
        if (input.paymentPreference === "manual")
          own.VOWEL_MANUAL_BOOKING = "1";
      }
      if (request.method === "POST" && path === "/bookings") {
        if (
          site.billing !== "active" &&
          site.billing !== "exempt" &&
          site.trialEndsAt <= Date.now()
        )
          throw problem(
            "New bookings are paused. Your existing lessons are still available.",
            403,
          );
        const input = await body(request.clone());
        if (
          (input.location === "online" && !site.rules.online) ||
          (input.location === "porto" && !site.rules.inPerson)
        )
          throw problem("Choose a lesson location this tutor offers.");
      }
      return await bookingWorker.fetch(request, own, this.ctx);
    } catch (error) {
      return json(
        {
          error:
            error.status && error.status < 500
              ? error.message
              : "Your tutor's page couldn't be opened just now. Please try again.",
        },
        error.status || 503,
      );
    }
  }
  async extra(request, env, site) {
    const url = new URL(request.url);
    if (url.pathname === "/vowel/rate-proposals") {
      const student = await this.student(request, env);
      if (request.method === "GET")
        return json({
          proposals: this.rows(
            "SELECT p.*,l.name FROM rate_proposals p JOIN lesson_types l ON l.id=p.lesson_type_id WHERE p.student_id=? AND p.state='pending'",
            student.id,
          ),
        });
      const input = await body(request);
      const proposal = this.one(
        "SELECT * FROM rate_proposals WHERE id=? AND student_id=? AND state='pending'",
        input.id,
        student.id,
      );
      if (!proposal) throw problem("That price offer was not found.", 404);
      this.ctx.storage.transactionSync(() => {
        this.rows(
          "UPDATE rate_proposals SET state=? WHERE id=?",
          input.accept === true ? "accepted" : "declined",
          proposal.id,
        );
        if (input.accept === true) {
          this.rows(
            "INSERT OR REPLACE INTO student_lesson_rates VALUES(?,?,?)",
            student.id,
            proposal.lesson_type_id,
            proposal.amount_cents,
          );
          this.rows(
            "UPDATE booking_series SET policy_price_cents=? WHERE student_id=? AND lesson_type_id=? AND status='active'",
            proposal.amount_cents,
            student.id,
            proposal.lesson_type_id,
          );
          this.rows(
            "UPDATE bookings SET amount_cents=? WHERE student_id=? AND lesson_type_id=? AND starts_at>? AND payment_status IN ('scheduled','not_required') AND charge_started_at IS NULL AND payment_consent_version IS NOT 'paid-by-hand'",
            proposal.amount_cents,
            student.id,
            proposal.lesson_type_id,
            new Date().toISOString(),
          );
        }
      });
      return json({ ok: true });
    }
    const teacher = await this.student(request, env, true);
    if (url.pathname === "/vowel/milestones" && request.method === "GET")
      return json({
        firstBooking: this.one(
          "SELECT student_name,created_at FROM bookings WHERE status='confirmed' ORDER BY created_at LIMIT 1",
        ),
        firstPayment: this.one(
          "SELECT student_name,updated_at FROM bookings WHERE payment_status='paid' AND stripe_payment_intent IS NOT NULL ORDER BY updated_at LIMIT 1",
        ),
      });
    if (url.pathname.startsWith("/vowel/curriculum"))
      return curriculumRequest(this, request, env, site, teacher);
    if (url.pathname === "/vowel/students" && request.method === "GET")
      return json({
        students: this.rows(
          "SELECT id,name,email FROM students WHERE role='student' OR also_student=1 ORDER BY name",
        ),
      });
    if (url.pathname === "/vowel/rates" && request.method === "POST") {
      const input = await body(request);
      if (
        !this.one("SELECT id FROM students WHERE id=?", input.studentId) ||
        !this.one(
          "SELECT id FROM lesson_types WHERE id=? AND active=1",
          input.lessonTypeId,
        ) ||
        !Number.isInteger(input.amountCents) ||
        input.amountCents < 0 ||
        input.amountCents > 1000000
      )
        throw problem("Check the student, lesson and price.");
      const now = new Date().toISOString(),
        id = crypto.randomUUID();
      this.ctx.storage.transactionSync(() => {
        this.rows(
          "UPDATE rate_proposals SET state='superseded' WHERE student_id=? AND lesson_type_id=? AND state='pending'",
          input.studentId,
          input.lessonTypeId,
        );
        this.rows(
          "INSERT INTO rate_proposals(id,student_id,lesson_type_id,amount_cents,created_at) VALUES(?,?,?,?,?)",
          id,
          input.studentId,
          input.lessonTypeId,
          input.amountCents,
          now,
        );
      });
      return json({ proposed: true });
    }
    if (url.pathname === "/vowel/payment-summary" && request.method === "GET") {
      return json({
        lessons: this.rows(
          "SELECT id,reference,student_name,starts_at,amount_cents,charged_cents,payment_status,payment_consent_version FROM bookings ORDER BY starts_at DESC LIMIT 200",
        ).map((row) => ({
          id: row.id,
          reference: row.reference,
          student: row.student_name,
          startsAt: row.starts_at,
          amountCents: row.charged_cents ?? row.amount_cents,
          method:
            row.payment_consent_version === "paid-by-hand" ||
            ["not_required", "recorded"].includes(row.payment_status)
              ? "direct"
              : "card",
          status: ["paid", "refunded", "free"].includes(row.payment_status)
            ? row.payment_status
            : row.payment_consent_version === "paid-by-hand"
              ? "paid"
              : row.payment_status === "payment_due"
                ? "needs_payment"
                : "waiting",
        })),
      });
    }
    throw problem("That tool was not found.", 404);
  }
  async paymentEvent(request, site) {
    const origin =
      this.one("SELECT origin FROM vowel_config WHERE id=1")?.origin ||
      this.env.VOWEL_ORIGIN;
    await this.configure(site, origin);
    const own = await this.ownEnv(site, origin);
    own.STRIPE_WEBHOOK_SECRET = this.env.VOWEL_STRIPE_WEBHOOK_SECRET;
    own.STRIPE_ACCOUNT = site.stripeAccount;
    const url = new URL(request.url);
    url.pathname = "/stripe/webhook";
    return bookingWorker.fetch(new Request(url, request), own, this.ctx);
  }
  async alarm() {
    const saved = this.one("SELECT * FROM vowel_config WHERE id=1");
    if (!saved) return;
    const previous = JSON.parse(saved.record);
    try {
      const site = await this.env.TUTOR_DIRECTORY.getByName(
        "directory",
      ).publicSite(previous.id);
      if (!site || site.state !== "live") return;
      await this.configure(site, saved.origin);
      const own = await this.ownEnv(site, saved.origin);
      // Retain platform bindings for curriculum work; the booking handler sees only its own env.
      await bookingWorker.scheduled(
        { scheduledTime: Date.now(), cron: "* * * * *" },
        own,
        this.ctx,
      );
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + 60000);
    }
  }
}
