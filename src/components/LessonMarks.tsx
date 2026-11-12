import { AssetMark } from "@/components/BrandMarks";

/**
 * Marks used by the booking flow.
 *
 * The lesson emblems are the production splat SVGs already shipping in
 * `public/visuals/v2-splats/` — the brand's own square marks — rather than
 * anything drawn here. Booked cards deliberately use several of the brand's
 * shapes so the small mark carries information instead of becoming a repeated
 * decorative stamp.
 */
const lessonSplats = {
  trial: "/visuals/v2-splats/built-around-you-splat-v2.svg",
  recurring: "/visuals/v2-splats/flexible-rescheduling-splat-v2.svg",
  "60-online": "/visuals/v2-splats/booking-availability-splat-v2.svg",
  "60-porto": "/visuals/v2-splats/one-to-one-splat-v2.svg",
  "90-online": "/visuals/v2-splats/real-life-splat-v2.svg",
  "90-porto": "/visuals/v2-splats/european-portuguese-splat-v2.svg"
} as const;

type LessonMarkProps = {
  lessonTypeId: string;
  className?: string;
  durationMinutes?: number;
  lands?: boolean;
  location?: "online" | "porto";
  recurring?: boolean;
};

export function lessonSplat({ lessonTypeId, durationMinutes, location = "online", recurring = false }: LessonMarkProps) {
  if (lessonTypeId === "trial") return lessonSplats.trial;
  if (recurring) return lessonSplats.recurring;

  const duration = durationMinutes ?? (lessonTypeId === "long" ? 90 : 60);
  return lessonSplats[`${duration === 90 ? 90 : 60}-${location}`];
}

/**
 * Booked lessons get a genuinely useful little identity: length and place make
 * four distinct marks, with a fifth reserved for a repeating schedule. This
 * also retires the stacked-wave emblem that read rather unfortunately at the
 * small size used in lesson cards.
 */
export function LessonMark(props: LessonMarkProps) {
  return <AssetMark asset={lessonSplat(props)} className={props.className} lands={props.lands} />;
}
