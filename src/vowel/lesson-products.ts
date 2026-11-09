import { BOOT } from "./runtime";
export const staticLessonTypes = (BOOT.site?.lessons || [])
  .filter((lesson) => lesson.active)
  .map((lesson) => ({
    id: lesson.id,
    slug: lesson.id,
    name: lesson.name,
    description: "",
    duration_minutes: lesson.durationMinutes,
    price_cents: lesson.priceCents,
    first_lesson_only: Number(lesson.firstLessonOnly),
    can_repeat: Number(lesson.canRepeat),
    student_price_applies: Number(!lesson.firstLessonOnly),
  }));
export const lessonProducts = staticLessonTypes.map((lesson) => ({
  id: lesson.id,
  title: lesson.name,
  durationMinutes: lesson.duration_minutes,
  priceCents: lesson.price_cents,
  firstOnly: Boolean(lesson.first_lesson_only),
  repeat: Boolean(lesson.can_repeat),
}));
