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
    writes: [],
    errors: [],
    failHours: 0,
    failDay: "",
    delay: 0,
    dayGate: null,
    nextId: 1000,
    failMove: 0,
    failCancel: 0,
    failBookings: false,
    history: null,
    historyReads: 0,
    historyGate: null,
    failHistory: false,
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/lesson-types", (route) => route.fulfill({
    json: { lessonTypes: [], postpay: false },
  }));
  await page.route("**/me/recurring-rates", (route) => route.fulfill({ json: { rates: {} } }));
  await page.route("**/availability?**", (route) => route.fulfill({ json: { slotsByDate: {}, horizonDays: 56 } }));
  await page.route("**/auth/login", (route) => route.fulfill({
    json: { student: teacher, session: "isolated-teacher-fixture" },
  }));
  await page.route("**/me/expressions", route => route.fulfill({ json: { expression: null, canPick: false, hasPublished: false, shuffleLabels: [] } }));
  await page.route("**/me", (route) =>
    route.fulfill({
      json: {
        student: { ...teacher, role: options.student ? "student" : "teacher" },
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
    }] } });
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
          state.historyGate = null;
          if (gate) await gate;
          if (state.failHistory) return fail("Lesson history could not be loaded.");
          return route.fulfill({ json: { bookings: state.history ?? state.bookings } });
        }
        if (state.failBookings) return fail("Lessons could not be loaded.");
        return route.fulfill({ json: { bookings: state.bookings } });
      }
      // Hers are marked as hers, and wait for the student's card.
      state.bookings.push({
        ...lesson(`manual-${state.bookings.length}`, state.added && data.email === state.added.email ? state.added.name : data.name || "Sam Known", data.startAt, data.location),
        payment_status: "not_required",
        added_by_teacher: 1,
      });
      return route.fulfill({
        json: {
          booking: { reference: "TEST-manual" },
          // A student she has just set up isn't emailed until their welcome.
          emailed: !(state.added && data.email === state.added.email),
          ...(data.repeat ? { series: { booked: 3, skipped: [{ key: "2026-10-01", startAt: "2026-10-01T16:00:00.000Z", reason: "Day off" }] } } : {}),
        },
      });
    }
    // Her students, for suggestions in the form and her list beneath it.
    if (path === "/admin/students" && data) {
      // Set up quietly: nothing is emailed until her welcome.
      const student = { id: "ana", name: data.name, email: data.email, phone: data.phone, mark: data.mark, prices: data.prices, signedIn: false, awaitingWelcome: true, hasCard: false, cardForAllLessons: false, nextLessonAt: null, upcoming: 0, unpaidUpcoming: 0, weekly: 0 };
      state.added = student;
      return route.fulfill({ status: 201, json: { student } });
    }
    if (path === "/admin/students/ana/welcome") return route.fulfill({ json: { ok: true, card: true } });
    if (path === "/admin/students") {
      return route.fulfill({
        json: {
          cardsAccepted: true,
          students: [
            { id: "sam", name: "Sam Known", email: "sam@example.invalid", phone: "", signedIn: false, hasCard: false, cardForAllLessons: false, nextLessonAt: "2026-09-10T16:00:00.000Z", upcoming: 1, unpaidUpcoming: 1, weekly: 0 },
            { id: "alex", name: "Alex", email: "alex@example.invalid", phone: "", signedIn: true, hasCard: true, cardForAllLessons: true, nextLessonAt: null, upcoming: 0, unpaidUpcoming: 0, weekly: 1 },
            ...(state.added ? [state.added] : []),
          ],
        },
      });
    }
    if (path === "/admin/students/sam/welcome") return route.fulfill({ json: { ok: true, card: true } });
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
    await page
      .getByRole("heading", { name: "7 Sept – 13 Sept 2026" })
      .waitFor();
  return { page, state };
}

const slot = (page, day, minute) =>
  page.locator(`[data-slot-day="${day}"][data-slot-minute="${minute}"]`);
const showHours = (page) =>
  page.getByRole("tab", { name: /^Weekly hours/ }).click();
const showLessons = (page) =>
  page.getByRole("tab", { name: "Week", exact: true }).click();
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
  await expect(signedIn.page.getByRole("heading", { name: "7 Sept – 13 Sept 2026" })).toBeVisible();
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

  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(
    page.getByRole("switch", { name: "Day off, Monday 31 August" }),
  ).toBeDisabled();
  await expect(slot(page, 1, 600)).toHaveAttribute("aria-disabled", "true");

  // Reopening a holiday removes only whole-day rows; its hours and extras stay.
  await page.getByRole("button", { name: "This week" }).click();
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
  const forSam = page.getByRole("dialog");
  await forSam.getByRole("button", { name: "Sam Known", exact: true }).click();
  await forSam.getByRole("radio", { name: "In Porto", exact: true }).check();
  await expect(forSam.getByLabel("Date", { exact: true })).toHaveValue("2026-09-11");
  await forSam.getByRole("button", { name: "Add lesson and email student", exact: true }).click();
  await expect(forSam.locator(".teacher-student-dialog__added")).toContainText("emailed");
  assert.equal(state.writes.find((entry) => entry.path === "/admin/bookings").data.location, "porto");
  await forSam.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await expect(addDialog).toContainText(/Thursday,? 10 September, 18:00/);
  // Someone new is set up first, then the lesson keeps the time she chose.
  await addDialog.getByRole("button", { name: "Add a new student", exact: true }).click();
  await addDialog.getByLabel("Full name").fill("Kai");
  await addDialog.getByLabel("Email").fill("kai@example.invalid");
  await addDialog.getByRole("button", { name: "Next: their lessons", exact: true }).click();
  await expect(addDialog.getByRole("heading", { name: "Kai" })).toBeVisible();
  await expect(addDialog.getByLabel("Date", { exact: true })).toHaveValue("2026-09-10");
  await expect(addDialog.getByLabel("Time in Porto")).toHaveValue("18:00");
  await addDialog.getByRole("button", { name: "Add lesson", exact: true }).click();
  await expect(addDialog.locator(".teacher-student-dialog__added")).toContainText("18:00");
  await expect(addDialog.locator(".teacher-student-dialog__added")).not.toContainText("emailed");
  await addDialog.getByRole("button", { name: "Done, send later", exact: true }).click();
  await expect(addDialog).toHaveCount(0);
  assert.equal(
    state.writes.filter((entry) => entry.path === "/admin/bookings").at(-1).data.startAt,
    "2026-09-10T17:00:00.000Z",
    "A lesson added from a time keeps that Porto time",
  );
  await expect(
    page.getByRole("button", { name: /^Kai,.*added by you\. View lesson$/ }),
  ).toHaveClass(/teacher-calendar-lesson--added/);

  // A student she already has: choosing their address brings their name. A
  // weekly slot says what was booked and which week was left out.
  await slot(page, 2, 1080).click();
  await page.getByRole("menuitem", { name: "Add a lesson here", exact: true }).click();
  const weeklyDialog = page.getByRole("dialog");
  await weeklyDialog.getByRole("button", { name: "Sam Known", exact: true }).click();
  await weeklyDialog.getByRole("radio", { name: "Weekly", exact: true }).check();
  await expect(weeklyDialog.getByRole("radio", { name: "Until stopped", exact: true })).toBeChecked();
  await weeklyDialog.getByRole("radio", { name: "4 weeks", exact: true }).check();
  await weeklyDialog.getByRole("button", { name: "Add weekly lessons and email student", exact: true }).click();
  await expect(weeklyDialog.locator(".teacher-student-dialog__added")).toContainText("1 Oct left out");
  const weekly = state.writes.filter((entry) => entry.path === "/admin/bookings").at(-1).data;
  assert.deepEqual([weekly.email, weekly.name, weekly.repeat], ["sam@example.invalid", "Sam Known", 4]);
  await weeklyDialog.getByRole("button", { name: "Done", exact: true }).click();

  // Her students: who still needs to come in leads, and each can be sent a
  // way in or given a lesson straight from the list.
  const students = page.locator(".teacher-students");
  await page.getByRole("tab", { name: /^Students/ }).click();
  // Kai, just set up, leads; then Sam, still to bring in; then Alex.
  await expect(students.locator(".teacher-student").first()).toContainText("Set up, not emailed yet");
  await expect(students.locator(".teacher-student").filter({ hasText: "Sam Known" })).toContainText("Not signed in yet · 1 lesson paid by hand");
  await expect(students.locator(".teacher-student").filter({ hasText: "Alex" })).toContainText("All set: signed in, card saved");
  await expect(students.getByRole("button", { name: "Send welcome email to Alex" })).toHaveCount(0);
  await students.getByRole("button", { name: "Send welcome email to Sam Known" }).click();
  // Onboarding: set a student up with their details, nothing emailed, then
  // their welcome from their card.
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
  await expect(addStudent.getByRole("heading", { name: "Ana Costa" })).toBeVisible();
  await expect(addStudent.getByRole("radio", { name: "60 mins, €20" })).toBeVisible();
  await expect(addStudent.getByRole("radio", { name: "90 mins, €35" })).toBeVisible();
  await expect(addStudent.getByRole("button", { name: "Send welcome email", exact: true })).toHaveCount(0);
  await addStudent.getByRole("button", { name: "Done, send later", exact: true }).click();
  const ana = students.locator(".teacher-student").filter({ hasText: "Ana Costa" });
  await expect(ana).toContainText("Set up, not emailed yet");
  await ana.getByRole("button", { name: "Send welcome email to Ana Costa" }).click();
  await expect(ana).toContainText("Welcome sent");
  await expect(students.locator(".teacher-student").filter({ hasText: "Sam Known" })).toContainText("Welcome sent");
  await students.getByRole("button", { name: "Add lesson for Alex" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Alex" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();

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
  await expect(page.locator("#teacher-week-title")).toHaveText(/^28 Sept/);
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
    const open = page.getByRole("button", { name: "View lesson history for Sam Known" });
    await open.focus();
    await page.keyboard.press("Enter");
    const history = page.getByRole("dialog", { name: "Sam Known" });
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
    assert.equal(state.historyReads, 1, "History requests all dates, separately from the current week");
    assert.ok(await history.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `History fits at ${width}px`);
    await page.keyboard.press("Shift+Tab");
    assert.ok(await history.evaluate(node => node.contains(document.activeElement)), "Focus stays inside history");
    await page.keyboard.press("Escape");
    await expect(history).toHaveCount(0);
    await expect(open).toBeFocused();
    // A failed read stays an error, never an empty history, and can be retried.
    state.failHistory = true;
    await open.click();
    await expect(history.getByRole("alert")).toContainText("could not be loaded");
    await expect(history).not.toContainText("No lessons recorded");
    state.failHistory = false;
    await history.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(history.locator(".teacher-history-lesson")).toHaveCount(5);
    await history.getByRole("button", { name: "Close student history" }).click();
    // Closing a slow request and opening another account cannot cross the histories.
    let release;
    state.historyGate = new Promise(resolve => { release = resolve; });
    await open.click();
    await expect(history.getByRole("status")).toHaveText("Loading lesson history…");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "View lesson history for Alex", exact: true }).click();
    const other = page.getByRole("dialog", { name: "Alex", exact: true });
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
    const date = page.locator('[data-timeoff-date="2026-09-21"]');
    await date.click();
    await expect(date).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByRole("heading", { name: "Mon 21 Sept" })).toBeVisible();
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
    await expect(page.getByRole("tab", { name: /^Weekly hours/ })).toHaveAttribute("aria-selected", "true");
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
    await expect(page.getByRole("tab", { name: "Week", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Week", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: /^Weekly hours/ })).toBeFocused();
    await slot(page, 1, 600).click();
    await page.getByRole("tab", { name: /^Students/ }).click();
    await expect(page.getByRole("tab", { name: /^Weekly hours/ }).locator(".teacher-tab-dot")).toHaveAttribute("aria-label", "unsaved changes");
    await showHours(page);
    await expect(slot(page, 1, 600)).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await page.getByRole("tab", { name: "Time off", exact: true }).click();
    await expect(chosenDay("2026-09-06")).toBeDisabled();
    await chosenDay("2026-09-08").click();
    await expect(timeOff.locator(".teacher-timeoff-lessons")).toContainText("Already booked");
    await expect(timeOff.locator(".teacher-timeoff-lessons .teacher-lesson-card")).toContainText("Sam");
    await chosenDay("2026-09-21").click();
    await timeOff.getByRole("button", { name: "Next month" }).click();
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
    await expect(page.getByRole("tab", { name: /^Google Meet/ })).toBeFocused();
    await noOverflow(page);
    if (width === 1280) {
      await page.setViewportSize({ width: 320, height: 900 });
      await expect.poll(() => page.getByRole("tab", { name: /^Google Meet/ }).evaluate(node => {
        const tab = node.getBoundingClientRect();
        const strip = node.closest(".teacher-tabs-scroll").getBoundingClientRect();
        return tab.left >= strip.left - 1 && tab.right <= strip.right + 1;
      })).toBe(true);
      await page.setViewportSize({ width, height: 900 });
    }
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "Week", exact: true })).toBeFocused();
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
  await expect(expressions.page.locator(".expression-card")).toContainText("Partir o coco a rir");
  assert.deepEqual(expressions.state.errors, []);
  await expressions.page.close();

  const student = await fixture(390, { student: true });
  await student.page
    .getByRole("status")
    .filter({ hasText: "this page is Inês’s" })
    .waitFor();
  await expect(student.page.locator(".teacher-workspace")).toHaveCount(0);
  assert.deepEqual(student.state.writes, []);
  await student.page.close();
  console.log(
    "Teacher calendar passed: visible locations in 60/90-minute blocks, drag/keyboard/touch hours and time off, day-off switches, weekly lunch, past weeks, failed and coalesced saves, protected exceptions, exact hours, drafts, Porto moves, attendance, cancellation, students and their lessons in one dialog, responsive layout and access gate.",
  );
} finally {
  await browser.close();
}
