/** Legacy rows retain their meaning; platform rows carry explicit switches. */
export const firstLessonOnly = type => type?.first_lesson_only === undefined ? type?.id === "trial" : Boolean(type.first_lesson_only);
export const canRepeat = type => type?.can_repeat === undefined ? type?.id !== "trial" : Boolean(type.can_repeat);
export const studentPriceApplies = type => type?.student_price_applies === undefined ? type?.id !== "trial" : Boolean(type.student_price_applies);
