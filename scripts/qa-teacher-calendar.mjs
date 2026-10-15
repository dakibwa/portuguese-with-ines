import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// All account and calendar endpoints are isolated fixtures. No provider writes.
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const browser = await chromium.launch({ headless: true });
const teacher = {
  id: "teacher",
  name: "Inês",
  email: "teacher@example.invalid",
  phone: "",
  timezone: "Europe/Lisbon",
  role: "teacher",
};
const lesson = (id, name, start, location = "online", durationMinutes = 60) => ({
  id,
  reference: `TEST-${id}`,
  lesson_name: `${durationMinutes} minutes`,
  student_name: name,
  student_email: `${id}@example.invalid`,
  student_phone: "",
  starts_at: start,
  ends_at: new Date(Date.parse(start) + durationMinutes * 60000).toISOString(),
  status: "confirmed",
  location,
  meeting_url: "https://meet.google.com/abc-defg-hij",
  notes: "",
  same_day_change: 0,
  same_day_fee_status: "not_required",
  reschedule_count: 0,
  payment_status: "scheduled",
  attendance_status: "expected",
});

async function fixture(width, options = {}) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    hasTouch: width < 741,
  });
  await page.clock.setFixedTime(new Date("2026-09-07T10:15:00Z"));
  if (!options.signedOut) {
    await page.addInitScript(() =>
      localStorage.setItem("ines-student-session", "isolated-teacher-fixture"),
    );
  }
  const state = {
    rules: [
      { id: 1, weekday: 1, start_minute: 600, last_start_minute: 690 },
      { id: 2, weekday: 3, start_minute: 615, last_start_minute: 705 },
      // Keep the afternoon actions below inside this fixture's teaching range.
      { id: 3, weekday: 5, start_minute: 900, last_start_minute: 1110 },
    ],
    exceptions: [
      { id: 1, date: "2026-09-21", kind: "blocked", note: "Holiday" },
      {
        id: 2,
        date: "2026-09-21",
        kind: "blocked",
        start_minute: 600,
        end_minute: 660,
        note: "Short break",
      },
      { id: 3, date: "2026-09-22", kind: "extra", note: "Extra hours" },
      { id: 4, date: "2026-09-21", kind: "blocked", note: "Duplicate day" },
      {
        id: 5,
        date: null,
        weekday: 1,
        kind: "blocked",
        start_minute: 750,
        end_minute: 810,
        note: "Lunch",
      },
    ],
    bookings: [
      lesson("now", "Alex", "2026-09-07T10:00:00Z"),
      lesson("next", "Sam", "2026-09-08T13:00:00Z", "porto", 90),
    ],
    // Her students; Nora was set up from a name alone and has no email yet.
    students: [
      { id: "sam", name: "Sam Known", email: "sam@example.invalid", phone: "+351 912 345 678", nif: "123456789", signedIn: false, hasCard: false, cardForAllLessons: false, nextLessonAt: "2026-09-10T16:00:00.000Z", upcoming: 1, unpaidUpcoming: 1, weekly: 0, hasLessons: true },
      { id: "alex", name: "Alex", email: "alex@example.invalid", phone: "", signedIn: true, hasCard: true, cardForAllLessons: true, nextLessonAt: null, upcoming: 0, unpaidUpcoming: 0, weekly: 1, hasLessons: true },
      { id: "nora", name: "Nora Lima", email: "", phone: "", nif: "", signedIn: false, awaitingWelcome: true, hasCard: false, cardForAllLessons: false, nextLessonAt: null, upcoming: 0, unpaidUpcoming: 0, weekly: 0, hasLessons: false, prices: { 60: 2200, 90: 3300 }, ownPrices: { 60: 2200 } },
    ],
    writes: [],
    accountWrites: [],
    availabilityReads: [],
    account: { ...teacher },
    pendingEmail: "",
    errors: [],
    failHours: 0,
    failDay: "",
    delay: 0,
    dayGate: null,
    nextId: 1000,
    failMove: 0,
    failCancel: 0,
    failBookings: false,
    failCreate: 0,
    conflictMoved: false,
    history: null,
    historyReads: 0,
    historyGate: null,
    failHistory: false,
    studentsReads: 0,
    studentsGate: null,
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/lesson-types", (route) => route.fulfill({
    json: { lessonTypes: [], postpay: false },
  }));
  await page.route("**/me/recurring-rates", (route) => route.fulfill({ json: { rates: {} } }));
  await page.route("**/availability?**", route => {
    const query = new URL(route.request().url()).searchParams;
    const lessonType = query.get("lessonType");
    state.availabilityReads.push(lessonType);
    const long = lessonType === "long";
    const date = "2026-09-30";
    const available = (query.get("from") ?? "") <= date && (query.get("to") ?? "") >= date;
    return route.fulfill({ json: {
      slotsByDate: available ? { [date]: [{
        startAt: long ? (state.conflictMoved ? "2026-09-30T17:30:00.000Z" : "2026-09-30T17:00:00.000Z") : "2026-09-30T16:00:00.000Z",
        endAt: long ? (state.conflictMoved ? "2026-09-30T19:00:00.000Z" : "2026-09-30T18:30:00.000Z") : "2026-09-30T17:00:00.000Z",
      }] } : {}, horizonDays: 56,
    } });
  });
  await page.route("**/auth/login", (route) => route.fulfill({
    json: { student: state.account, session: "isolated-teacher-fixture" },
  }));
  await page.route("**/auth/forgot", route => {
    state.accountWrites.push({ path: "/auth/forgot", data: route.request().postDataJSON() });
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/me/email", route => {
    const data = route.request().postDataJSON();
    state.accountWrites.push({ path: "/me/email", data, authorization: route.request().headers().authorization });
    state.pendingEmail = data.email;
    return route.fulfill({ json: { ok: true, pending: state.pendingEmail } });
  });
  await page.route("**/me/email/confirm", route => {
    state.accountWrites.push({ path: "/me/email/confirm", data: route.request().postDataJSON(), authorization: route.request().headers().authorization });
    state.account = { ...state.account, email: state.pendingEmail };
    return route.fulfill({ json: { student: state.account, session: "isolated-renewed-teacher-fixture" } });
  });
  await page.route("**/me/expressions", route => route.fulfill({ json: { expression: null, canPick: false, hasPublished: false, shuffleLabels: [] } }));
  await page.route("**/me", (route) =>
    route.fulfill({
      json: {
        student: { ...state.account, role: options.student ? "student" : "teacher" },
        bookings: [],
        series: [],
      },
    }),
  );
  await page.route("**/admin/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const data = request.method() === "POST" ? request.postDataJSON() : null;
    const fail = (error) => route.fulfill({ status: 503, json: { error } });
    if (data) state.writes.push({ path, data });
    if (path === "/admin/google-calendar") return route.fulfill({ json: { configured: false, connected: false, email: null, needsReconnect: false, pending: 0 } });
    if (path === "/admin/expressions" && request.method() === "GET") return route.fulfill({ json: { expressions: [{
      id: "original-1", expression: "Partir o coco a rir", meaningPt: "Rir muito.", meaningEn: "To split your sides laughing",
      literalEn: "To crack the coconut laughing", examples: ["Com aquela história, partimos o coco a rir."],
      notes: "", sourceUrl: "", tags: ["Humor"], imageUrl: "", imageAlt: "", published: 0, sortOrder: 0,
      createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z",
    }], openToStudents: false } });
    if (path === "/admin/availability") {
      if (data) {
        if (state.failHours-- > 0)
          return fail("Hours could not be saved. Try again.");
        state.rules = data.rules.map((rule, id) => ({
          id,
          weekday: rule.weekday,
          start_minute: rule.startMinute,
          last_start_minute: rule.lastStartMinute,
        }));
        return route.fulfill({ json: { ok: true, count: data.rules.length } });
      }
      return route.fulfill({
        json: {
          rules: state.rules,
          exceptions: state.exceptions,
          settings: { slotIntervalMinutes: 30 },
        },
      });
    }
    if (path === "/admin/exceptions/day") {
      // Mirrors the Worker: a day off and hour blocks replace only their own rows.
      if (state.dayGate) await state.dayGate;
      if (state.delay)
        await new Promise((done) => setTimeout(done, state.delay));
      if (data.date === state.failDay) {
        state.failDay = "";
        return fail("The booking system is busy. Please try again.");
      }
      const oneOff = (row) =>
        row.date === data.date && row.weekday == null && row.kind === "blocked";
      const whole = (row) =>
        (row.start_minute == null || row.start_minute <= 0) &&
        (row.end_minute == null || row.end_minute >= 1440);
      const row = (start, end) => ({
        id: ++state.nextId,
        date: data.date,
        weekday: null,
        kind: "blocked",
        note: "",
        start_minute: start,
        end_minute: end,
      });
      if (data.dayOff === false)
        state.exceptions = state.exceptions.filter(
          (entry) => !(oneOff(entry) && whole(entry)),
        );
      if (
        data.dayOff === true &&
        !state.exceptions.some((entry) => oneOff(entry) && whole(entry))
      )
        state.exceptions.push(row(null, null));
      if (data.blocks)
        state.exceptions = [
          ...state.exceptions.filter((entry) => !oneOff(entry) || whole(entry)),
          ...data.blocks.map((block) =>
            row(block.startMinute, block.endMinute),
          ),
        ];
      return route.fulfill({
        json: {
          ok: true,
          exceptions: state.exceptions.filter(
            (entry) => entry.date === data.date && entry.weekday == null,
          ),
        },
      });
    }
    if (path === "/admin/bookings") {
      if (!data) {
        if (new URL(request.url()).searchParams.get("from") === "1970-01-01T00:00:00.000Z") {
          state.historyReads++;
          const gate = state.historyGate;
          if (gate) await gate;
          if (state.failHistory) return fail("Lesson history could not be loaded.");
          return route.fulfill({ json: { bookings: state.history ?? state.bookings } });
        }
        if (state.failBookings) return fail("Lessons could not be loaded.");
        return route.fulfill({ json: { bookings: state.bookings } });
      }
      if (state.failCreate > 0) {
        state.failCreate--;
        state.conflictMoved = true;
        return route.fulfill({ status: 409, json: { error: "That time has just been taken. Choose another time." } });
      }
      // Hers are marked as hers, and wait for the student's card.
      const owner = [state.added, ...state.students].find((entry) => entry?.id === data.studentId);
      // One already had is recorded quietly, paid as she says.
      const past = Date.parse(data.startAt) <= Date.parse("2026-09-07T10:15:00Z");
      if (owner) Object.assign(owner, { hasLessons: true, ...(past ? {} : { nextLessonAt: data.startAt, upcoming: (owner.upcoming ?? 0) + 1 }) });
      state.bookings.push({
        ...lesson(`manual-${state.bookings.length}`, owner?.name ?? "Sam Known", data.startAt, data.location, data.lessonType === "long" ? 90 : data.lessonType === "trial" ? 30 : 60),
        student_id: owner?.id,
        payment_status: data.payment === "unpaid" ? "owed" : "not_required",
        amount_cents: data.payment === "free" ? 0 : 2400,
        ...(past ? { meeting_url: null } : {}),
        added_by_teacher: 1,
      });
      return route.fulfill({
        json: {
          booking: { reference: "TEST-manual" },
          // A student she has just set up isn't emailed until their welcome.
          emailed: !owner?.awaitingWelcome && !data.payment,
          ...(data.repeat ? { series: { booked: 3, skipped: [{ key: "2026-10-01", startAt: "2026-10-01T16:00:00.000Z", reason: "Day off" }] } } : {}),
        },
      });
    }
    // Her students, for suggestions in the form and her list beneath it.
    if (path === "/admin/students" && data) {
      // Set up quietly: nothing is emailed until her welcome.
      const student = { id: `student-${++state.nextId}`, name: data.name, email: data.email, phone: data.phone, mark: data.mark, prices: data.prices, signedIn: false, awaitingWelcome: true, hasCard: false, cardForAllLessons: false, nextLessonAt: null, upcoming: 0, unpaidUpcoming: 0, weekly: 0, hasLessons: false };
      state.added = student;
      return route.fulfill({ status: 201, json: { student } });
    }
    // Their welcome, their details and their price: each answers as the Worker does.
    const studentRoute = path.match(/^\/admin\/students\/([^/]+)\/(welcome|details|prices)$/);
    if (studentRoute) {
      const target = [state.added, ...state.students].find((entry) => entry?.id === studentRoute[1]);
      if (!target) return fail("That student could not be found.");
      if (studentRoute[2] === "details") Object.assign(target, { name: data.name, email: data.email, phone: data.phone, nif: data.nif });
      if (studentRoute[2] === "prices") {
        target.ownPrices = Object.fromEntries(Object.entries(data.prices).filter(([, cents]) => cents !== null));
        const sixty = target.ownPrices[60];
        target.prices = sixty ? { 60: sixty, 90: target.ownPrices[90] ?? Math.round(sixty * 1.5) } : { ...target.ownPrices };
      }
      if (studentRoute[2] === "welcome") {
        target.awaitingWelcome = false;
        return route.fulfill({ json: { ok: true, card: true } });
      }
      return route.fulfill({ json: { student: target, ...(studentRoute[2] === "prices" ? { updated: 1 } : {}) } });
    }
    if (path === "/admin/students") {
      state.studentsReads++;
      const json = structuredClone({ cardsAccepted: true, students: [...state.students, ...(state.added ? [state.added] : [])] });
      const gate = state.studentsGate;
      state.studentsGate = null;
      if (gate) await gate;
      return route.fulfill({ json });
    }
    const match = path.match(
      /^\/admin\/bookings\/([^/]+)\/(reschedule|cancel|no-show)$/,
    );
    if (match) {
      const booking = state.bookings.find((entry) => entry.id === match[1]);
      if (match[2] === "reschedule") {
        if (state.failMove-- > 0)
          return fail("That time is unavailable. Choose another time.");
        const duration =
          Date.parse(booking.ends_at) - Date.parse(booking.starts_at);
        Object.assign(booking, {
          starts_at: data.startAt,
          ends_at: new Date(Date.parse(data.startAt) + duration).toISOString(),
        });
      } else if (match[2] === "cancel") {
        if (state.failCancel-- > 0) return fail("The booking system is busy. Please try again.");
        booking.status = "cancelled";
      }
      else booking.attendance_status = data.noShow ? "no_show" : "expected";
      return route.fulfill({ json: { booking } });
    }
    state.errors.push(
      `Unexpected fixture request: ${request.method()} ${path}`,
    );
    return route.abort();
  });
  await page.goto(`${base}${options.entry ?? "/schedule/"}`, { waitUntil: "domcontentloaded" });
  if (!options.student && !options.signedOut)
    await page.locator("#teacher-week-title").waitFor();
  return { page, state };
}

const slot = (page, day, minute) =>
  page.locator(`[data-slot-day="${day}"][data-slot-minute="${minute}"]`);
async function showHours(page) {
  await page.getByRole("tab", { name: /^Timetable/ }).click();
  const edit = page.getByRole("button", { name: /^Edit weekly hours/ });
  if (await edit.isVisible()) await edit.click();
}
async function showLessons(page) {
  await page.getByRole("tab", { name: /^Timetable/ }).click();
  const lessons = page.getByRole("button", { name: "View lessons", exact: true });
  if (await lessons.isVisible()) await lessons.click();
}
const dayWrites = (state, date) =>
  state.writes
    .filter((entry) => entry.path === "/admin/exceptions/day")
    .map((entry) => entry.data)
    .filter((entry) => !date || entry.date === date);
// A free time offers a choice; time off is one of its two options.
async function takeOff(page, cell, { tap = false } = {}) {
  if (tap) await cell.tap();
  else await cell.click();
  const item = page.getByRole("menu").getByRole("menuitem", { name: "Take this time off", exact: true });
  if (tap) await item.tap();
  else await item.click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}
async function dragDown(page, from, to) {
  const start = await from.boundingBox();
  const end = await to.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
}
const studentRow = (page, name) => page.locator(".teacher-students .teacher-setup, .teacher-students .teacher-student.is-ready")
  .filter({ has: page.getByRole("button", { name: `Open ${name}’s profile`, exact: true }) });
const noOverflow = async (page) =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Calendar must fit the viewport",
  );

async function lessonLocation(page, name, location) {
  const block = page.getByRole("button", {
    name: new RegExp(`^${name},.*View lesson$`),
  });
  await expect(block.locator(".teacher-lesson-location")).toHaveText(location);
  await expect(block.locator(".teacher-lesson-location")).toBeVisible();
  const contentFits = await block.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return [...node.children].every((child) => {
      const content = child.getBoundingClientRect();
      return (
        content.left >= bounds.left &&
        content.right <= bounds.right + 1 &&
        content.top >= bounds.top &&
        content.bottom <= bounds.bottom + 1 &&
        child.scrollWidth <= child.clientWidth + 1
      );
    });
  });
  assert.equal(
    contentFits,
    true,
    `${name}'s time, name and ${location} must fit in the lesson block`,
  );
}

try {
  for (const [width, entry] of [
    [1440, "/book/"],
    [390, "/book/?view=book"],
    [390, "/book/?view=lessons"],
    [1440, "/book/?lesson=trial"],
    [390, "/my-lessons/"],
  ]) {
    const redirected = await fixture(width, { entry });
    await expect(redirected.page).toHaveURL(`${base}/schedule/`);
    await expect(redirected.page.getByRole("heading", { name: "Your schedule", exact: true })).toBeVisible();
    await expect(redirected.page.locator(".booking-steps")).toHaveCount(0);
    await noOverflow(redirected.page);
    assert.deepEqual(redirected.state.writes, []);
    assert.deepEqual(redirected.state.errors, []);
    await redirected.page.close();
  }
  const signedIn = await fixture(390, { entry: "/book/?view=lessons", signedOut: true });
  await expect(signedIn.page).toHaveURL(`${base}/book/?view=lessons`);
  await signedIn.page.getByLabel("Email", { exact: true }).fill(teacher.email);
  await signedIn.page.getByLabel("Password", { exact: true }).fill("isolated-fixture-password");
  await signedIn.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(signedIn.page).toHaveURL(`${base}/schedule/`);
  await expect(signedIn.page.locator("#teacher-week-title")).toBeVisible();
  assert.deepEqual(signedIn.state.writes, []);
  assert.deepEqual(signedIn.state.errors, []);
  await signedIn.page.close();

  const { page, state } = await fixture(1440);
  // Both lesson lengths retain visible location text through the week/day layout switch.
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 600)
      await page
        .getByRole("button", { name: "Monday 7 September, show lessons" })
        .click();
    await lessonLocation(page, "Alex", "Online");
    // An online lesson carries its call on the timetable, clear of its time.
    const meet = page.getByRole("link", { name: /^Join Google Meet with Alex,/ });
    await expect(meet).toBeVisible();
    await expect(meet).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    const time = await page
      .getByRole("button", { name: /^Alex,.*View lesson$/ })
      .locator(".teacher-lesson-time")
      .boundingBox();
    const pill = await meet.boundingBox();
    assert.ok(
      pill.y >= time.y + time.height || pill.x >= time.x + time.width,
      `Meet pill covers the lesson time at ${width}px`,
    );
    await expect(page.getByRole("link", { name: /^Join Google Meet with Sam,/ })).toHaveCount(0);
    if (width <= 600)
      await page
        .getByRole("button", { name: "Tuesday 8 September, show lessons" })
        .click();
    await lessonLocation(page, "Sam", "In Porto");
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // Wide, the week stands at its full height: no lesson hides in an inner box.
  assert.equal(
    await page
      .locator(".teacher-timetable-scroll")
      .evaluate((box) => box.scrollHeight - box.clientHeight <= 1),
    true,
    "The desktop timetable must not scroll inside itself",
  );
  await showHours(page);
  await dragDown(page, slot(page, 1, 480), slot(page, 1, 540));
  for (const minute of [480, 510, 540])
    await expect(slot(page, 1, minute)).toHaveAttribute("aria-pressed", "true");
  await slot(page, 1, 510).click();
  await expect(slot(page, 1, 510)).toHaveAttribute("aria-pressed", "false");
  await slot(page, 1, 540).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(slot(page, 1, 570)).toHaveAttribute("aria-pressed", "true");
  assert.equal(state.writes.length, 0, "Selection alone must not save hours");
  state.failHours = 1;
  await page
    .getByRole("button", { name: "Save weekly hours", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Hours could not be saved" })
    .waitFor();
  await expect(slot(page, 1, 570)).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Save weekly hours", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Weekly hours saved" })
    .waitFor();
  assert.deepEqual(
    state.rules
      .filter((rule) => rule.weekday === 1)
      .map(({ start_minute, last_start_minute }) => [
        start_minute,
        last_start_minute,
      ]),
    [
      [480, 480],
      [540, 690],
    ],
  );
  assert.deepEqual(
    state.rules.find((rule) => rule.weekday === 3),
    { id: 2, weekday: 3, start_minute: 615, last_start_minute: 705 },
    "Another day's precise hours must survive painting",
  );
  await slot(page, 3, 600).click();
  await expect(page.getByLabel("Wednesday window 1, first start")).toHaveValue(
    "10:15",
  );
  await page.getByLabel("Wednesday window 1, last start").fill("09:00");
  await expect(
    page.getByRole("button", { name: "Save weekly hours", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Discard", exact: true }).click();

  // Draft hours survive a lesson mutation and its subsequent booking reload.
  await slot(page, 1, 510).click();
  await showLessons(page);
  await page.getByRole("button", { name: /^Alex,.*View lesson$/ }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Join Google Meet", exact: true })).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  await page.getByRole("button", { name: "Mark no-show", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mark as a no-show?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm no-show" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(state.bookings[0].attendance_status, "no_show");
  await showHours(page);
  await expect(slot(page, 1, 510)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await showLessons(page);
  const sam = page.getByRole("button", { name: /^Sam,.*View lesson$/ });
  await sam.click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Join Google Meet", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sam).toBeFocused();
  await sam.click();
  // Before the lesson starts the control is there, closed, with when it opens.
  await expect(
    page.getByRole("button", { name: "Mark no-show", exact: true }),
  ).toBeDisabled();
  // Open from the start until six hours after the end.
  await expect(page.getByRole("dialog")).toContainText(/Available \d\d:\d\d–\d\d:\d\d/);
  await page.getByRole("button", { name: "Move lesson", exact: true }).click();
  await page.getByLabel("New date").fill("2026-09-10");
  await page.getByRole("dialog").getByLabel("Time in Porto").fill("00:30");
  state.failMove = 1;
  await page.getByRole("button", { name: "Save new time" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "That time is unavailable" })
    .waitFor();
  await expect(page.getByLabel("New date")).toHaveValue("2026-09-10");
  await page.getByRole("button", { name: "Save new time" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(
    state.bookings[1].starts_at,
    "2026-09-09T23:30:00.000Z",
    "Move must use Porto time across the UTC date boundary",
  );

  // A free time offers a choice rather than taking itself off: Escape puts
  // the choice away and keeps her place.
  const note = page.locator(".teacher-week .teacher-save-state");
  const writesBeforeChoice = state.writes.length;
  await slot(page, 2, 960).click();
  const choice = page.getByRole("menu");
  await expect(choice.getByRole("menuitem")).toHaveText(["Add a lesson here", "Take this time off"]);
  await expect(choice.getByRole("menuitem", { name: "Add a lesson here" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(choice).toHaveCount(0);
  await expect(slot(page, 2, 960)).toBeFocused();
  assert.equal(state.writes.length, writesBeforeChoice, "Choosing a time alone must not save");

  // Time off is taken on the calendar itself and saves as she chooses it.
  await takeOff(page, slot(page, 2, 960));
  await expect(slot(page, 2, 960)).toHaveAttribute("aria-pressed", "true");
  await expect(note).toHaveText("16:00–16:30 on Tue 8 Sept is off.");
  await takeOff(page, slot(page, 2, 990));
  await expect(note).toHaveText("16:30–17:00 on Tue 8 Sept is off.");
  assert.deepEqual(dayWrites(state).at(-1), {
    date: "2026-09-08",
    blocks: [{ startMinute: 960, endMinute: 1020 }],
  });
  await expect(
    page.locator(".teacher-block-label", { hasText: "Off 16:00–17:00" }),
  ).toBeVisible();
  await slot(page, 2, 960).click();
  await expect(slot(page, 2, 960)).toHaveAttribute("aria-pressed", "false");
  await expect(note).toHaveText("16:00–16:30 on Tue 8 Sept is open again.");
  assert.deepEqual(dayWrites(state).at(-1), {
    date: "2026-09-08",
    blocks: [{ startMinute: 990, endMinute: 1020 }],
  });

  await dragDown(page, slot(page, 3, 1020), slot(page, 3, 1050));
  for (const minute of [1020, 1050])
    await expect(slot(page, 3, minute)).toHaveAttribute("aria-pressed", "true");
  await expect(note).toHaveText("17:00–18:00 on Wed 9 Sept is off.");
  await slot(page, 3, 1050).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Take this time off" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(note).toHaveText("18:00–18:30 on Wed 9 Sept is off.");
  assert.deepEqual(dayWrites(state).at(-1), {
    date: "2026-09-09",
    blocks: [{ startMinute: 1020, endMinute: 1110 }],
  });

  // Weekly lunch is shown and cannot be toggled per date.
  const writesBefore = state.writes.length;
  await expect(slot(page, 1, 750)).toHaveAttribute("aria-label", /every week$/);
  await expect(
    page
      .locator(".teacher-block-label.is-weekly", { hasText: "Lunch" })
      .first(),
  ).toBeVisible();
  await slot(page, 1, 750).click({ force: true });
  // A weekly block can still hold a lesson she arranges, but can't be taken off.
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["Add a lesson here"]);
  await page.keyboard.press("Escape");
  assert.equal(state.writes.length, writesBefore, "Lunch must not be written");

  const mondayOff = page.getByRole("switch", {
    name: "Day off, Monday 7 September",
  });
  await mondayOff.click();
  await expect(mondayOff).toHaveAttribute("aria-checked", "true");
  await expect(note).toHaveText(
    "Mon 7 Sept is a day off. The lesson already booked stays in place.",
  );
  assert.deepEqual(dayWrites(state).at(-1), {
    date: "2026-09-07",
    dayOff: true,
  });
  await expect(
    page.getByRole("button", { name: /^Alex,.*View lesson$/ }),
  ).toBeVisible();
  await expect(slot(page, 1, 600)).toHaveAttribute("aria-label", /day off$/);
  await mondayOff.click();
  await expect(mondayOff).toHaveAttribute("aria-checked", "false");
  await expect(note).toHaveText("Mon 7 Sept is open again.");

  // A failed save puts the date back as it is actually saved.
  state.failDay = "2026-09-11";
  await takeOff(page, slot(page, 5, 600));
  await page
    .getByRole("alert")
    .filter({ hasText: "Fri 11 Sept was not changed." })
    .waitFor();
  await expect(slot(page, 5, 600)).toHaveAttribute("aria-pressed", "false");

  // Quick clicks while a save is in flight coalesce into the latest choice.
  let finishDaySave;
  state.dayGate = new Promise(resolve => { finishDaySave = resolve; });
  await takeOff(page, slot(page, 5, 900));
  await expect.poll(() => dayWrites(state, "2026-09-11").at(-1)).toEqual({
    date: "2026-09-11", blocks: [{ startMinute: 900, endMinute: 930 }],
  });
  for (const minute of [930, 960]) await takeOff(page, slot(page, 5, minute));
  state.dayGate = null;
  finishDaySave();
  await expect(note).toHaveText("16:00–16:30 on Fri 11 Sept is off.");
  await expect.poll(() => state.exceptions
    .filter(entry => entry.date === "2026-09-11")
    .map(entry => [entry.start_minute, entry.end_minute])).toEqual([[900, 990]]);
  assert.deepEqual(dayWrites(state, "2026-09-11").slice(-2), [
    { date: "2026-09-11", blocks: [{ startMinute: 900, endMinute: 930 }] },
    { date: "2026-09-11", blocks: [{ startMinute: 900, endMinute: 990 }] },
  ]);
  assert.deepEqual(
    state.exceptions
      .filter((entry) => entry.date === "2026-09-11")
      .map((entry) => [entry.start_minute, entry.end_minute]),
    [[900, 990]],
  );

  // One pager (14 October 2026): the way back shows only away from the current week.
  const thisWeek = page.getByRole("button", { name: "This week", exact: true });
  await expect(thisWeek).toHaveCount(0);
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(thisWeek).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Day off, Monday 31 August" }),
  ).toBeDisabled();
  // A time gone can't be taken off, but a lesson she has had can be recorded there.
  await expect(slot(page, 1, 600)).not.toHaveAttribute("aria-disabled", "true");
  await slot(page, 1, 600).click();
  await expect(page.getByRole("menuitem", { name: "Add a lesson here", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Take this time off", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Reopening a holiday removes only whole-day rows; its hours and extras stay.
  await thisWeek.click();
  await expect(page.getByRole("switch", { name: "Day off, Monday 7 September", exact: true })).toBeVisible();
  await expect(page.locator("#teacher-week-title")).toBeFocused();
  await expect(thisWeek).toHaveCount(0);
  await page.getByRole("button", { name: "Next week" }).click();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.locator(".teacher-off-label")).toHaveText(
    "Day off · Holiday · Duplicate day",
  );
  const holiday = page.getByRole("switch", {
    name: "Day off, Monday 21 September",
  });
  await expect(holiday).toHaveAttribute("aria-checked", "true");
  await holiday.click();
  await expect(holiday).toHaveAttribute("aria-checked", "false");
  await expect(
    page.locator(".teacher-block-label", { hasText: "Off 10:00–11:00" }),
  ).toBeVisible();
  assert.deepEqual(
    state.exceptions
      .filter((entry) => ["2026-09-21", "2026-09-22"].includes(entry.date))
      .map((entry) => entry.id),
    [2, 3],
  );
  assert.equal(
    state.bookings.filter((entry) => entry.status === "confirmed").length,
    2,
  );
  await page.getByRole("button", { name: "This week" }).click();

  // No loose lessons: a free time asks whose lesson it is, and the lesson
  // form belongs to that student.
  await expect(page.locator(".teacher-manual")).toHaveCount(0);
  await slot(page, 5, 1020).click();
  await page.getByRole("menuitem", { name: "Add a lesson here", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sam Known", exact: true }).click();
  const forSam = studentRow(page, "Sam Known");
  const forSamForm = forSam.getByRole("region", { name: "Sam Known’s setup", exact: true });
  await forSamForm.getByRole("radio", { name: "In Porto", exact: true }).check();
  await forSamForm.getByRole("button", { name: "Add lesson and email student", exact: true }).click();
  // The lesson is added in the student's row, keeping the chosen time.
  await expect(forSam.getByRole("status")).toContainText("emailed");
  await expect(forSamForm).toBeHidden();
  assert.equal(state.writes.find((entry) => entry.path === "/admin/bookings").data.location, "porto");
  assert.equal(state.writes.find((entry) => entry.path === "/admin/bookings").data.studentId, "sam");
  assert.equal(state.writes.find((entry) => entry.path === "/admin/bookings").data.startAt, "2026-09-11T16:00:00.000Z", "The free time keeps its Porto date and time");
  await showLessons(page);
  await page.getByRole("button", { name: /^Sam Known, .*11 September.*View lesson$/ }).click();
  await page
    .getByRole("button", { name: "Cancel lesson", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cancel this lesson?" }),
  ).toBeVisible();
  assert.equal(
    state.bookings.find((entry) => entry.id.startsWith("manual")).status,
    "confirmed",
  );
  const cancellationMessage = "Olá Sam, I’m sorry, I’m unwell today.\nPlease reply and we can find another time.";
  const messageField = page.getByLabel(/^Add a message to the email \(optional\)/);
  await expect(messageField).toHaveAttribute("maxlength", "1000");
  await messageField.fill(cancellationMessage);
  await page.getByRole("button", { name: "Back to lesson" }).click();
  await page.getByRole("button", { name: "Cancel lesson", exact: true }).click();
  await expect(messageField).toHaveValue(cancellationMessage);
  const dialogBounds = await page.getByRole("dialog").boundingBox();
  assert.ok(dialogBounds.y >= 0 && dialogBounds.y + dialogBounds.height <= page.viewportSize().height + 1,
    "the cancellation stays inside the viewport after the calendar has scrolled");
  state.failCancel = 1;
  await page.getByRole("button", { name: "Yes, cancel lesson" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Please try again");
  await expect(messageField).toHaveValue(cancellationMessage);
  await page.getByRole("button", { name: "Yes, cancel lesson" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(
    state.bookings.find((entry) => entry.id.startsWith("manual")).status,
    "cancelled",
  );
  assert.equal(state.writes.filter(entry => entry.path.endsWith("/cancel")).at(-1).data.message, cancellationMessage);

  // Her next lesson leads the page with its call: Alex's is happening now.
  const nextLesson = page.locator(".teacher-next");
  await expect(nextLesson).toContainText("Happening now");
  await expect(nextLesson).toContainText("Alex");
  await expect(
    nextLesson.getByRole("link", { name: "Join Google Meet with Alex", exact: true }),
  ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  await nextLesson.getByRole("button", { name: /Alex/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Alex");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A free time adds a lesson there, its date and time already in place, and
  // the lesson reads as hers rather than a student's booking.
  await slot(page, 4, 1080).click();
  await page.getByRole("menuitem", { name: "Add a lesson here", exact: true }).click();
  const addDialog = page.getByRole("dialog");
  // Someone new is set up first, then the lesson keeps the time she chose.
  await addDialog.getByRole("button", { name: "Add a new student", exact: true }).click();
  await addDialog.getByLabel("Full name").fill("Kai");
  await addDialog.getByLabel("Email").fill("kai@example.invalid");
  await addDialog.getByRole("button", { name: "Next: their lessons", exact: true }).click();
  const kai = studentRow(page, "Kai");
  await kai.getByRole("region", { name: "Kai’s setup", exact: true }).getByRole("button", { name: "Add lesson", exact: true }).click();
  await expect(kai.getByRole("status")).toContainText("18:00");
  await expect(kai.getByRole("status")).not.toContainText("emailed");
  assert.equal(
    state.writes.filter((entry) => entry.path === "/admin/bookings").at(-1).data.startAt,
    "2026-09-10T17:00:00.000Z",
    "A lesson added from a time keeps that Porto time",
  );
  await showLessons(page);
  await expect(
    page.getByRole("button", { name: /^Kai,.*added by you\. View lesson$/ }),
  ).toHaveClass(/teacher-calendar-lesson--added/);

  // A student she already has: the lesson belongs to their account. A weekly
  // slot says what was booked and which week was left out.
  await slot(page, 2, 1080).click();
  await page.getByRole("menuitem", { name: "Add a lesson here", exact: true }).click();
  const weeklyDialog = page.getByRole("dialog");
  await weeklyDialog.getByRole("button", { name: "Sam Known", exact: true }).click();
  await forSamForm.getByRole("radio", { name: "Weekly", exact: true }).check();
  await expect(forSamForm.getByRole("radio", { name: "Until stopped", exact: true })).toBeChecked();
  await forSamForm.getByRole("radio", { name: "4 weeks", exact: true }).check();
  await forSamForm.getByRole("button", { name: "Add weekly lessons and email student", exact: true }).click();
  await expect(forSam.getByRole("status")).toContainText("1 Oct left out");
  const weekly = state.writes.filter((entry) => entry.path === "/admin/bookings").at(-1).data;
  assert.deepEqual([weekly.studentId, weekly.repeat], ["sam", 4]);
  // Students keeps unfinished setup and completed profiles in one place.
  const students = page.locator(".teacher-students");
  await page.getByRole("tab", { name: /^Students/ }).click();
  const samSetup = students.locator(".teacher-setup").filter({ hasText: "Sam Known" });
  await samSetup.getByRole("button", { name: "Welcome for Sam Known", exact: true }).click();
  const samPane = samSetup.getByRole("region", { name: "Sam Known’s setup", exact: true });
  await samPane.getByRole("button", { name: "Send the link again to Sam Known", exact: true }).click();
  await expect.poll(() => state.writes.filter(entry => entry.path === "/admin/students/sam/welcome").length).toBe(1);
  await samSetup.getByRole("button", { name: "Close", exact: true }).click();
  // Setting up a student's details does not email them or skip their lesson step.
  await students.getByRole("button", { name: "Add a student", exact: true }).click();
  const addStudent = page.getByRole("dialog");
  await addStudent.getByLabel("Full name").fill("Ana Costa");
  await addStudent.getByLabel("Email").fill("ana@example.invalid");
  await addStudent.getByLabel(/^Phone/).fill("+351 912 345 678");
  await addStudent.getByLabel(/^NIF/).fill("123456789");
  await addStudent.getByRole("button", { name: "Bloom", exact: true }).click();
  // Her price for them from the start; the other length stays standard.
  await addStudent.getByLabel("Price for 60 minutes, in euros").fill("20");
  await addStudent.getByRole("button", { name: "Next: their lessons", exact: true }).click();
  assert.deepEqual(state.writes.filter((entry) => entry.path === "/admin/students").at(-1).data,
    { email: "ana@example.invalid", name: "Ana Costa", phone: "+351 912 345 678", nif: "123456789", mark: "bloom", prices: { 60: 2000 } });
  const ana = students.locator(".teacher-setup").filter({ hasText: "Ana Costa" });
  const anaForm = ana.getByRole("region", { name: "Ana Costa’s setup", exact: true });
  await expect(anaForm.getByRole("radio", { name: "60 mins, €20" })).toBeVisible();
  await expect(anaForm.getByRole("radio", { name: "90 mins, €35" })).toBeVisible();
  await ana.getByRole("button", { name: "Close", exact: true }).click();
  const anaId = state.added.id;
  assert.equal(state.writes.filter(entry => entry.path === `/admin/students/${anaId}/welcome`).length, 0, "Setting up Ana does not email her");
  await expect(ana.getByRole("button", { name: "Welcome for Ana Costa", exact: true })).toBeDisabled();

  // Completed students keep history, editing and lesson creation in their row.
  const alex = students.locator(".teacher-student.is-ready").filter({ hasText: "Alex" });
  await alex.getByRole("button", { name: "Open Alex’s profile", exact: true }).click();
  const profile = alex.getByRole("region", { name: "Alex’s profile", exact: true });
  await expect(profile).toContainText("No lessons recorded yet.");
  await alex.getByRole("button", { name: "Details for Alex", exact: true }).click();
  await expect(profile.getByLabel("Full name", { exact: true })).toHaveValue("Alex");
  await expect(profile.getByLabel(/^Email/)).toHaveValue("alex@example.invalid");
  await alex.getByRole("button", { name: "Close", exact: true }).click();
  await expect(profile).toBeHidden();
  await alex.getByRole("button", { name: "Price for Alex", exact: true }).click();
  await expect(profile.getByLabel("Price for 60 minutes, in euros", { exact: true })).toBeEnabled();
  await alex.getByRole("button", { name: "Close", exact: true }).click();
  await alex.getByRole("button", { name: "Add a lesson for Alex", exact: true }).click();
  await expect(profile.getByRole("group", { name: "Choose a date and time", exact: true })).toBeVisible();
  await alex.getByRole("button", { name: "Close", exact: true }).click();

  // Her setup follows price, lessons, email and welcome. Later unfinished
  // steps stay closed; completed steps can still be corrected.
  const noraSetup = students.locator(".teacher-setup").filter({ hasText: "Nora Lima" });
  const setupForm = noraSetup.getByRole("region", { name: "Nora Lima’s setup", exact: true });
  for (const label of ["Email", "Welcome", "Sign in", "Card"])
    await expect(noraSetup.getByRole("button", { name: `${label} for Nora Lima`, exact: true })).toBeDisabled();
  await noraSetup.getByRole("button", { name: "Open Nora Lima’s profile", exact: true }).click();
  const noraProfile = noraSetup.getByRole("region", { name: "Nora Lima’s profile", exact: true });
  await noraProfile.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(noraProfile.getByLabel(/^Email/)).toBeDisabled();
  await noraSetup.getByRole("button", { name: "Close", exact: true }).click();

  await noraSetup.getByRole("button", { name: "Price for Nora Lima", exact: true }).click();
  await setupForm.getByLabel("Price for 60 minutes, in euros", { exact: true }).fill("24");
  await setupForm.getByRole("button", { name: "Save price", exact: true }).click();
  await expect.poll(() => state.writes.filter(entry => entry.path === "/admin/students/nora/prices").at(-1)?.data).toEqual({ prices: { 60: 2400, 90: null } });
  await noraSetup.getByRole("button", { name: "Lessons for Nora Lima", exact: true }).click();
  await expect(setupForm.getByRole("radio", { name: "60 mins, €24" })).toBeVisible();
  const picker = setupForm.getByRole("group", { name: "Choose a date and time", exact: true });
  // Earlier days are hers to choose too, for a lesson already had (15 October 2026).
  const todayChoice = picker.getByRole("button", { name: "Monday 7 September", exact: true });
  await todayChoice.press("ArrowLeft");
  await expect(picker.getByRole("button", { name: "Sunday 6 September", exact: true })).toBeFocused();
  await picker.getByRole("button", { name: "Previous month", exact: true }).click();
  await picker.getByRole("button", { name: "Thursday 27 August", exact: true }).click();
  // Any quarter hour, weekly hours or not; then only how it was paid.
  await picker.getByRole("button", { name: "09:30 Porto time, already past", exact: true }).click();
  await expect(setupForm.getByRole("radio", { name: "Weekly", exact: true })).toHaveCount(0);
  await expect(setupForm.getByRole("radio", { name: "Paid", exact: true })).toHaveAttribute("aria-checked", "true");
  await setupForm.getByRole("radio", { name: "Unpaid", exact: true }).click();
  await setupForm.getByRole("button", { name: "Add past lesson", exact: true }).click();
  await expect(noraSetup.getByRole("status")).toContainText("27 Aug, 09:30 · unpaid");
  assert.deepEqual(state.writes.filter(entry => entry.path === "/admin/bookings").at(-1).data, {
    studentId: "nora", lessonType: "single", startAt: "2026-08-27T08:30:00.000Z", location: "online", notes: "", payment: "unpaid",
  });
  await noraSetup.getByRole("button", { name: "Lessons for Nora Lima", exact: true }).click();
  await picker.getByRole("button", { name: "Next month", exact: true }).click();
  await picker.getByRole("button", { name: "Previous month", exact: true }).click();
  await picker.getByRole("button", { name: "Wednesday 30 September", exact: true }).click();
  await picker.getByRole("button", { name: "17:00 Porto time", exact: true }).click();
  // A different length needs that length's availability and a new time choice.
  await setupForm.getByRole("radio", { name: "90 mins, €36", exact: true }).check();
  await expect(setupForm.getByRole("button", { name: "Add lesson", exact: true })).toBeDisabled();
  await picker.getByRole("button", { name: "18:00 Porto time", exact: true }).click();
  state.failCreate = 1;
  const beforeConflict = state.writes.filter(entry => entry.path === "/admin/bookings").length;
  await setupForm.getByRole("button", { name: "Add lesson", exact: true }).click();
  await expect(setupForm.getByRole("alert")).toContainText("That time has just been taken");
  await expect(setupForm.getByRole("button", { name: "Add lesson", exact: true })).toBeDisabled();
  await picker.getByRole("button", { name: "18:30 Porto time", exact: true }).click();
  assert.equal(state.writes.filter(entry => entry.path === "/admin/bookings").length, beforeConflict + 1, "A conflict does not automatically create another lesson");
  await setupForm.getByRole("button", { name: "Add lesson", exact: true }).click();
  await expect(noraSetup.getByRole("status")).toContainText("30 Sept, 18:30");
  assert.deepEqual(state.writes.filter(entry => entry.path === "/admin/bookings").at(-1).data, {
    studentId: "nora", lessonType: "long", startAt: "2026-09-30T17:30:00.000Z", location: "online", notes: "",
  });
  assert.ok(state.availabilityReads.includes("long"), "90-minute choices request 90-minute availability");
  await expect(noraSetup.getByRole("status")).not.toContainText("emailed");
  assert.equal(state.writes.filter(entry => entry.path === "/admin/students/nora/welcome").length, 0, "Adding the lesson waits for Nora's welcome");
  await expect(noraSetup.getByRole("button", { name: "Welcome for Nora Lima", exact: true })).toBeDisabled();
  // The completed price remains editable after a lesson exists.
  await noraSetup.getByRole("button", { name: "Price for Nora Lima", exact: true }).click();
  await expect(setupForm.getByLabel("Price for 60 minutes, in euros", { exact: true })).toHaveValue("24");
  await noraSetup.getByRole("button", { name: "Close", exact: true }).click();

  await noraSetup.getByRole("button", { name: "Email for Nora Lima", exact: true }).click();
  await expect(setupForm.getByLabel(/^Email/)).toBeFocused();
  await setupForm.getByLabel(/^Email/).fill("nora@example.invalid");
  // A background read started before the save must not replace its newer data.
  let releaseOlderStudents;
  state.studentsGate = new Promise(resolve => { releaseOlderStudents = resolve; });
  const beforeStudentsRead = state.studentsReads;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.setFixedTime(new Date("2026-09-07T10:21:00Z"));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
  });
  await expect.poll(() => state.studentsReads).toBeGreaterThan(beforeStudentsRead);
  const isStudentRead = response => new URL(response.url()).pathname === "/admin/students" && response.request().method() === "GET";
  const savedStudents = page.waitForResponse(isStudentRead);
  await setupForm.getByRole("button", { name: "Save details", exact: true }).click();
  assert.deepEqual(state.writes.filter(entry => entry.path === "/admin/students/nora/details").at(-1).data,
    { name: "Nora Lima", email: "nora@example.invalid", phone: "", nif: "", mark: "" });
  await expect(setupForm).toBeHidden();
  await expect(noraSetup.getByRole("button", { name: "Email for Nora Lima", exact: true })).toBeFocused();
  await (await savedStudents).finished();
  const olderStudents = page.waitForResponse(isStudentRead);
  releaseOlderStudents();
  await (await olderStudents).finished();
  await expect(noraSetup.getByRole("button", { name: "Welcome for Nora Lima", exact: true })).toBeEnabled();
  assert.equal(state.writes.filter(entry => entry.path === "/admin/students/nora/welcome").length, 0, "Adding the email does not send Nora's welcome");
  await expect(noraSetup.getByRole("button", { name: "Sign in for Nora Lima", exact: true })).toBeDisabled();

  await noraSetup.getByRole("button", { name: "Welcome for Nora Lima", exact: true }).click();
  await setupForm.getByRole("button", { name: "Send welcome email to Nora Lima", exact: true }).click();
  await expect.poll(() => state.writes.filter(entry => entry.path === "/admin/students/nora/welcome").length).toBe(1);
  // Sign-in belongs to the student; her card step waits until she has signed in.
  await noraSetup.getByRole("button", { name: "Sign in for Nora Lima", exact: true }).click();
  await expect(setupForm.getByRole("button", { name: "Send the link again to Nora Lima", exact: true })).toBeEnabled();
  await expect(noraSetup.getByRole("button", { name: "Card for Nora Lima", exact: true })).toBeDisabled();
  state.students.find(student => student.id === "nora").signedIn = true;
  await page.reload();
  await page.getByRole("tab", { name: /^Students/ }).click();
  await expect(noraSetup.getByRole("button", { name: "Sign in for Nora Lima", exact: true })).toBeEnabled();
  await noraSetup.getByRole("button", { name: "Card for Nora Lima", exact: true }).click();
  await expect(setupForm.getByRole("button", { name: "Send the link again to Nora Lima", exact: true })).toBeEnabled();
  // Once her student finishes setup, the same saved details and lessons
  // remain available through the normal student row.
  Object.assign(state.students.find(student => student.id === "nora"), { hasCard: true, cardForAllLessons: true });
  await page.reload();
  await page.getByRole("tab", { name: /^Students/ }).click();
  const noraReady = studentRow(page, "Nora Lima");
  await noraReady.getByRole("button", { name: "Lesson history for Nora Lima", exact: true }).click();
  const readyProfile = noraReady.getByRole("region", { name: "Nora Lima’s profile", exact: true });
  // The 30 September lesson, and the one she recorded as had and still owed.
  await expect(readyProfile.locator(".teacher-history-lesson")).toHaveCount(2);
  await expect(readyProfile.getByRole("region", { name: /^Past/ }).locator(".teacher-history-lesson")).toContainText("Unpaid");
  await noraReady.getByRole("button", { name: "Details for Nora Lima", exact: true }).click();
  await expect(readyProfile.getByLabel(/^Email/)).toHaveValue("nora@example.invalid");
  await noraReady.getByRole("button", { name: "Close", exact: true }).click();

  // Select a few dates, apply time off, then see those same days in the week.
  await page.getByRole("tab", { name: "Time off", exact: true }).click();
  const timeOff = page.locator(".teacher-timeoff");
  const holidayDates = ["2026-09-28", "2026-09-29", "2026-09-30"];
  for (const date of holidayDates) await timeOff.locator(`[data-timeoff-date="${date}"]`).click();
  await timeOff.getByRole("button", { name: "Take 3 days off", exact: true }).click();
  await expect
    .poll(() => holidayDates.map((date) => dayWrites(state, date).at(-1)))
    .toEqual(holidayDates.map((date) => ({ date, dayOff: true })));
  await expect(timeOff.locator(".teacher-save-state")).toHaveText("3 selected days are off.");
  for (const date of holidayDates) await expect(timeOff.locator(`[data-timeoff-date="${date}"]`)).toHaveClass(/is-off/);
  await showLessons(page);
  for (let index = 0; index < 3; index++) await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("switch", { name: "Day off, Tuesday 29 September" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "This week" }).click();
  state.failBookings = true;
  await page.getByRole("button", { name: "Next week" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Lessons could not be loaded" })
    .waitFor();
  await expect(
    page.getByText("No lessons booked this week.", { exact: false }),
  ).toHaveCount(0);
  state.failBookings = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".teacher-timetable")).toBeVisible();
  await noOverflow(page);
  assert.deepEqual(state.errors, []);
  await page.close();

  const mobile = await fixture(390);
  // A phone's day scrolls in its own box, opening at her first teaching hour
  // or the day's first lesson, whichever is earlier: Monday at 10:00, ahead
  // of Alex at 11:00, and Tuesday, which has no hours, at Sam's 14:00.
  const opensAt = (minute) =>
    mobile.page.locator(".teacher-timetable-scroll").evaluate((box, at) => {
      const top = Math.min(
        box.querySelector(`[data-axis-minute="${at}"]`).offsetTop,
        box.scrollHeight - box.clientHeight,
      );
      return Math.abs(box.scrollTop - top) <= 1;
    }, minute);
  assert.equal(await opensAt(600), true, "Monday should open at 10:00");
  await mobile.page
    .getByRole("button", { name: "Tuesday 8 September, show lessons" })
    .tap();
  assert.equal(await opensAt(840), true, "Tuesday should open at Sam's lesson");
  const tuesdayOff = mobile.page.getByRole("switch", {
    name: "Day off, Tuesday 8 September",
  });
  await expect(
    mobile.page.getByRole("switch", { name: "Day off, Monday 7 September" }),
  ).toBeHidden();
  await tuesdayOff.tap();
  await expect(tuesdayOff).toHaveAttribute("aria-checked", "true");
  await mobile.page
    .locator(".teacher-week .teacher-save-state")
    .filter({ hasText: "The lesson already booked stays in place." })
    .waitFor();
  await expect(
    mobile.page.getByRole("button", { name: /^Sam,.*View lesson$/ }),
  ).toBeVisible();
  await noOverflow(mobile.page);
  await tuesdayOff.tap();
  await expect(tuesdayOff).toHaveAttribute("aria-checked", "false");
  await takeOff(mobile.page, slot(mobile.page, 2, 1080), { tap: true });
  await expect(slot(mobile.page, 2, 1080)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await mobile.page
    .locator(".teacher-week .teacher-save-state")
    .filter({ hasText: "18:00–18:30 on Tue 8 Sept is off." })
    .waitFor();
  await showHours(mobile.page);
  // Weekends are left out of her week until they have hours of their own, so
  // Saturday is added through Set exact hours, and then appears.
  await expect(
    mobile.page.getByRole("button", { name: "Saturday, show weekly hours" }),
  ).toHaveCount(0);
  await mobile.page.getByText("Set exact hours", { exact: true }).tap();
  await mobile.page
    .locator(".teacher-exact-hours__body select")
    .selectOption({ label: "Saturday" });
  await mobile.page
    .getByRole("button", { name: "Add a time window", exact: true })
    .tap();
  await mobile.page
    .getByRole("button", { name: "Saturday, show weekly hours" })
    .tap();
  await expect(slot(mobile.page, 6, 600)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await mobile.page
    .getByRole("button", { name: "Save weekly hours", exact: true })
    .click();
  await mobile.page
    .getByRole("status")
    .filter({ hasText: "Weekly hours saved" })
    .waitFor();
  for (const width of [390]) {
    await mobile.page.setViewportSize({ width, height: 900 });
    await noOverflow(mobile.page);
  }
  await mobile.page.setViewportSize({ width: 390, height: 844 });
  await showLessons(mobile.page);
  await mobile.page.getByRole("button", { name: "Tuesday 8 September, show lessons" }).tap();
  await mobile.page.getByRole("button", { name: /^Sam,.*View lesson$/ }).tap();
  await mobile.page.getByRole("button", { name: "Cancel lesson", exact: true }).tap();
  const phoneMessage = mobile.page.getByLabel(/^Add a message to the email \(optional\)/);
  const longMessage = "Obrigada! ".repeat(100);
  await phoneMessage.fill(longMessage);
  for (const width of [390]) {
    await mobile.page.setViewportSize({ width, height: 844 });
    const confirm = mobile.page.getByRole("button", { name: "Yes, cancel lesson" });
    await confirm.scrollIntoViewIfNeeded();
    const bounds = await mobile.page.getByRole("dialog").boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 845);
    assert.ok(await confirm.evaluate(node => node.scrollWidth <= node.clientWidth + 1), "the full cancellation label fits");
    await expect(phoneMessage).toHaveValue(longMessage);
  }
  await mobile.page.getByRole("button", { name: "Yes, cancel lesson" }).click();
  await expect(mobile.page.getByRole("dialog")).toHaveCount(0);
  assert.equal(mobile.state.writes.filter(entry => entry.path.endsWith("/cancel")).at(-1).data.message, longMessage);
  assert.deepEqual(mobile.state.errors, []);
  await mobile.page.close();

  for (const width of [1280, 390]) {
    const { page, state } = await fixture(width);
    state.history = [
      { ...lesson("past", "Sam Known", "2025-12-12T09:00:00Z"), student_id: "sam", student_email: "old-address@example.invalid", payment_status: "paid", reschedule_count: 1 },
      { ...lesson("upcoming", "Sam Known", "2026-09-10T16:00:00Z"), student_id: "sam", added_by_teacher: 1, payment_status: "not_required" },
      { ...lesson("cancelled", "Sam Known", "2026-09-11T16:00:00Z"), student_id: "sam", status: "cancelled", cancelled_by: "teacher", cancellation_message: "See you next week.", payment_status: "refunded" },
      { ...lesson("no-show", "Sam Known", "2026-08-14T09:00:00Z", "porto"), student_id: "sam", attendance_status: "no_show", payment_status: "paid" },
      { ...lesson("legacy", "Sam Known", "2026-08-01T09:00:00Z"), student_email: "SAM@example.invalid", payment_status: "paid" },
      { ...lesson("other", "Sam Known", "2026-08-02T09:00:00Z"), student_id: "someone-else", student_email: "sam@example.invalid", notes: "ANOTHER ACCOUNT MUST NOT APPEAR" },
      { ...lesson("checkout", "Sam Known", "2026-09-12T09:00:00Z"), student_id: "sam", status: "pending_payment", payment_status: "pending", notes: "UNFINISHED CHECKOUT MUST NOT APPEAR" },
    ];
    await page.getByRole("tab", { name: /^Students/ }).click();
    const open = page.getByRole("button", { name: "Open Sam Known’s profile", exact: true });
    await open.focus();
    await page.keyboard.press("Enter");
    const samRow = studentRow(page, "Sam Known");
    const history = samRow.getByRole("region", { name: "Sam Known’s profile", exact: true });
    await expect(history.getByRole("heading", { name: "Upcoming · 1" })).toBeVisible();
    await expect(history.getByRole("heading", { name: "Past & cancelled · 4" })).toBeVisible();
    await expect(history.locator(".teacher-history-lesson")).toHaveCount(5);
    await expect(history).toContainText("12 Dec 2025");
    await expect(history).toContainText("Payment arranged directly");
    await expect(history).toContainText("Refunded");
    await expect(history).toContainText("No-show");
    await expect(history).toContainText("Moved once");
    await expect(history).toContainText("Cancelled by you");
    await expect(history).toContainText("See you next week.");
    await expect(history).not.toContainText("MUST NOT APPEAR");
    await expect(history.locator("section").last().locator("li").first()).toContainText("11 Sept ·");
    assert.ok(state.historyReads > 0, "History requests all dates, separately from the current week");
    await history.getByRole("button", { name: "Edit details", exact: true }).click();
    await expect(history.getByLabel("Full name", { exact: true })).toHaveValue("Sam Known");
    await expect(history.getByLabel(/^Email/)).toHaveValue("sam@example.invalid");
    await samRow.getByRole("button", { name: "Close", exact: true }).click();
    await expect(history).toBeHidden();
    await expect(open).toBeFocused();
    // A failed read stays an error, never an empty history, and can be retried.
    state.failHistory = true;
    await open.click();
    await expect(history.getByRole("alert")).toContainText("could not be loaded");
    await expect(history).not.toContainText("No lessons recorded");
    state.failHistory = false;
    await history.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(history.locator(".teacher-history-lesson")).toHaveCount(5);
    await samRow.getByRole("button", { name: "Close", exact: true }).click();
    // Closing a slow request and opening another account cannot cross the histories.
    let release;
    state.historyGate = new Promise(resolve => { release = resolve; });
    await open.click();
    await expect(history.getByRole("status")).toHaveText("Loading lesson history…");
    await samRow.getByRole("button", { name: "Close", exact: true }).click();
    state.historyGate = null;
    await page.getByRole("button", { name: "Open Alex’s profile", exact: true }).click();
    const other = studentRow(page, "Alex").getByRole("region", { name: "Alex’s profile", exact: true });
    await expect(other).toContainText("No lessons recorded yet.");
    release();
    await page.waitForTimeout(100);
    await expect(other.locator(".teacher-history-lesson")).toHaveCount(0);
    // A session loss removes the private view, including a response still in flight.
    await page.evaluate(() => { localStorage.removeItem("ines-student-session"); window.dispatchEvent(new Event("ines:student-session-change")); });
    await expect(other).toHaveCount(0);
    await expect(page.locator(".teacher-workspace")).toHaveCount(0);
    assert.deepEqual(state.writes, [], "Reading history never updates a booking or sends an email");
    assert.deepEqual(state.errors, []);
    await page.close();
  }

  // A chosen day's card offers the whole day or some hours; hours open an
  // explicit draft of one or more breaks, saved only when she presses Save.
  for (const width of [1280, 390]) {
    const { page, state } = await fixture(width);
    const originalBookings = structuredClone(state.bookings);
    const originalRules = structuredClone(state.rules);
    await page.getByRole("tab", { name: "Time off", exact: true }).click();
    const timeOff = page.locator(".teacher-timeoff");
    const card = timeOff.locator(".teacher-timeoff-selection");
    await expect(card.getByRole("heading", { name: "Tap the days you want off" })).toBeVisible();
    await expect(timeOff.getByRole("button", { name: "This month", exact: true })).toHaveCount(0);
    const date = page.locator('[data-timeoff-date="2026-09-21"]');
    await date.click();
    await expect(date).toHaveAttribute("aria-pressed", "true");
    // One day reads as many do (14 October 2026): its chip, then its own details.
    await expect(card.getByRole("heading", { name: "1 day chosen" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Remove Monday 21 September" })).toBeVisible();
    await expect(card).toContainText("A day off");
    const hours = card.getByRole("button", { name: /^(Take some|Change) hours off$/ });
    await hours.click();
    const popup = page.getByRole("dialog", { name: "Mon 21 September" });
    await expect(popup.getByLabel("From 1", { exact: true })).toHaveValue("10:00");
    await popup.getByLabel("Until 1", { exact: true }).fill("11:30");
    await popup.getByRole("button", { name: "Add another break" }).click();
    await popup.getByLabel("From 2", { exact: true }).fill("15:00");
    await popup.getByLabel("Until 2", { exact: true }).fill("14:00");
    await popup.getByRole("button", { name: "Save hours off", exact: true }).click();
    await expect(popup.getByRole("alert")).toContainText("later end");
    assert.equal(state.writes.length, 0);
    await popup.getByLabel("Until 2", { exact: true }).fill("00:00");
    state.failDay = "2026-09-21";
    await popup.getByRole("button", { name: "Save hours off", exact: true }).click();
    await expect(popup.getByRole("alert")).toContainText("busy");
    await expect(popup.getByLabel("Until 2", { exact: true })).toHaveValue("00:00");
    await popup.getByRole("button", { name: "Save hours off", exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(hours).toBeFocused();
    assert.deepEqual(state.writes.at(-1).data, { date: "2026-09-21", dayOff: false, blocks: [{ startMinute: 600, endMinute: 690 }, { startMinute: 900, endMinute: 1440 }] });
    await expect(date).not.toHaveClass(/is-off|is-partial/);
    await expect(card).toContainText("Off 10:00–11:30, 15:00–");
    await hours.click();
    await expect(popup.getByLabel("Until 2", { exact: true })).toHaveValue("00:00");
    await popup.getByRole("button", { name: "Close hours off" }).click();
    await card.getByRole("button", { name: "Take the day off", exact: true }).click();
    await expect(date).toHaveClass(/is-off/);
    await card.getByRole("button", { name: "Make available", exact: true }).click();
    await expect(date).not.toHaveClass(/is-off/);
    await hours.click();
    await popup.getByRole("button", { name: "Remove hours off", exact: true }).click();
    await expect(popup).toHaveCount(0);
    assert.ok(!state.exceptions.some(row => row.date === "2026-09-21"), "Making the day available and removing its hours clears the date");
    assert.ok(state.exceptions.some(row => row.weekday === 1 && row.note === "Lunch"), "The recurring lunch break stays in place");
    assert.ok(state.exceptions.some(row => row.kind === "extra"), "Extra hours stay in place");
    // A booked lesson on a chosen day is its own card, opening the lesson
    // so she can move it; the hours draft names only lessons it overlaps.
    await card.getByRole("button", { name: "Clear", exact: true }).click();
    await page.locator('[data-timeoff-date="2026-09-08"]').click();
    const booked = card.locator(".teacher-timeoff-lessons .teacher-lesson-card");
    await expect(booked).toHaveCount(1);
    await expect(booked).toContainText("Sam");
    await booked.getByRole("button", { name: /^Change lesson for Sam/ }).click();
    await expect(page.getByRole("dialog", { name: "Sam", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close lesson details", exact: true }).click();
    await expect(booked.getByRole("button", { name: /^Change lesson for Sam/ })).toBeFocused();
    await hours.click();
    const bookedDay = page.getByRole("dialog", { name: "Tue 8 September" });
    await expect(bookedDay.locator(".teacher-timeoff-booked")).toHaveCount(0);
    await bookedDay.getByLabel("From 1", { exact: true }).fill("14:00");
    await bookedDay.getByLabel("Until 1", { exact: true }).fill("15:00");
    await expect(bookedDay.getByRole("status")).toContainText("Sam");
    assert.ok(await bookedDay.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await bookedDay.getByRole("button", { name: "Save hours off", exact: true }).click();
    await expect(bookedDay).toHaveCount(0);
    assert.deepEqual(state.bookings, originalBookings);
    assert.deepEqual(state.rules, originalRules);
    // Weekly edits that cross a booked time warn before saving, and on success.
    await showHours(page);
    await slot(page, 1, 660).click();
    const clash = page.locator(".teacher-hours-warning .teacher-lesson-card");
    await expect(clash).toHaveCount(1);
    await expect(clash).toContainText("Alex");
    await expect(page.locator(".teacher-hours-warning")).toContainText("This lesson is outside your new hours. It stays booked.");
    const changeLesson = clash.getByRole("button", { name: /^Change lesson for Alex/ });
    const writesBeforeOpen = state.writes.length;
    await changeLesson.click();
    await expect(page.getByRole("dialog", { name: "Alex", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close lesson details", exact: true }).click();
    await expect(changeLesson).toBeFocused();
    await expect(slot(page, 1, 660)).toHaveAttribute("aria-pressed", "false");
    assert.equal(state.writes.length, writesBeforeOpen, "Opening a clash leaves the lesson and weekly-hours draft unchanged");
    await page.getByRole("button", { name: "Save weekly hours", exact: true }).click();
    await expect(page.locator(".teacher-workspace > .teacher-inline-success")).toContainText("The lesson already booked stays in place.");
    assert.deepEqual(state.bookings, originalBookings);
    await noOverflow(page);
    assert.deepEqual(state.errors, []);
    await page.close();
  }

  // A clash card uses the existing lesson editor, including lessons hidden
  // under More. Moving one refreshes the cards and preserves unsaved hours.
  for (const width of [1280, 390]) {
    const { page, state } = await fixture(width);
    for (let week = 1; week <= 5; week++) state.bookings.push(lesson(`repeat-${week}`, `Repeat ${week}`, new Date(Date.parse("2026-09-07T10:00:00Z") + week * 7 * 86400000).toISOString()));
    await page.reload();
    await showHours(page);
    await slot(page, 1, 660).click();
    await expect(page.locator(".teacher-hours-warning .teacher-lesson-card:visible")).toHaveCount(4);
    await page.locator(".teacher-hours-clashes-more > summary").click();
    await expect(page.locator(".teacher-hours-warning .teacher-lesson-card:visible")).toHaveCount(6);
    await page.getByRole("button", { name: /^Change lesson for Repeat 5/ }).click();
    await expect(page.getByRole("dialog", { name: "Repeat 5", exact: true })).toBeVisible();
    assert.deepEqual(state.writes, []);
    await page.getByRole("button", { name: "Move lesson", exact: true }).click();
    await page.getByLabel("New date").fill("2026-10-13");
    await page.getByRole("dialog").getByLabel("Time in Porto").fill("11:00");
    await page.getByRole("button", { name: "Save new time", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".teacher-hours-warning .teacher-lesson-card")).toHaveCount(5);
    await expect(page.locator(".teacher-hours-warning")).not.toContainText("Repeat 5");
    await expect(page.getByRole("tab", { name: /^Timetable/ })).toHaveAttribute("aria-selected", "true");
    await expect(slot(page, 1, 660)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Save weekly hours", exact: true })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Your weekly hours", exact: true })).toBeFocused();
    assert.deepEqual(state.writes.map(({ path }) => path), ["/admin/bookings/repeat-5/reschedule"]);
    assert.ok(state.bookings.every(booking => booking.status === "confirmed"));
    await noOverflow(page);
    assert.deepEqual(state.errors, []);
    await page.close();
  }

  for (const width of [1280, 390]) {
    const tabs = await fixture(width);
    const { page, state } = tabs;
    const chosenDay = (date) => page.locator(`[data-timeoff-date="${date}"]`);
    const timeOff = page.locator(".teacher-timeoff");
    const initialBookings = structuredClone(state.bookings);
    await expect(page.getByRole("tab", { name: "Timetable", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Timetable", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Time off", exact: true })).toBeFocused();
    await showHours(page);
    await slot(page, 1, 600).click();
    await page.getByRole("tab", { name: /^Students/ }).click();
    await expect(page.getByRole("tab", { name: /^Timetable/ }).locator(".teacher-tab-dot")).toHaveAttribute("aria-label", "unsaved changes");
    await showHours(page);
    await expect(slot(page, 1, 600)).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await page.getByRole("tab", { name: "Time off", exact: true }).click();
    await expect(chosenDay("2026-09-06")).toBeDisabled();
    await chosenDay("2026-09-08").click();
    await expect(timeOff.locator(".teacher-timeoff-lessons")).toContainText("Already booked");
    await expect(timeOff.locator(".teacher-timeoff-lessons .teacher-lesson-card")).toContainText("Sam");
    await chosenDay("2026-09-21").click();
    await expect(timeOff.getByRole("button", { name: "This month", exact: true })).toHaveCount(0);
    await timeOff.getByRole("button", { name: "Next month" }).click();
    await expect(timeOff.getByRole("button", { name: "This month", exact: true })).toBeVisible();
    await chosenDay("2026-10-01").click();
    await page.getByRole("tab", { name: /^Students/ }).click();
    await page.getByRole("tab", { name: "Time off", exact: true }).click();
    await expect(timeOff.getByRole("heading", { name: "3 days chosen" })).toBeVisible();
    const before = state.writes.length;
    // 21 September is already off, so only the other two are taken.
    await timeOff.getByRole("button", { name: "Take 2 days off", exact: true }).click();
    await expect(timeOff.locator(".teacher-save-state")).toContainText("3 selected days are off");
    assert.deepEqual(state.writes.slice(before).map(write => write.data), [
      { date: "2026-09-08", dayOff: true }, { date: "2026-10-01", dayOff: true },
    ], "Already-off dates do not create another write");
    await expect(chosenDay("2026-10-01")).toHaveClass(/is-off/);
    await timeOff.getByRole("button", { name: "Make available", exact: true }).click();
    await expect(timeOff.locator(".teacher-save-state")).toContainText("following your weekly hours");
    assert.deepEqual(state.bookings, initialBookings, "Marking dates off and reopening them preserves every lesson");
    assert.ok(state.exceptions.some(row => row.date === "2026-09-21" && row.start_minute === 600), "Reopening a day preserves its partial time off");
    assert.ok(state.exceptions.some(row => row.kind === "extra"), "Extra hours remain untouched");
    await expect(timeOff.getByRole("button", { name: "Make available", exact: true })).toHaveCount(0);
    await timeOff.getByRole("button", { name: "Clear", exact: true }).click();
    await timeOff.getByRole("button", { name: "This month", exact: true }).click();
    await expect(timeOff.getByRole("heading", { name: "September 2026", exact: true })).toBeFocused();
    await expect(timeOff.getByRole("button", { name: "This month", exact: true })).toHaveCount(0);
    await expect(chosenDay("2026-09-21")).not.toContainText("Part off");
    await expect(chosenDay("2026-09-21")).not.toHaveAttribute("aria-label", /weekly hours|some time off/);
    await expect(chosenDay("2026-09-14")).not.toHaveAttribute("aria-label", /weekly hours|some time off/);
    await chosenDay("2026-09-30").focus();
    await page.keyboard.press("ArrowDown");
    await expect(chosenDay("2026-10-07")).toBeFocused();
    await page.keyboard.press("Space");
    state.failDay = "2026-10-07";
    await timeOff.getByRole("button", { name: "Take the day off", exact: true }).click();
    await expect(timeOff.getByRole("alert")).toContainText("was not changed");
    await expect(chosenDay("2026-10-07")).not.toHaveClass(/is-off/);
    await timeOff.getByRole("button", { name: "Take the day off", exact: true }).click();
    await expect(timeOff.locator(".teacher-save-state")).toContainText("is a day off");
    await noOverflow(page);
    await page.getByRole("tab", { name: /^Students/ }).click();
    await page.getByRole("tab", { name: /^Students/ }).focus();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Profile", exact: true })).toBeFocused();
    await noOverflow(page);
    if (width === 1280) {
      await page.setViewportSize({ width: 320, height: 900 });
      await expect.poll(() => page.getByRole("tab", { name: "Profile", exact: true }).evaluate(node => {
        const tab = node.getBoundingClientRect();
        const strip = node.closest(".teacher-tabs-scroll").getBoundingClientRect();
        return tab.left >= strip.left - 1 && tab.right <= strip.right + 1;
      })).toBe(true);
      await page.setViewportSize({ width, height: 900 });
    }
    await page.keyboard.press("Home");
    await expect(page.getByRole("tablist", { name: "Teacher tools" }).getByRole("tab").first()).toBeFocused();
    await showLessons(page);
    state.failBookings = true;
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(page.locator(".teacher-week").getByRole("alert")).toContainText("Lessons could not be loaded");
    await page.getByRole("tab", { name: "Time off", exact: true }).click();
    await expect(timeOff.getByRole("alert")).toContainText("Booked lessons couldn’t be checked");
    await expect(timeOff.getByRole("button", { name: "Make available", exact: true })).toBeDisabled();
    state.failBookings = false;
    await timeOff.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(timeOff.getByRole("button", { name: "Make available", exact: true })).toBeEnabled();
    assert.deepEqual(state.errors, []);
    await page.close();
  }

  // One reachability check; the Worker integration test owns mutations and permissions.
  const expressions = await fixture(390);
  await expressions.page.getByRole("tab", { name: "Expressions", exact: true }).click();
  await expect(expressions.page.locator(".teacher-expression .expression-card")).toContainText("Partir o coco a rir");
  // Closed to students, her try-out paints her drafts in her browser alone: nothing is written.
  await expect(expressions.page.getByText("Only you can see expressions for now.", { exact: false })).toBeVisible();
  const tryOut = expressions.page.getByRole("region", { name: "Uma expressão para ti", exact: true });
  await tryOut.getByRole("button", { name: "Paint it", exact: true }).click();
  await expect(tryOut.getByRole("button", { name: "Paint another", exact: true })).toBeEnabled({ timeout: 10_000 });
  await expect(tryOut.getByRole("heading", { name: "Partir o coco a rir", exact: true })).toBeAttached();
  assert.deepEqual(expressions.state.writes, []);
  assert.deepEqual(expressions.state.errors, []);
  await expressions.page.close();

  // Her profile keeps sign-out and account changes together. Email stays
  // unchanged until its proof link returns and renews this teacher's session.
  const accountFixture = await fixture(390);
  const accountPage = accountFixture.page;
  const accountState = accountFixture.state;
  await accountPage.getByRole("tab", { name: "Profile", exact: true }).click();
  const account = accountPage.getByRole("region", { name: "Your account", exact: true });
  await account.getByRole("button", { name: "Send password reset link", exact: true }).click();
  await expect(account.getByRole("status")).toContainText(teacher.email);
  assert.deepEqual(accountState.accountWrites.at(-1), { path: "/auth/forgot", data: { email: teacher.email } });
  await account.getByRole("button", { name: "Change email", exact: true }).click();
  const nextEmail = "verified-teacher@example.invalid";
  await account.getByLabel("New sign-in email", { exact: true }).fill(nextEmail);
  await account.getByRole("button", { name: "Send confirmation email", exact: true }).click();
  await expect(account.getByRole("status")).toContainText(nextEmail);
  await expect(account.getByText(teacher.email, { exact: true })).toBeVisible();
  assert.deepEqual(accountState.accountWrites.at(-1), {
    path: "/me/email", data: { email: nextEmail }, authorization: "Bearer isolated-teacher-fixture",
  });
  await accountPage.goto(`${base}/book/?view=lessons&emailToken=isolated-teacher-email-proof`);
  await expect(accountPage.getByRole("tab", { name: "Profile", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(account.getByRole("status")).toContainText("Your sign-in email has been updated");
  await expect(account.getByText(nextEmail, { exact: true })).toBeVisible();
  assert.equal(new URL(accountPage.url()).pathname, "/schedule/");
  assert.equal(new URL(accountPage.url()).searchParams.has("emailToken"), false);
  assert.equal(await accountPage.evaluate(() => localStorage.getItem("ines-student-session")), "isolated-renewed-teacher-fixture");
  assert.deepEqual(accountState.accountWrites.at(-1), {
    path: "/me/email/confirm", data: { token: "isolated-teacher-email-proof" }, authorization: "Bearer isolated-teacher-fixture",
  });
  await account.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(accountPage.locator(".teacher-workspace")).toBeHidden();
  assert.equal(await accountPage.evaluate(() => localStorage.getItem("ines-student-session")), null);
  assert.deepEqual(accountState.errors, []);
  await accountPage.close();

  const student = await fixture(390, { student: true });
  await student.page
    .getByRole("status")
    .filter({ hasText: "this page is Inês’s" })
    .waitFor();
  await expect(student.page.locator(".teacher-workspace")).toHaveCount(0);
  assert.deepEqual(student.state.writes, []);
  await student.page.close();
  console.log(
    "Teacher calendar passed: visible locations in 60/90-minute blocks, drag/keyboard/touch hours and time off, day-off switches, weekly lunch, past weeks, failed and coalesced saves, protected exceptions, exact hours, drafts, Porto moves, attendance, cancellation, student profiles, complete inline setup, teacher email/password links and verified session renewal, responsive layout and access gate.",
  );
} finally {
  await browser.close();
}
