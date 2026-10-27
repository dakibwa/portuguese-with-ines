import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

/*
 * Students Inês brings onto the site (12 October 2026): the one-click sign-in
 * link from their email, a spent link asking for a new one, and the card that
 * pays for the lessons she adds. Accounts and lessons are isolated fixtures:
 * no request reaches the Worker or Stripe.
 */
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const browser = await chromium.launch({ headless: true });
const student = {
  id: "student-brought", name: "Rita Sousa", email: "rita@example.invalid", phone: "", nif: "", timezone: "Europe/Lisbon",
  role: "student", mark: "", hasCard: false, cardForAllLessons: false,
};
const added = {
  reference: "PT-ADDED1", status: "confirmed", startAt: "2026-09-10T16:00:00.000Z", endAt: "2026-09-10T17:00:00.000Z",
  cancelledAt: null, location: "online", meetingUrl: null, notes: "",
  lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
  isPast: false, sameDayFeeApplies: false, sameDayFeeAutomatic: false, changeLocked: false,
  paymentStatus: "not_required", seriesId: null, addedByTeacher: true, manageToken: "qa-manage-added",
};
await mkdir("tmp/qa/transition-kit", { recursive: true });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function open(width, path, { session = "", me = student, bookings = [added], now = "2026-09-07T10:15:00Z", reply = () => null } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 741 });
  const errors = [];
  const posts = [];
  const reads = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date(now));
  if (session) await page.addInitScript((value) => localStorage.setItem("ines-student-session", value), session);
  await page.route("https://checkout.stripe.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Stripe</title>" }));
  await page.route(url => /^\/(me(?:\/|$)|auth\/|admin\/expressions$|lesson-types$|availability$|bookings)/.test(url.pathname), async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    if (body) posts.push({ endpoint, body });
    else reads.push(endpoint);
    const fixture = await reply(endpoint, body);
    if (fixture) return route.fulfill(fixture);
    if (endpoint === "/me" && !body) return route.fulfill({ json: { student: me, bookings, series: [], sameDayFeeCents: 500, cardsAccepted: true } });
    if (endpoint === "/me/recurring-rates") return route.fulfill({ json: { rates: {} } });
    if (endpoint === "/me/expressions") return route.fulfill({ json: { expression: null, canPick: false, hasPublished: false, shuffleLabels: [] } });
    if (endpoint === "/lesson-types") return route.fulfill({ json: { lessonTypes: [], postpay: true, paymentReady: true } });
    if (endpoint === "/availability") return route.fulfill({ json: { slotsByDate: {}, horizonDays: 56 } });
    errors.push(`Unexpected fixture request: ${request.method()} ${endpoint}`);
    return route.abort();
  });
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  return { page, errors, posts, reads };
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

async function chooseFromMenu(page, name) {
  await page.locator("#account-menu").waitFor({ state: "attached" });
  const toggle = page.locator("#account-menu-button");
  if (await toggle.isVisible() && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.locator("#account-menu").getByRole("button", { name, exact: true }).click();
}

try {
  for (const width of [1280, 390]) {
    // The link in Inês's email leaves the address bar and waits for the
    // student's own press (a mail scanner opening it spends nothing), then
    // opens Your lessons with one quiet ask for a card.
    const linked = await open(width, "/book/?signin=qa-good-link", {
      reply: (endpoint) => {
        if (endpoint === "/auth/email-link/confirm") return { json: { student, session: "qa-link-session" } };
        if (endpoint === "/me/card") return { json: { checkoutUrl: "https://checkout.stripe.com/c/pay/qa" } };
        return null;
      },
    });
    await expect(linked.page.getByRole("heading", { name: "Welcome" })).toBeVisible({ timeout: 15000 });
    assert.ok(!linked.page.url().includes("signin="), "the link leaves the address bar at once");
    assert.equal(linked.posts.filter((post) => post.endpoint === "/auth/email-link/confirm").length, 0, "nothing is spent on arrival");
    await linked.page.screenshot({ path: `tmp/qa/transition-kit/link-${width}.png`, fullPage: false });
    await linked.page.getByRole("button", { name: "Sign in", exact: true }).click();
    const prompt = linked.page.locator(".card-prompt");
    await expect(prompt.getByRole("heading", { name: "Pay by card" })).toBeVisible({ timeout: 15000 });
    await expect(prompt).toContainText("Add your card once and you’re set.");
    assert.equal(await linked.page.evaluate(() => localStorage.getItem("ines-student-session")), "qa-link-session");
    assert.deepEqual(linked.posts.filter((post) => post.endpoint === "/auth/email-link/confirm").map((post) => post.body), [{ token: "qa-good-link" }]);
    await expect(linked.page.getByRole("heading", { name: "Your account" })).toHaveCount(0);
    assert.ok(await noOverflow(linked.page), `no sideways scroll at ${width}px`);
    await linked.page.screenshot({ path: `tmp/qa/transition-kit/prompt-${width}.png`, fullPage: false });

    await prompt.getByRole("button", { name: "Add card" }).click();
    await expect(prompt.locator(".booking-payment-facts")).toBeVisible();
    await linked.page.screenshot({ path: `tmp/qa/transition-kit/terms-${width}.png`, fullPage: false });
    await prompt.getByRole("button", { name: "Agree & add card" }).click();
    await linked.page.waitForURL(/checkout\.stripe\.com/);
    assert.deepEqual(linked.posts.find((post) => post.endpoint === "/me/card")?.body, { consent: true });
    assert.deepEqual(linked.errors, []);
    await linked.page.close();

    // A named past lesson stays explicit and requires its own payment
    // agreement. Merely opening the personal link never starts card setup.
    const approvedBooking = { id: "approved-past-lesson", reference: "PT-COMBINED", startAt: "2026-10-27T17:00:00.000Z", endAt: "2026-10-27T18:00:00.000Z", amountCents: 1500 };
    let combinedAuthorised = false;
    const combined = await open(width, "/book/?signin=qa-combined-link&cardBooking=approved-past-lesson", {
      now: "2026-10-27T20:00:00Z",
      me: { ...student, hasCard: true },
      reply: endpoint => {
        if (endpoint === "/auth/email-link/confirm") return { json: { student: { ...student, hasCard: true }, session: "qa-combined-session" } };
        if (endpoint === "/me/card/preview") return { json: { booking: approvedBooking, savedCardKey: "qa-saved-card", sameDayFeeCents: 500, minimumNoticeHours: 14 } };
        if (endpoint === "/me" && combinedAuthorised) return { json: { student: { ...student, hasCard: true, cardForAllLessons: true }, bookings: [added], series: [], cardsAccepted: true } };
        if (endpoint === "/me/card") { combinedAuthorised = true; return { json: { authorised: true } }; }
        return null;
      }
    });
    await expect(combined.page.getByRole("heading", { name: "Welcome", exact: true })).toBeVisible({ timeout: 15000 });
    assert.equal(combined.posts.length, 0);
    assert.ok(!combined.page.url().includes("signin="));
    await combined.page.getByRole("button", { name: "Sign in", exact: true }).click();
    const approval = combined.page.locator(".card-prompt");
    await expect(approval).toContainText("€15");
    await combined.page.reload();
    await expect(approval).toContainText("€15");
    const agree = approval.getByRole("button", { name: "Authorise payments" });
    await expect(agree).toBeDisabled();
    await approval.getByRole("link", { name: "Terms & privacy" }).click();
    await combined.page.getByRole("button", { name: "Close terms & privacy" }).click();
    await expect(agree).toBeDisabled();
    assert.equal(combined.posts.filter(post => post.endpoint === "/me/card").length, 0);
    await approval.screenshot({ path: `tmp/qa/transition-kit/combined-${width}.png` });
    await approval.getByRole("button", { name: "I authorise card payments for this and future lessons" }).click();
    await expect(agree).toBeEnabled();
    assert.ok(await noOverflow(combined.page));
    await agree.click();
    await expect(combined.page.getByText("Payments authorised. You’re all set.")).toBeVisible();
    assert.deepEqual(combined.posts.find(post => post.endpoint === "/me/card")?.body, { consent: true, booking: approvedBooking, bookingConsent: true, savedCardKey: "qa-saved-card" });
    assert.deepEqual(combined.errors, []);
    await combined.page.close();

    // A link may finish after another tab has signed in. Its one-time reply
    // must preserve that newer session; leaving a card request behind must
    // also leave the visitor on the page they chose, rather than Stripe.
    const linkWaiting = deferred(), linkStarted = deferred();
    const cardWaiting = deferred(), cardStarted = deferred();
    const interrupted = await open(width, "/book/?signin=qa-delayed-link", {
      reply: async endpoint => {
        if (endpoint === "/auth/email-link/confirm") {
          linkStarted.resolve(); await linkWaiting.promise;
          return { json: { student, session: "qa-obsolete-link-session" } };
        }
        if (endpoint === "/me/card") {
          cardStarted.resolve(); await cardWaiting.promise;
          return { json: { checkoutUrl: "https://checkout.stripe.com/c/pay/qa-obsolete" } };
        }
        return null;
      },
    });
    try {
      await interrupted.page.getByRole("button", { name: "Sign in", exact: true }).click({ timeout: 15000 });
      await linkStarted.promise;
      await interrupted.page.evaluate(() => {
        localStorage.setItem("ines-student-session", "qa-newer-session");
        window.dispatchEvent(new Event("ines:student-session-change"));
      });
      const linkResponse = interrupted.page.waitForResponse("**/auth/email-link/confirm");
      linkWaiting.resolve(); await linkResponse;
      await expect(interrupted.page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
      assert.equal(await interrupted.page.evaluate(() => localStorage.getItem("ines-student-session")), "qa-newer-session");

      // Remove the welcome surface by returning to the account in a fresh
      // document. The newer session is retained by this tab.
      await interrupted.page.goto(`${base}/book/?view=lessons`);
      const interruptedPrompt = interrupted.page.locator(".card-prompt");
      await interruptedPrompt.getByRole("button", { name: "Add card", exact: true }).click({ timeout: 15000 });
      await interruptedPrompt.getByRole("button", { name: "Agree & add card", exact: true }).click();
      await cardStarted.promise;
      await interrupted.page.locator(".site-header__brand").click();
      await expect.poll(() => new URL(interrupted.page.url()).pathname).toBe("/");
      const cardResponse = interrupted.page.waitForResponse("**/me/card");
      cardWaiting.resolve(); await cardResponse;
      await interrupted.page.waitForLoadState("networkidle");
      assert.equal(new URL(interrupted.page.url()).pathname, "/");
      assert.deepEqual(interrupted.errors, []);
    } finally {
      linkWaiting.resolve(); cardWaiting.resolve();
      await interrupted.page.close();
    }

    // A spent link says so and opens on asking for a new one.
    const spent = await open(width, "/book/?signin=qa-spent-link", {
      reply: (endpoint) => {
        if (endpoint === "/auth/email-link/confirm") {
          return { status: 400, json: { error: "That sign-in link has already been used. Enter your email for a new one." } };
        }
        if (endpoint === "/auth/email-link") return { json: { ok: true } };
        return null;
      },
    });
    await spent.page.getByRole("button", { name: "Sign in", exact: true }).click({ timeout: 15000 });
    // The landing says why and offers the way on, never a dead end.
    await expect(spent.page.locator(".sign-in-link [role=alert]")).toContainText("already been used");
    await spent.page.getByRole("button", { name: "Email me a new link", exact: true }).click();
    await expect(spent.page.locator(".auth-panel [role=alert]")).toContainText("already been used");
    await expect(spent.page.getByRole("heading", { name: "Sign in by email" })).toBeVisible();
    await spent.page.locator(".auth-panel__form").getByLabel("Email").fill("rita@example.invalid");
    await spent.page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(spent.page.locator(".auth-panel [role=status]")).toContainText("a link is on its way");
    assert.deepEqual(spent.posts.find((post) => post.endpoint === "/auth/email-link")?.body, { email: "rita@example.invalid" });
    await spent.page.getByRole("button", { name: "Back to signing in" }).click();
    await expect(spent.page.getByRole("button", { name: "Email a link", exact: true })).toBeVisible();
    await expect(spent.page.getByRole("button", { name: "Forgot password", exact: true })).toBeVisible();
    assert.ok(await noOverflow(spent.page), `no sideways scroll at ${width}px`);
    assert.deepEqual(spent.errors, []);
    await spent.page.close();

    if (width === 390) {
      // Confirming a link consumes it even when this browser refuses to save
      // the session. Explain that outcome and offer a fresh link.
      const blocked = await open(width, "/book/?signin=qa-storage-link", {
        reply: endpoint => endpoint === "/auth/email-link/confirm"
          ? { json: { student, session: "qa-unsaved-link-session" } } : null,
      });
      await blocked.page.evaluate(() => {
        const nativeSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "ines-student-session") throw new DOMException("Isolated storage refusal", "QuotaExceededError");
          return nativeSet.call(this, key, value);
        };
      });
      await blocked.page.getByRole("button", { name: "Sign in", exact: true }).click({ timeout: 15000 });
      await expect(blocked.page.locator(".sign-in-link [role=alert]")).toContainText("This link has been used");
      await expect(blocked.page.getByRole("button", { name: "Email me a new link", exact: true })).toBeVisible();
      assert.equal(await blocked.page.evaluate(() => localStorage.getItem("ines-student-session")), null);
      assert.deepEqual(blocked.errors, []);
      await blocked.page.close();
    }

    // Back from Stripe: a short thank-you, no ask, and the card in Your details.
    const removeWaiting = deferred(), removeStarted = deferred();
    const savedStudent = { ...student, hasCard: true, cardForAllLessons: true };
    const savedBookings = [{ ...added, paymentStatus: "scheduled" }];
    const saved = await open(width, "/book/?view=lessons&card=added", {
      session: "qa-link-session",
      me: savedStudent,
      bookings: savedBookings,
      reply: async (endpoint, body) => {
        if (endpoint === "/me/card/remove") {
          removeStarted.resolve(); await removeWaiting.promise;
          Object.assign(savedStudent, { hasCard: false, cardForAllLessons: false });
          savedBookings[0].paymentStatus = "not_required";
          return { json: { student: savedStudent } };
        }
        if (endpoint === "/me" && body) {
          Object.assign(savedStudent, body);
          return { json: { student: savedStudent } };
        }
        return null;
      },
    });
    await expect(saved.page.locator(".card-added")).toContainText("Card saved", { timeout: 15000 });
    await expect(saved.page.locator(".card-prompt")).toHaveCount(0);
    assert.ok(!saved.page.url().includes("card="), "the return marker leaves the address bar");
    await chooseFromMenu(saved.page, "Edit details");
    const cardRow = saved.page.locator('.my-lessons__fact[data-field="card"]');
    await expect(cardRow).toContainText("Saved");
    await cardRow.getByRole("button", { name: /Change/ }).click();
    await expect(cardRow.getByRole("button", { name: "Agree & change card" })).toBeVisible();
    // The row eases open to its new height; it ends whole, nothing clipped.
    await saved.page.waitForTimeout(700);
    await cardRow.scrollIntoViewIfNeeded();
    assert.ok(await cardRow.evaluate((row) => row.scrollHeight <= row.clientHeight + 1), "the open row shows all of its terms");
    await saved.page.screenshot({ path: `tmp/qa/transition-kit/details-${width}.png`, fullPage: false });
    // Removing a card must not undo an independently saved name or close a
    // newer editor opened while that card request was in flight.
    await cardRow.getByRole("button", { name: "Remove card", exact: true }).click();
    await removeStarted.promise;
    const nameRow = saved.page.locator('.my-lessons__fact[data-field="name"]');
    await nameRow.getByRole("button", { name: "Change name", exact: true }).click();
    await nameRow.getByLabel("Your name", { exact: true }).fill("Rita Updated");
    await nameRow.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(nameRow).toContainText("Rita Updated");
    const emailRow = saved.page.locator('.my-lessons__fact[data-field="email"]');
    await emailRow.getByRole("button", { name: "Change email", exact: true }).click();
    const removeResponse = saved.page.waitForResponse("**/me/card/remove");
    removeWaiting.resolve(); await removeResponse;
    await expect(cardRow).toContainText("Not added");
    await expect(nameRow).toContainText("Rita Updated");
    await expect(emailRow.getByLabel("Email", { exact: true })).toBeVisible();
    const markRow = saved.page.locator('.my-lessons__fact[data-field="mark"]');
    await markRow.getByRole("button", { name: "Change splat", exact: true }).click();
    await markRow.getByRole("button", { name: "Bloom", exact: true }).click();
    await expect(markRow.locator(".my-lessons__fact-value img")).toHaveAttribute("src", "/visuals/v2-splats/built-around-you-splat-v2.svg");
    await chooseFromMenu(saved.page, "Done editing");
    await expect(saved.page.locator(".card-added")).toHaveCount(0);
    await expect(saved.page.locator(".card-prompt")).toBeVisible();
    await expect(saved.page.locator(".lesson-overview .account-menu__name")).toHaveText("Rita Updated");
    await expect(saved.page.locator(".calendar-panel > .account-signature")).toHaveAttribute("src", "/visuals/v2-splats/built-around-you-splat-v2.svg");
    assert.ok(await noOverflow(saved.page), `no sideways scroll at ${width}px`);
    assert.deepEqual(saved.errors, []);
    await saved.page.close();

    // Stripe's return marker alone is not proof that its webhook saved a card.
    const unconfirmed = await open(width, "/book/?view=lessons&card=added", { session: "qa-link-session" });
    await expect(unconfirmed.page.locator(".card-added")).toContainText("We’re confirming your saved card");
    await expect(unconfirmed.page.locator(".card-added")).not.toContainText("Card saved");
    await expect(unconfirmed.page.locator(".card-prompt")).toBeVisible({ timeout: 15000 });
    await expect(unconfirmed.page.locator(".card-added")).toContainText("hasn’t been confirmed");
    assert.deepEqual(unconfirmed.errors, []);
    await unconfirmed.page.close();
  }

  // /idioms is an account page. Inês paints her drafts locally; opening the
  // route gives no anonymous or student access to her private collection.
  const teacher = { ...student, id: "teacher-painter", name: "Inês", role: "teacher" };
  const draft = {
    id: "draft-idiom", expression: "Partir o coco a rir", meaningPt: "Rir muito.", meaningEn: "To split your sides laughing",
    literalEn: "To crack the coconut laughing", examples: ["Com aquela história, partimos o coco a rir."],
    notes: "", sourceUrl: "", tags: ["Humor"], imageUrl: "", imageAlt: "", published: 0, sortOrder: 0,
    createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z",
  };
  for (const width of [1280, 390]) {
    const painting = await open(width, "/idioms/", {
      session: "qa-teacher-paint", me: teacher, bookings: [],
      reply: (endpoint) => endpoint === "/admin/expressions" ? { json: { expressions: [draft], openToStudents: false } } : null,
    });
    await expect(painting.page.locator(".site-header")).toBeVisible();
    await painting.page.getByRole("button", { name: "Paint it", exact: true }).click();
    await expect(painting.page.locator(".expression-card")).toContainText(draft.meaningPt);
    await expect(painting.page.getByRole("link", { name: "Expressions collection", exact: true })).toHaveAttribute("href", /\/schedule\/\?tab=expressions$/);
    assert.ok(!painting.reads.includes("/me/expressions"), "a teacher's page must not spend a student pick");
    assert.deepEqual(painting.posts, [], "teacher painting never writes to the Worker");
    assert.ok(await noOverflow(painting.page), `idioms fits at ${width}px`);
    await painting.page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity));
    await painting.page.screenshot({ path: `tmp/qa/transition-kit/idioms-${width}.png`, fullPage: false });
    // Signing out in another tab removes the private draft collection here.
    await painting.page.evaluate(() => {
      localStorage.removeItem("ines-student-session");
      window.dispatchEvent(new Event("ines:student-session-change"));
    });
    await expect(painting.page.locator(".auth-panel")).toBeVisible();
    await expect(painting.page.locator(".expression-card")).toHaveCount(0);
    assert.deepEqual(painting.errors, []);
    await painting.page.close();
  }

  const gated = await open(390, "/idioms/", { session: "qa-student-paint", bookings: [] });
  await expect(gated.page.getByRole("status")).toContainText("Expressions aren’t available yet.");
  assert.ok(!gated.reads.includes("/admin/expressions"), "a student never reads the teacher's draft collection");
  assert.deepEqual(gated.posts, [], "a closed picker cannot draw");
  assert.deepEqual(gated.errors, []);
  await gated.page.close();

  const signedOut = await open(390, "/idioms/", {
    bookings: [],
    reply: (endpoint) => endpoint === "/auth/login" ? { json: { student, session: "qa-idioms-login" } } : null,
  });
  await expect(signedOut.page.locator(".auth-panel")).toBeVisible();
  assert.equal(signedOut.reads.length, 0, "signed-out visitors cannot read expressions");
  await signedOut.page.getByLabel("Email", { exact: true }).fill(student.email);
  await signedOut.page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await signedOut.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(signedOut.page.getByRole("status")).toContainText("Expressions aren’t available yet.");
  assert.ok(signedOut.reads.includes("/me/expressions"), "signing in keeps the same idioms route and checks student access");
  assert.ok(!signedOut.reads.includes("/admin/expressions"));
  assert.deepEqual(signedOut.errors, []);
  await signedOut.page.close();

  console.log("Transition kit: sign-in links, interrupted sign-in/card requests, independent profile saves, storage recovery, card setup and authenticated idioms pass at desktop and phone widths.");
} finally {
  await browser.close();
}
