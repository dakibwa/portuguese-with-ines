export type Lesson = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  firstLessonOnly: boolean;
  canRepeat: boolean;
};
export type Rules = {
  noticeHours: number;
  horizonDays: number;
  intervalMinutes: number;
  bufferMinutes: number;
  lateFeeCents: number;
  noShow: "none" | "fixed" | "full";
  noShowCents: number;
  paymentMode: "manual" | "card" | "both";
  online: boolean;
  inPerson: boolean;
};
export type Site = {
  id: string;
  ownerId: string;
  slug: string;
  state: "draft" | "live" | "taken_down";
  version: number;
  step: number;
  name: string;
  shortName: string;
  brand: string;
  source: string;
  createdAt: number;
  publishedAt: number | null;
  trialEndsAt: number | null;
  billing: string;
  cancelAtPeriodEnd?: boolean;
  stripeAccount: string | null;
  stripeSubscription?: string | null;
  stripeReady?: boolean;
  language: {
    name: string;
    variety: string;
    code: string;
    phrases: { hello: string; goodbye: string };
  };
  place: {
    city: string;
    timeZone: string;
    country: string;
    currency: string;
    inPersonKey: string;
  };
  pronouns: { subject: string; object: string; possessive: string };
  look: { layout: string; palette: string };
  photo: { asset: string; alt: string } | null;
  content: {
    hero: { title: string; line: string };
    principles: { title: string; body: string }[];
    about: { heading: string; body: string };
    faq: { q: string; a: string }[];
    reviewed: boolean;
    feature?: string;
  };
  lessons: Lesson[];
  hours: { weekday: number; startMinute: number; endMinute: number }[];
  rules: Rules;
  features: { homework: boolean; curriculum: boolean; expressions: boolean };
  contact: { whatsapp: string };
};
export type Tutor = {
  id: string;
  name: string;
  shortName: string;
  brand: string;
  brandPlain: string;
  pronouns: Site["pronouns"];
  language: Site["language"] & { aiStyle?: string; aiMarkingStyle?: string };
  place: Site["place"];
  contact: { whatsapp: string };
  features: { expressions: boolean; homework?: boolean; curriculum?: boolean };
  site: { url: string; domain: string; mailFrom: string; mailSender: string };
  bookings: { referencePrefix: string; calendarUidDomain: string };
  defaults: {
    noticeHours: number;
    lateChangeFeeCents: number;
    bookingHorizonDays: number;
  };
  platform?: boolean;
};
export type Boot = {
  page: string;
  origin?: string;
  baseDomain?: string;
  googleClientId: string;
  signupEnabled?: boolean;
  siteId?: string;
  tutor?: Tutor;
  site?: Site;
  basePath?: string;
  apiBase?: string;
  stripePublishableKey?: string;
  stripeMode?: string;
  platformOrigin?: string;
};
export type User = { id: string; email: string; name: string };
export type Capabilities = {
  operator?: boolean;
  google: boolean;
  payments: boolean;
  ai: boolean;
  domains: boolean;
  baseDomain: string;
};
export type Me = {
  user: User | null;
  sites: Site[];
  capabilities: Capabilities;
};
