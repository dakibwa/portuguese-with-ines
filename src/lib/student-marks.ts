/**
 * The splats a student can wear beside their name: the site's own marks, all
 * but the FAQ's, which reads as a question. The Worker accepts the same ids
 * (STUDENT_MARKS in workers/booking/index.mjs); an empty one is the initial.
 */
export const STUDENT_MARKS = [
  { id: "burst", label: "Burst", src: "/visuals/v2-splats/booking-availability-splat-v2.svg" },
  { id: "bloom", label: "Bloom", src: "/visuals/v2-splats/built-around-you-splat-v2.svg" },
  { id: "pool", label: "Pool", src: "/visuals/v2-splats/european-portuguese-splat-v2.svg" },
  { id: "dance", label: "Dance", src: "/visuals/v2-splats/flexible-rescheduling-splat-v2.svg" },
  { id: "drift", label: "Drift", src: "/visuals/v2-splats/in-porto-or-online-splat-v2.svg" },
  { id: "four", label: "Four", src: "/visuals/v2-splats/lesson-format-splat-v2.svg" },
  { id: "duo", label: "Duo", src: "/visuals/v2-splats/one-to-one-splat-v2.svg" },
  { id: "scatter", label: "Scatter", src: "/visuals/v2-splats/real-life-splat-v2.svg" }
] as const;

export function studentMark(id: string | undefined) {
  return STUDENT_MARKS.find((mark) => mark.id === id) ?? null;
}
