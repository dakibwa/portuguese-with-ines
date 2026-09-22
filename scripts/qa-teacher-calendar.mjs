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
    nextId: 1000,
    failMove: 0,
    failBookings: false,
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
        if (state.failBookings) return fail("Lessons could not be loaded.");
        return route.fulfill({ json: { bookings: state.bookings } });
      }
      state.bookings.push(
        lesson("manual", data.name, data.startAt, data.location),
      );
      return route.fulfill({ json: { booking: { reference: "TEST-manual" } } });
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
      } else if (match[2] === "cancel") booking.status = "cancelled";
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
  page.getByRole("button", { name: /^Weekly hours/ }).click();
const showLessons = (page) =>
  page.getByRole("button", { name: "Back to calendar", exact: true }).click();
const dayWrites = (state, date) =>
  state.writes
    .filter((entry) => entry.path === "/admin/exceptions/day")
    .map((entry) => entry.data)
    .filter((entry) => !date || entry.date === date);
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
  for (const width of [1440, 827, 741, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 741)
      await page
        .getByRole("button", { name: "Monday 7 September, show lessons" })
        .click();
    await lessonLocation(page, "Alex", "Online");
    if (width < 741)
      await page
        .getByRole("button", { name: "Tuesday 8 September, show lessons" })
        .click();
    await lessonLocation(page, "Sam", "In Porto");
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
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
    .getByRole("button", { name: "Save teaching hours", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Hours could not be saved" })
    .waitFor();
  await expect(slot(page, 1, 570)).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Save teaching hours", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Teaching hours saved" })
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
    page.getByRole("button", { name: "Save teaching hours", exact: true }),
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
  await expect(
    page.getByRole("button", { name: "Mark no-show", exact: true }),
  ).toHaveCount(0);
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

  // Time off is taken on the calendar itself and saves as she clicks.
  const note = page.locator(".teacher-save-state");
  await slot(page, 2, 960).click();
  await expect(slot(page, 2, 960)).toHaveAttribute("aria-pressed", "true");
  await expect(note).toHaveText("16:00–16:30 on Tue 8 Sept is off.");
  await slot(page, 2, 990).click();
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
  await expect(note).toHaveText("18:00–18:30 on Wed 9 Sept is off.");
  assert.deepEqual(dayWrites(state).at(-1), {
    date: "2026-09-09",
    blocks: [{ startMinute: 1020, endMinute: 1110 }],
  });

  // Weekly lunch is shown and cannot be toggled per date.
  const writesBefore = state.writes.length;
  await expect(slot(page, 1, 750)).toHaveAttribute("aria-disabled", "true");
  await expect(
    page
      .locator(".teacher-block-label.is-weekly", { hasText: "Lunch" })
      .first(),
  ).toBeVisible();
  await slot(page, 1, 750).click({ force: true });
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
  await expect(slot(page, 1, 600)).toHaveAttribute("aria-disabled", "true");
  await mondayOff.click();
  await expect(mondayOff).toHaveAttribute("aria-checked", "false");
  await expect(note).toHaveText("Mon 7 Sept is open again.");

  // A failed save puts the date back as it is actually saved.
  state.failDay = "2026-09-11";
  await slot(page, 5, 600).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Fri 11 Sept was not changed." })
    .waitFor();
  await expect(slot(page, 5, 600)).toHaveAttribute("aria-pressed", "false");

  // Quick clicks while a save is in flight coalesce into the latest choice.
  state.delay = 400;
  for (const minute of [900, 930, 960]) await slot(page, 5, minute).click();
  await expect(note).toHaveText("16:00–16:30 on Fri 11 Sept is off.");
  state.delay = 0;
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

  const manual = page.locator(".teacher-manual");
  assert.equal(await manual.getAttribute("open"), null);
  assert.equal(
    await manual.evaluate((node) =>
      node.previousElementSibling?.classList.contains("teacher-week"),
    ),
    true,
  );
  await manual.locator("summary").click();
  await manual.getByLabel("Student’s email").fill("manual@example.invalid");
  await manual.getByLabel("Student’s name").fill("Robin");
  await manual.getByLabel("Where").selectOption("porto");
  await manual.getByLabel("Date", { exact: true }).fill("2026-09-11");
  await manual
    .getByRole("button", { name: "Add lesson and email student" })
    .click();
  await manual.getByRole("status").waitFor();
  assert.equal(
    state.writes.find((entry) => entry.path === "/admin/bookings").data
      .location,
    "porto",
  );
  await page.getByRole("button", { name: /^Robin,.*View lesson$/ }).click();
  await page
    .getByRole("button", { name: "Cancel lesson", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cancel this lesson?" }),
  ).toBeVisible();
  assert.equal(
    state.bookings.find((entry) => entry.id === "manual").status,
    "confirmed",
  );
  await page.getByRole("button", { name: "Yes, cancel lesson" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(
    state.bookings.find((entry) => entry.id === "manual").status,
    "cancelled",
  );
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
  await page.getByRole("button", { name: "Reload lessons" }).click();
  await expect(page.locator(".teacher-timetable")).toBeVisible();
  await noOverflow(page);
  assert.deepEqual(state.errors, []);
  await page.close();

  const mobile = await fixture(390);
  await mobile.page
    .getByRole("button", { name: "Tuesday 8 September, show lessons" })
    .tap();
  const tuesdayOff = mobile.page.getByRole("switch", {
    name: "Day off, Tuesday 8 September",
  });
  await expect(
    mobile.page.getByRole("switch", { name: "Day off, Monday 7 September" }),
  ).toBeHidden();
  await tuesdayOff.tap();
  await expect(tuesdayOff).toHaveAttribute("aria-checked", "true");
  await mobile.page
    .locator(".teacher-save-state")
    .filter({ hasText: "The lesson already booked stays in place." })
    .waitFor();
  await expect(
    mobile.page.getByRole("button", { name: /^Sam,.*View lesson$/ }),
  ).toBeVisible();
  await noOverflow(mobile.page);
  await tuesdayOff.tap();
  await expect(tuesdayOff).toHaveAttribute("aria-checked", "false");
  await slot(mobile.page, 2, 1080).tap();
  await expect(slot(mobile.page, 2, 1080)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await mobile.page
    .locator(".teacher-save-state")
    .filter({ hasText: "18:00–18:30 on Tue 8 Sept is off." })
    .waitFor();
  await showHours(mobile.page);
  await mobile.page
    .getByRole("button", { name: "Saturday, show teaching hours" })
    .tap();
  await slot(mobile.page, 6, 600).tap();
  await expect(slot(mobile.page, 6, 600)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await mobile.page
    .getByRole("button", { name: "Save teaching hours", exact: true })
    .click();
  await mobile.page
    .getByRole("status")
    .filter({ hasText: "Teaching hours saved" })
    .waitFor();
  for (const width of [390, 320, 827]) {
    await mobile.page.setViewportSize({ width, height: 900 });
    await noOverflow(mobile.page);
  }
  assert.deepEqual(mobile.state.errors, []);
  await mobile.page.close();

  const student = await fixture(390, { student: true });
  await student.page
    .getByRole("status")
    .filter({ hasText: "this page is Inês’s" })
    .waitFor();
  await expect(student.page.locator(".teacher-workspace")).toHaveCount(0);
  assert.deepEqual(student.state.writes, []);
  await student.page.close();
  console.log(
    "Teacher calendar passed: visible locations in 60/90-minute blocks, drag/keyboard/touch hours and time off, day-off switches, weekly lunch, past weeks, failed and coalesced saves, protected exceptions, exact hours, drafts, Porto moves, attendance, cancellation, manual fallback, responsive layout and access gate.",
  );
} finally {
  await browser.close();
}
