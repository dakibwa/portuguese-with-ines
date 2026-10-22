import { BOOKING_API_BASE_URL, BOOKING_TIME_ZONE } from "@/lib/config";
import { forgetSession } from "@/lib/auth-api";
import { browserTimeZone } from "@/lib/booking-api";

export type HomeworkQuestion = { id: string; prompt: string; answer: string; explanation: string; marking?: "exact" | "written"; acceptedAnswers?: string[] };
export type HomeworkSheet = {
  title: string;
  objective: string;
  reminder: string;
  sections: { title: string; instruction: string; example: string; questions: HomeworkQuestion[] }[];
};
export type HomeworkMark = { status: "correct" | "retry" | "review"; feedback: string; source: "key" | "ai" | "teacher" | "pending" };
export type HomeworkSubmission = {
  id: string; answers: Record<string, string>; submittedAt: string; returnedAt: string | null;
  state: "marking" | "submitted" | "returned";
  /** Never sent to a student until Inês approves this submission. */
  marks?: Record<string, HomeworkMark>; markingNote?: string;
};
export type HomeworkProgress = { answers: Record<string, string>; completedAt: string | null; updatedAt: string | null; submission: HomeworkSubmission | null };
/** A lesson in Porto reads on Porto's clock, an online one on the student's. */
export type LessonPlace = "online" | "porto";
/** The clock a lesson's date reads on, as on their lessons page; Porto's for Inês, who gets no place. */
export const lessonDateZone = (location?: LessonPlace) => location === "online" ? browserTimeZone() : BOOKING_TIME_ZONE;
export type HomeworkSummary = {
  bookingId: string; lessonAt: string; location?: LessonPlace; title: string; level: string; minutes: number;
  publishedAt: string; completedAt: string | null; started: boolean; submittedAt: string | null; returnedAt: string | null;
};
export type StudentHomeworkData = {
  bookingId: string; lessonAt: string; location?: LessonPlace; level: string; minutes: number; sheet: HomeworkSheet; progress: HomeworkProgress;
  /** Whether a submission's written answers get an automatic suggestion. */
  aiMarking?: boolean;
};
export type TeacherHomeworkData = Omit<StudentHomeworkData, "sheet"> & {
  studentName: string; notes: string; sheet: HomeworkSheet | null;
  publishedAt: string | null; updatedAt: string | null; aiAvailable: boolean;
};

function isSheet(value: unknown): value is HomeworkSheet {
  const s = value as HomeworkSheet | null;
  return Boolean(s && typeof s.title === "string" && typeof s.objective === "string" && typeof s.reminder === "string" &&
    Array.isArray(s.sections) && s.sections.length && s.sections.every(section =>
      typeof section.title === "string" && typeof section.instruction === "string" && typeof section.example === "string" &&
      Array.isArray(section.questions) && section.questions.length && section.questions.every(q =>
        typeof q.id === "string" && typeof q.prompt === "string" && typeof q.answer === "string" && typeof q.explanation === "string")));
}
function isProgress(value: unknown): value is HomeworkProgress {
  const p = value as HomeworkProgress | null;
  return Boolean(p && p.answers && typeof p.answers === "object" && !Array.isArray(p.answers) && Object.values(p.answers).every(a => typeof a === "string") &&
    (p.updatedAt === null || typeof p.updatedAt === "string") && (p.completedAt === null || typeof p.completedAt === "string") &&
    (p.submission === null || (p.submission && typeof p.submission.id === "string" && ["marking", "submitted", "returned"].includes(p.submission.state) &&
      typeof p.submission.submittedAt === "string" && (p.submission.returnedAt === null || typeof p.submission.returnedAt === "string") &&
      p.submission.answers && typeof p.submission.answers === "object" && !Array.isArray(p.submission.answers) && Object.values(p.submission.answers).every(a => typeof a === "string") &&
      (!p.submission.marks || Object.values(p.submission.marks).every(m => m && ["correct", "retry", "review"].includes(m.status) && typeof m.feedback === "string")))));
}
const invalid = () => new Error("Homework could not be loaded. Please try again.");

async function request(token: string, path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`${BOOKING_API_BASE_URL}${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (response.status === 401) forgetSession(token);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Homework could not be saved. Please try again.");
  if (!data || typeof data !== "object") throw invalid();
  return data;
}

export async function teacherHomeworkRequest(token: string, id: string, action = "", body?: unknown, signal?: AbortSignal): Promise<TeacherHomeworkData> {
  const data = await request(token, `/admin/lessons/${encodeURIComponent(id)}/homework${action ? `/${action}` : ""}`, body, signal);
  if (data.bookingId !== id || typeof data.lessonAt !== "string" || typeof data.notes !== "string" || typeof data.level !== "string" ||
    !Number.isFinite(data.minutes) || (data.sheet !== null && !isSheet(data.sheet)) || !isProgress(data.progress) ||
    (data.updatedAt !== null && typeof data.updatedAt !== "string") || (data.publishedAt !== null && typeof data.publishedAt !== "string")) throw invalid();
  return data;
}
/** The Worker reads up to this many photos in one request (HOMEWORK_PHOTO_LIMIT). */
export const HOMEWORK_PHOTO_LIMIT = 3;
export async function transcribeHomeworkPhotos(token: string, id: string, images: string[], updatedAt: string | null, signal?: AbortSignal): Promise<{ notes: string; uncertain: string[] }> {
  const data = await request(token, `/admin/lessons/${encodeURIComponent(id)}/homework/transcribe`, { images, updatedAt }, signal);
  if (typeof data.notes !== "string" || !Array.isArray(data.uncertain) || !data.uncertain.every((s: unknown) => typeof s === "string")) throw invalid();
  return data;
}
export async function fetchHomework(token: string, signal?: AbortSignal): Promise<HomeworkSummary[]> {
  const data = await request(token, "/me/homework", undefined, signal);
  if (!Array.isArray(data.homework) || !data.homework.every((h: HomeworkSummary) => h && typeof h.bookingId === "string" && typeof h.title === "string" && typeof h.lessonAt === "string")) throw invalid();
  return data.homework;
}
export async function fetchHomeworkSheet(token: string, id: string, signal?: AbortSignal): Promise<StudentHomeworkData> {
  const data = await request(token, `/me/homework/${encodeURIComponent(id)}`, undefined, signal);
  if (data.bookingId !== id || typeof data.lessonAt !== "string" || !isSheet(data.sheet) || !isProgress(data.progress)) throw invalid();
  return data;
}
export async function saveHomeworkAnswers(token: string, id: string, progress: HomeworkProgress, submit = false): Promise<HomeworkProgress> {
  const data = await request(token, `/me/homework/${encodeURIComponent(id)}${submit ? "/submit" : ""}`, { answers: progress.answers, updatedAt: progress.updatedAt });
  if (!isProgress(data.progress)) throw invalid();
  return data.progress;
}

/** Canvas normalises orientation and strips the photo's original metadata. */
export async function prepareHomeworkPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) throw new Error("Choose a photo smaller than 20 MB.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("This photo format could not be opened. Try a JPEG, PNG or a screenshot of the photo."); }
  try {
    if (bitmap.width * bitmap.height > 64_000_000) throw new Error("Choose a smaller photo of the lesson notes.");
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This photo could not be opened. Try another one.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.86);
    if (data.length > 2800000) throw new Error("This photo is too large. Crop it to just the lesson notes.");
    return data;
  } finally { bitmap.close(); }
}
