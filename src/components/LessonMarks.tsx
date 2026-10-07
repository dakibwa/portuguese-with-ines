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

/**
 * A hand-drawn rule between the step trail and the step itself, so the seam
 * carries the same drawn quality as the display type rather than a hairline.
 */
export function SquiggleRule({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 300 12" fill="none" preserveAspectRatio="none">
      <path
        d="M2 7c14-6 28 4 42-1s28 5 42 0 28 4 42-1 28 5 42 0 28 4 42-1 28 5 42 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
    </svg>
  );
}
