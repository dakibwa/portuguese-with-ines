import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// One UI journey for students' own versions of an expression ("Noutras
// línguas", stored as translations): a student sends one, Inês approves it,
// and then it shows to everyone reading the expression. Every
// Worker request is a fixture. Real SQL, the one-waiting rule, the daily limit,
// privacy and who may review are proven in workers/booking/integration-test.mjs.
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const output = "tmp/qa/expression-translations";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const student = { id: "translation-student", name: "Ana Martins", email: "ana@example.invalid", phone: "", timezone: "Europe/Lisbon", role: "student" };
const teacher = { ...student, id: "teacher", name: "Inês", email: "ines@example.invalid", role: "teacher" };
const expression = {
  id: "original-1", expression: "Partir o coco a rir", meaningPt: "Rir muito.", meaningEn: "To split your sides laughing",
  literalEn: "To crack the coconut laughing", examples: ["Com aquela história, partimos o coco a rir."],
  notes: "Diz-se no Porto.", sourceUrl: "", tags: ["Humor"], imageUrl: "", imageAlt: "", published: 1, sortOrder: 0,
  createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z",
};

try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 600, reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-translation-session"));
    let viewer = student;
    let collection = [expression];
    const translations = [];
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (!["/me", "/lesson-types", "/availability"].includes(path) && !path.startsWith("/me/") && !path.startsWith("/admin/") && !path.startsWith("/expressions/")) return route.continue();
      const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS" };
      const json = (data, status = 200) => route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(data) });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const pending = () => translations.filter(row => row.status === "pending");
      if (path === "/me") return json({ student: viewer, bookings: [], series: [] });
      if (path === "/me/expressions") return json({ expression, canPick: false, hasPublished: true, shuffleLabels: [] });
      if (path === "/me/recurring-rates") return json({ rates: {} });
      if (path === "/me/homework") return json({ homework: [] });
      if (path === "/lesson-types") return json({ lessonTypes: [{ id: "single", slug: "single", name: "60 minutes", duration_minutes: 60, price_cents: 2500 }], postpay: false });
      if (path === "/availability" || path === "/admin/lesson-availability") return json({ slotsByDate: {}, horizonDays: 56 });
      if (path === `/expressions/${expression.id}/translations`) {
        // Public: approved only, and never who wrote them.
        return json({ translations: translations.filter(row => row.status === "approved").map(({ id, language, text, createdAt }) => ({ id, language, text, createdAt })) });
      }
      if (path === `/me/expressions/${expression.id}/translations`) {
        assert.equal(viewer.role, "student", "only a student sends a translation");
        const body = request.postDataJSON();
        assert.deepEqual(Object.keys(body).sort(), ["language", "text"]);
        assert.equal(body.language, "English", "the form asks no language: it is the device's");
        translations.push({ id: translations.length + 1, ...body, status: "pending", createdAt: new Date().toISOString() });
        return json({ status: "pending" }, 201);
      }
      if (path === "/admin/expressions") return json({ expressions: collection, openToStudents: true, pendingTranslations: pending().length });
      if (path === "/admin/expression-translations") {
        const status = url.searchParams.get("status") ?? "pending";
        return json({ pendingCount: pending().length, translations: translations.filter(row => row.status === status).map(row => ({
          ...row, expressionId: expression.id, expression: expression.expression, reviewedAt: null, studentFirstName: "Ana",
        })) });
      }
      const review = path.match(/^\/admin\/expression-translations\/(\d+)\/(approve|reject)$/);
      if (review) {
        translations.find(row => row.id === Number(review[1])).status = review[2] === "approve" ? "approved" : "rejected";
        return json({ ok: true, pendingCount: pending().length });
      }
      if (path === "/admin/bookings") return json({ bookings: [], reconciliation: [] });
      if (path === "/admin/students") return json({ students: [] });
      if (path === "/admin/availability") return json({ rules: [{ id: 1, weekday: 3, start_minute: 540, last_start_minute: 1020 }], exceptions: [], settings: { slotIntervalMinutes: 30 } });
      if (path === "/admin/google-calendar") return json({ configured: false, connected: false });
      return json({ error: "Unexpected fixture request" }, 404);
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));

    // A student paints their expression and opens its meaning: Inês's notes
    // and the other languages are among its facts, with nothing at the foot.
    async function openTranslations() {
      await page.goto(`${base}/idioms/`);
      await page.getByRole("button", { name: "Paint it", exact: true }).click();
      await page.getByRole("button", { name: "Show meaning", exact: true }).click();
      const card = page.locator(".expression-reading__text");
      await card.getByRole("heading", { name: expression.expression }).waitFor();
      await expect(card.locator(".expression-card__meanings")).toContainText(expression.notes);
      await expect(card.getByRole("button")).toHaveText(["Add yours"]);
      return card.locator(".expression-translations");
    }
    let panel = await openTranslations();
    await expect(panel).toContainText("Do you say it another way in your language?");
    await panel.getByRole("button", { name: "Add yours", exact: true }).click();
    await panel.getByLabel("How you say it", { exact: true }).fill("To laugh your head off");
    await expect(panel).toContainText("478 characters left");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll on a phone");
    await panel.screenshot({ path: `${output}/student-form-${width}.png` });
    await panel.getByRole("button", { name: "Send to Inês", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Thanks! Inês will check it before it appears.");
    assert.equal(translations.length, 1);

    // Inês sees it waiting in her collection, and approves it.
    viewer = teacher;
    await page.goto(`${base}/schedule/?tab=expressions`);
    const review = page.locator(".teacher-translations");
    await expect(review.locator(".teacher-translations__count")).toHaveText("1");
    const item = review.locator(".teacher-translation");
    await expect(item).toContainText("To laugh your head off");
    await expect(item).toContainText("From Ana");
    // Her preview already has the empty list cached when she approves one.
    await page.getByRole("button", { name: "Paint it", exact: true }).click();
    await page.getByRole("button", { name: "Show meaning", exact: true }).click();
    const preview = page.locator(".student-expressions .expression-translations");
    await expect(preview).toContainText("None yet.");
    await review.screenshot({ path: `${output}/teacher-review-${width}.png` });
    await item.getByRole("button", { name: /^Approve/ }).click();
    await expect(review.getByRole("status").filter({ hasText: "Approved." })).toContainText("Approved.");
    await expect(review.locator(".teacher-translations__count")).toHaveCount(0);
    await expect(review).toContainText("Nothing to check just now.");
    await expect(preview).toContainText("To laugh your head off");

    // Back as the student, it now shows, without any name.
    viewer = student;
    panel = await openTranslations();
    await expect(panel.locator(".expression-translations__list li")).toHaveCount(1);
    await expect(panel.locator(".expression-translations__list")).toContainText("To laugh your head off");
    await expect(panel.locator(".expression-translations__list")).not.toContainText("Ana");
    await expect(panel.locator(".expression-translations__list .expression-card__value")).toHaveAttribute("lang", "en");
    await panel.screenshot({ path: `${output}/student-approved-${width}.png` });

    // Filtering, adding, changing tabs or opening another card must not silently
    // throw away an expression she is still writing.
    viewer = teacher;
    collection = [expression, { ...expression, id: "original-2", expression: "Meter os pés pelas mãos" }];
    await page.goto(`${base}/schedule/?tab=expressions`);
    const first = page.locator('[data-expression-id="original-1"]');
    await first.getByRole("button", { name: "Edit", exact: true }).click();
    const draftTitle = "Partir o coco a rir, com amigos";
    await first.getByRole("textbox", { name: "Expression", exact: true }).fill(draftTitle);
    const search = page.getByRole("searchbox", { name: "Search", exact: true });
    if (await search.isEnabled()) {
      await search.fill("no expression matches this");
      await search.fill("");
    }
    await expect(first.getByRole("textbox", { name: "Expression", exact: true })).toHaveValue(draftTitle);
    const otherPencil = page.locator('[data-expression-id="original-2"]').getByRole("button", { name: "Edit", exact: true });
    if (await otherPencil.isEnabled()) await otherPencil.click();
    await expect(first.getByRole("textbox", { name: "Expression", exact: true })).toHaveValue(draftTitle);
    const add = page.getByRole("button", { name: "Add an expression", exact: true });
    if (await add.isEnabled()) await add.click();
    await expect(first.getByRole("textbox", { name: "Expression", exact: true })).toHaveValue(draftTitle);
    await page.getByRole("tab", { name: "Timetable", exact: true }).click();
    await page.getByRole("tab", { name: "Expressions", exact: true }).click();
    await expect(first.getByRole("textbox", { name: "Expression", exact: true })).toHaveValue(draftTitle);
    await first.screenshot({ path: `${output}/teacher-draft-${width}.png` });
    await first.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(first).toContainText("Discard your changes?");
    await first.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(first.getByRole("textbox", { name: "Expression", exact: true })).toHaveValue(draftTitle);
    const leaving = page.waitForEvent("dialog", { timeout: 5000 });
    const reload = page.reload({ timeout: 3000 }).catch(() => null);
    const warning = await leaving;
    assert.equal(warning.type(), "beforeunload");
    await warning.dismiss();
    await reload;
    await expect(first.getByRole("textbox", { name: "Expression", exact: true })).toHaveValue(draftTitle);
    await page.getByRole("link", { name: "View page", exact: true }).click();
    await expect(first).toContainText("Discard your changes?", { timeout: 2000 });
    await first.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(first.getByRole("textbox", { name: "Expression", exact: true })).toHaveValue(draftTitle);
    await page.getByRole("tab", { name: "Timetable", exact: true }).click();
    await page.locator(".site-header__brand").click();
    await expect(page.getByRole("tab", { name: "Expressions", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(first.getByRole("button", { name: "Discard", exact: true })).toBeFocused();
    await first.getByRole("button", { name: "Cancel", exact: true }).click();
    await first.getByRole("button", { name: "Cancel", exact: true }).click();
    await first.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(first.getByRole("button", { name: "Edit", exact: true })).toBeEnabled();
    await expect(add).toBeEnabled();
    await first.getByRole("button", { name: "Edit", exact: true }).click();
    await first.getByRole("textbox", { name: "Expression", exact: true }).fill(draftTitle);
    await page.getByRole("link", { name: "View page", exact: true }).click();
    await first.getByRole("button", { name: "Discard", exact: true }).click();
    await page.waitForURL("**/idioms/");
    await expect(page.getByRole("button", { name: "Paint it", exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("Expressions passed: translation approvals update the open preview; filters, tabs, other cards, reloads and navigation preserve drafts until she discards them; desktop and phone.");
} finally { await browser.close(); }
