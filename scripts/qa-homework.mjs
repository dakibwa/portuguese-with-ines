import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// One UI journey, with synthetic lesson material and an isolated AI response.
// Real SQL, ownership, publication and provider failures are tested in the Worker suite.
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const output = "tmp/qa/homework";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const student = { id: "homework-student", name: "Ana Martins", email: "ana@example.invalid", phone: "", timezone: "Europe/Lisbon", role: "student" };
const lesson = { id: "homework-lesson", student_id: student.id, reference: "HW-TEST", student_name: student.name, student_email: student.email, student_phone: "",
  lesson_name: "60 minutes", lesson_type_id: "single", starts_at: "2026-10-14T09:00:00.000Z", ends_at: "2026-10-14T10:00:00.000Z", status: "confirmed", location: "online", notes: "",
  same_day_change: 0, same_day_fee_status: "not_required", reschedule_count: 0, payment_status: "not_required", attendance_status: "expected", added_by_teacher: 1 };
const exampleSheet = {
  title: "Um café, por favor", objective: "Fazer um pedido num café e usar queria e por favor.", reminder: "Amanhã, faz o teu pedido em voz alta, sem olhar para esta ficha.",
  sections: [
    { title: "Lembra-te", instruction: "Sem olhar para as notas da aula, responde.", example: "", questions: [
      { id: "q1", prompt: "Que palavra usamos para pedir alguma coisa de forma educada? Começa por q.", answer: "Queria.", explanation: "Queria é uma forma comum de fazer um pedido educado." },
      { id: "q2", prompt: "Que expressão de duas palavras podes acrescentar no fim de um pedido?", answer: "Por favor.", explanation: "" },
    ] },
    { title: "Pratica", instruction: "Completa os pedidos com as palavras da aula.", example: "Uma água → Queria uma água, por favor.", questions: [
      { id: "q3", prompt: "Queria um ______, por favor. (café)", answer: "Queria um café, por favor.", explanation: "" },
      { id: "q4", prompt: "______ um chá, por favor.", answer: "Queria um chá, por favor.", explanation: "" },
    ] },
    { title: "Agora é contigo", instruction: "Imagina que estás num café em Porto.", example: "", questions: [
      { id: "q5", prompt: "Escolhe uma bebida da aula e escreve o teu pedido.", answer: "Resposta possível: Queria um chá, por favor.", explanation: "Podes escolher outra bebida. Usa queria e por favor." },
      { id: "q6", prompt: "O empregado entrega-te a bebida. Como agradeces?", answer: "Obrigado. / Obrigada.", explanation: "Usa obrigado se és homem e obrigada se és mulher." },
    ] },
  ],
};

try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 600, reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-homework-session"));
    let studentView = false, photoCalls = 0, answerSaveFails = false, generated = null, slow = false;
    // The Worker starts a new sheet at the student's last level (A2 here) and 15 minutes.
    let homework = { bookingId: lesson.id, studentName: student.name, lessonAt: lesson.starts_at, notes: "", level: "A2", minutes: 15,
      sheet: null, publishedAt: null, updatedAt: null, aiAvailable: true, progress: { answers: {}, completedAt: null, updatedAt: null, submission: null } };
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!["/me", "/lesson-types", "/availability", "/me/recurring-rates", "/me/expressions"].includes(url.pathname) && !url.pathname.startsWith("/admin/") && !url.pathname.startsWith("/me/homework")) return route.continue();
      const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
      const json = (data, status = 200) => route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(data) });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const data = request.method() === "POST" ? request.postDataJSON() : null;
      if (url.pathname === "/me") return json({ student: studentView ? student : { ...student, id: "teacher", name: "Inês", role: "teacher" }, bookings: [], series: [] });
      if (url.pathname === "/lesson-types") return json({ lessonTypes: [{ id: "single", slug: "single", name: "60 minutes", duration_minutes: 60, price_cents: 2500 }], postpay: false });
      if (url.pathname === "/availability") return json({ slotsByDate: {}, horizonDays: 56 });
      if (url.pathname === "/me/recurring-rates") return json({ rates: {} });
      if (url.pathname === "/me/expressions") return json({ expression: null, canPick: false, hasPublished: false, shuffleLabels: [] });
      if (url.pathname === "/admin/bookings") return json({ bookings: [lesson], reconciliation: [] });
      if (url.pathname === "/admin/students") return json({ students: [{ ...student, signedIn: true, hasLessons: true, hasCard: true, prices: { 60: 2500 }, awaitingWelcome: false, upcoming: 0, homeworkToReview: homework.progress.submission && !homework.progress.submission.returnedAt ? [{ bookingId: lesson.id, submittedAt: homework.progress.submission.submittedAt }] : [] }] });
      if (url.pathname === "/admin/availability") return json({ rules: [{ id: 1, weekday: 3, start_minute: 540, last_start_minute: 1020 }], exceptions: [], settings: { slotIntervalMinutes: 30 } });
      if (url.pathname === "/admin/google-calendar") return json({ configured: false, connected: false });
      // Slowed while the progress card is photographed.
      if (slow && /\/homework\/(transcribe|generate)$/.test(url.pathname)) await new Promise(resolve => setTimeout(resolve, 1500));
      if (url.pathname === `/admin/lessons/${lesson.id}/homework/transcribe`) {
        photoCalls++; assert.equal(data.images.length, 2, "both pages go in one request");
        data.images.forEach(image => assert.match(image, /^data:image\/jpeg;base64,/));
        return json({ notes: "No café: queria, um café, uma água, um chá, por favor, obrigado/obrigada.", uncertain: [] });
      }
      if (url.pathname.startsWith(`/admin/lessons/${lesson.id}/homework`)) {
        if (data && url.pathname.endsWith("/return")) {
          homework.progress = { ...homework.progress, updatedAt: new Date().toISOString(), submission: {
            ...homework.progress.submission, marks: data.marks, returnedAt: new Date().toISOString(), state: "returned",
          } };
        } else if (data) {
          homework = { ...homework, ...data, updatedAt: new Date().toISOString() };
          if (url.pathname.endsWith("/generate")) { generated = data; homework.sheet = structuredClone(exampleSheet); }
          if (url.pathname.endsWith("/publish")) homework.publishedAt = homework.updatedAt;
        }
        return json(homework);
      }
      if (url.pathname === "/me/homework") return json({ homework: homework.publishedAt ? [{ bookingId: lesson.id, lessonAt: lesson.starts_at, title: homework.sheet.title, level: homework.level, minutes: homework.minutes, completedAt: homework.progress.completedAt, submittedAt: homework.progress.submission?.submittedAt ?? null, returnedAt: homework.progress.submission?.returnedAt ?? null, started: Boolean(homework.progress.updatedAt) }] : [] });
      if (url.pathname === `/me/homework/${lesson.id}` || url.pathname === `/me/homework/${lesson.id}/submit`) {
        if (data && answerSaveFails) return json({ error: "Answers could not be saved. Try again." }, 503);
        if (data) homework.progress = { ...homework.progress, answers: data.answers, updatedAt: new Date().toISOString() };
        if (url.pathname.endsWith("/submit")) {
          homework.progress.submission = { id: "attempt-1", submittedAt: new Date().toISOString(), returnedAt: null, state: "submitted", answers: { ...data.answers }, marks: {
            q1: { status: "correct", feedback: "Está certo.", source: "key" }, q2: { status: "correct", feedback: "Está certo.", source: "key" },
            q3: { status: "retry", feedback: "Escreve café com acento.", source: "key" }, q4: { status: "correct", feedback: "Está certo.", source: "key" },
            q5: { status: "review", feedback: "Confirma este pedido.", source: "ai" }, q6: { status: "correct", feedback: "Está certo.", source: "key" },
          } };
        }
        const progress = structuredClone(homework.progress);
        if (progress.submission && !progress.submission.returnedAt) delete progress.submission.marks;
        return json({ bookingId: lesson.id, lessonAt: lesson.starts_at, sheet: homework.sheet, level: homework.level, minutes: homework.minutes, progress });
      }
      return json({ error: "Unexpected fixture request" }, 404);
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
    await page.goto(`${base}/schedule/`);
    await page.getByRole("tab", { name: /^Students/ }).click();
    await page.getByRole("button", { name: "Open Ana Martins’s profile", exact: true }).click();
    await page.getByRole("button", { name: "Homework", exact: true }).click();
    const editor = page.locator(".teacher-homework");
    const shot = name => editor.screenshot({ path: `${output}/teacher-${name}-${width}.png` });
    const heading = name => expect(editor.locator(".homework-step__head h4")).toHaveText(name);
    // With AI on, Homework asks one thing: what did you work on? A photo, or type it.
    await heading("What did you work on?");
    const capture = editor.locator("label.homework-capture");
    await expect(capture).toContainText("Take a photo");
    assert.equal(await capture.locator('input[type="file"]').getAttribute("capture"), "environment");
    await expect(editor.getByRole("button", { name: "Type it", exact: true })).toBeVisible();
    await shot("01-what");
    const pages = await page.evaluate(() => [["No café", "Queria um café, por favor."], ["uma água / um chá", "obrigado / obrigada"]].map(lines => {
      const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 500;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 800, 500); ctx.fillStyle = "#203e82"; ctx.font = "32px sans-serif";
      lines.forEach((line, i) => ctx.fillText(line, 40, 70 + i * 70));
      return canvas.toDataURL("image/jpeg").split(",")[1];
    }));
    await capture.locator('input[type="file"]').setInputFiles(pages.map((photo, i) => ({ name: `lesson-notes-${i + 1}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(photo, "base64") })));
    // The photos answer the first step: on to the level, the student's last (A2), then the length (15).
    await heading("Level");
    await expect(editor.locator(".homework-summary")).toContainText("2 photos");
    await expect(editor.getByRole("button", { name: "A2", exact: true })).toHaveAttribute("aria-pressed", "true");
    await shot("02-level");
    await editor.getByRole("button", { name: "A2", exact: true }).click();
    await heading("Length");
    await expect(editor.getByRole("button", { name: "15 mins", exact: true })).toHaveAttribute("aria-pressed", "true");
    await shot("03-length");
    // Back steps back one decision, keeping the choices made.
    await editor.getByRole("button", { name: "Back", exact: true }).click();
    await heading("Level");
    await editor.getByRole("button", { name: "A2", exact: true }).click();
    await editor.getByRole("button", { name: "15 mins", exact: true }).click();
    await heading("Ready");
    await expect(editor.locator(".homework-summary")).toHaveCount(3);
    await shot("04-ready");
    // Unread photos are unsaved work: leaving asks first.
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Close homework", exact: true }).click();
    await expect(editor.locator(".homework-summary").first()).toContainText("2 photos");
    // One press reads both pages and makes the draft, with gentle progress meanwhile.
    slow = true;
    await editor.getByRole("button", { name: "Generate homework", exact: true }).click();
    await expect(editor.locator(".homework-working h4")).toHaveText("Reading your notes");
    await shot("05-reading");
    await expect(editor.locator(".homework-working h4")).toHaveText("Writing the homework");
    await shot("06-writing");
    slow = false;
    await expect(editor.locator(".homework-sheet")).toBeVisible();
    assert.equal(photoCalls, 1);
    assert.match(generated.notes, /No café/);
    assert.deepEqual([generated.level, generated.minutes], ["A2", 15]);
    await expect(editor.locator(".homework-editor")).toHaveCount(0);
    await shot("07-draft-preview");
    await editor.getByRole("button", { name: "Fine-tune", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Fine-tune", exact: true })).toHaveAttribute("aria-pressed", "true");
    await editor.getByRole("textbox", { name: /^Instruction/ }).nth(2).fill("Imagina que estás num café no Porto.");
    await editor.locator(".homework-editor").screenshot({ path: `${output}/teacher-08-fine-tune-${width}.png` });
    await editor.getByRole("button", { name: "Fine-tune", exact: true }).click();
    await expect(editor.locator(".homework-sheet")).toContainText("Imagina que estás num café no Porto.");
    await editor.getByLabel("I checked the Portuguese and the answers").check();
    await editor.locator(".homework-publish").screenshot({ path: `${output}/teacher-09-publish-${width}.png` });
    await editor.getByRole("button", { name: "Publish for student", exact: true }).click();
    await expect(editor.locator(".homework-status")).toContainText("Published");
    assert.equal(homework.sheet.sections[2].instruction, "Imagina que estás num café no Porto.");
    await shot("10-published");
    if (width === 1280) {
      // The inline student editor remains mounted behind the timetable. Print
      // the lesson dialog alone, never a second worksheet hidden underneath it.
      await page.getByRole("tab", { name: "Timetable", exact: true }).click();
      await page.getByRole("button", { name: /Ana Martins.*View lesson/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Homework", exact: true }).click();
      await expect(dialog.locator(".homework-sheet")).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator("body > .homework-print:visible").count(), 1, "Print only the requested lesson");
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await dialog.getByRole("button", { name: "Close lesson details", exact: true }).click();
    }
    studentView = true;
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("ines-student-session", "isolated-homework-session"); });
    await page.goto(`${base}/book/?view=lessons`);
    async function openHomework(beforeOpen) {
      await page.locator("#account-menu").waitFor({ state: "attached", timeout: 10000 }).catch(async error => {
        await page.screenshot({ path: `${output}/account-error-${width}.png`, fullPage: true });
        console.error(await page.locator("body").innerText(), errors);
        throw error;
      });
      const toggle = page.locator("#account-menu-button");
      if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
      await page.locator("#account-menu").getByRole("button", { name: "Homework", exact: true }).click();
      await page.locator(".homework-list").getByRole("button").waitFor();
      await beforeOpen?.(page);
      await page.locator(".homework-list").getByRole("button").click();
    }
    await openHomework();
    await page.locator(".student-homework textarea").first().fill("Queria.");
    await page.getByRole("button", { name: "Save answers", exact: true }).click();
    await expect(page.locator(".homework-save")).toContainText("Answers saved.");
    await page.reload(); await openHomework();
    await expect(page.locator(".student-homework textarea").first()).toHaveValue("Queria.");
    const answers = ["Queria.", "Por favor.", "cafe", "Queria", "Queria um chá, por favor.", "Obrigado."];
    for (let i = 0; i < answers.length; i++) await page.locator(".student-homework textarea").nth(i).fill(answers[i]);
    await page.getByRole("button", { name: "Submit to Inês", exact: true }).click();
    await expect(page.locator(".student-homework .homework-status")).toContainText("Sent to Inês");
    await expect(page.locator(".student-homework .homework-feedback")).toHaveCount(0);
    await expect(page.locator(".student-homework textarea").first()).toBeDisabled();
    studentView = false;
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("ines-student-session", "isolated-homework-session"); });
    await page.goto(`${base}/schedule/`);
    await page.getByRole("tab", { name: /^Students/ }).click();
    await page.getByRole("button", { name: /Homework to review/ }).click();
    await expect(editor.locator(".homework-review")).toBeVisible();
    await page.getByRole("button", { name: "Close homework", exact: true }).click();
    await page.getByRole("button", { name: /Homework to review/ }).click();
    await expect(editor.locator(".homework-review")).toBeVisible();
    await expect(editor.getByRole("button", { name: "Approve & send back", exact: true })).toBeDisabled();
    // Settled answers fold to their mark and feedback; only the uncertain one is open.
    await expect(editor.locator(".homework-review__question--folded")).toHaveCount(5);
    await expect(editor.locator(".homework-review__tally")).toContainText("1 needs you");
    await shot("11-review");
    await editor.getByRole("radio", { name: "Correct", exact: true }).first().check();
    await editor.getByLabel("Feedback", { exact: false }).first().fill("Muito bem. O teu pedido está claro e educado.");
    // Still open after it is settled, so she can finish her sentence.
    await expect(editor.locator(".homework-review__question--folded")).toHaveCount(5);
    await editor.getByRole("button", { name: "Change mark for Pratica, question 1", exact: true }).click();
    await expect(editor.locator(".homework-review__question--folded")).toHaveCount(4);
    await shot("12-review-ready");
    await editor.getByRole("button", { name: "Approve & send back", exact: true }).click();
    // Approved reads as Done, plainly, on both sides.
    await expect(editor.locator(".homework-status")).toHaveText("Done");
    await expect(editor.locator(".homework-done")).toContainText("Done");
    await shot("13-done");
    studentView = true;
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("ines-student-session", "isolated-homework-session"); });
    await page.goto(`${base}/book/?view=lessons`); await openHomework(page => page.locator(".homework-list").screenshot({ path: `${output}/student-list-done-${width}.png` }));
    await expect(page.locator(".student-homework .homework-status")).toHaveText("Done");
    await expect(page.locator(".student-homework .homework-done")).toContainText("Done");
    await expect(page.locator(".student-homework .homework-feedback")).toHaveCount(6);
    await expect(page.locator(".student-homework .homework-feedback").nth(4)).toContainText("O teu pedido está claro e educado.");
    await page.locator(".my-lessons__homework").screenshot({ path: `${output}/student-done-${width}.png` });
    await page.getByRole("button", { name: "Print worksheet", exact: true }).click();
    await expect(page.locator(".student-homework .homework-paper-preview")).toBeVisible();
    await page.locator(".my-lessons__homework").screenshot({ path: `${output}/print-preview-${width}.png` });
    if (width === 1280) {
      await page.emulateMedia({ media: null });
      await page.pdf({ path: `${output}/worksheet.pdf`, format: "A4", preferCSSPageSize: true });
      await page.getByLabel("Include answer key").check();
      await page.pdf({ path: `${output}/worksheet-with-key.pdf`, format: "A4", preferCSSPageSize: true });
    }
    await page.getByRole("button", { name: "Do online", exact: true }).click();
    // A site link is client navigation too: it must save the current answer.
    await page.locator(".student-homework textarea").nth(2).fill("café");
    await expect(page.locator(".student-homework .homework-feedback").nth(2)).toContainText("Edited since feedback");
    answerSaveFails = true;
    await page.getByRole("button", { name: "All homework", exact: true }).click();
    await expect(page.locator(".student-homework [role=alert]")).toContainText("Answers could not be saved");
    await expect(page.locator(".student-homework textarea").nth(2)).toHaveValue("café");
    answerSaveFails = false;
    if (width < 821) {
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
      await page.getByRole("dialog", { name: "Site navigation" }).getByRole("link", { name: "Approach", exact: true }).click();
    } else await page.locator(".site-header").getByRole("link", { name: "Approach", exact: true }).click();
    await page.waitForURL("**/approach/");
    assert.equal(homework.progress.answers.q3, "café");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("Homework passed: teacher steps (photo, level, length, back, generate with progress), two pages read and drafted in one press, preview, fine-tune and publication; student submission, private automatic marking, teacher correction/approval, Done for both, returned feedback and black-and-white print; desktop and phone. AI responses are synthetic fixtures.");
} finally { await browser.close(); }
