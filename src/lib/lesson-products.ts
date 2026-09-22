export type LessonProduct = {
  id: "trial" | "single" | "long";
  title: string;
  price: string;
  duration: string;
  description: string;
  /** What the card's button says; it opens booking with this lesson chosen. */
  bookingLabel: string;
  /** The same two numbers the Worker's lesson_types table holds. */
  durationMinutes: number;
  priceCents: number;
};

/**
 * Approved editorial product copy for the lessons page.
 *
 * One entry per bookable lesson, matching the booking Worker's `lesson_types`
 * table — ids included. Single lessons used to be one entry carrying two
 * prices, which made the two columns impossible to compare and did not line up
 * with what a student actually picks on /book. Keep the two in step: this copy
 * is what a visitor reads, that table is what they can book.
 */
export const lessonProducts: LessonProduct[] = [
  {
    id: "trial",
    durationMinutes: 60,
    priceCents: 2000,
    title: "Trial lesson",
    price: "\u20ac20",
    duration: "60 minutes",
    description: "We find out where your Portuguese is and what you want to do with it.",
    bookingLabel: "Book a trial lesson"
  },
  {
    id: "single",
    durationMinutes: 60,
    priceCents: 2500,
    title: "Single lesson",
    price: "\u20ac25",
    duration: "60 minutes",
    description: "Book one at a time, or keep the same slot each week.",
    bookingLabel: "Book a single lesson"
  },
  {
    id: "long",
    durationMinutes: 90,
    priceCents: 3500,
    title: "Longer lesson",
    price: "\u20ac35",
    duration: "90 minutes",
    description: "An hour and a half, if you want more time to talk.",
    bookingLabel: "Book a longer lesson"
  }
];

/**
 * The same lessons in the shape the booking API returns them.
 *
 * Used to draw the first step in the static HTML, so the three cards are on
 * screen at first paint rather than after the whole bundle has hydrated and a
 * round trip has come back — which on a slow phone was four seconds of an empty
 * panel. The API answer replaces this the moment it lands, so the live table
 * still has the last word on names and prices.
 */
export const staticLessonTypes = lessonProducts.map((product) => ({
  id: product.id,
  slug: product.id,
  name: product.title,
  description: product.description,
  duration_minutes: product.durationMinutes,
  price_cents: product.priceCents
}));

export const trialLesson = lessonProducts[0];
