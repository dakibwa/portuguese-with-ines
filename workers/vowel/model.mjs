import { problem } from "./security.mjs";

export const PLATFORM = {
  name: "Vowel",
  priceCents: 2500,
  currency: "eur",
  trialDays: 30,
};
export const LAYOUTS = [
  "atelier",
  "lexicon",
  "grid",
  "postcard",
  "play",
  "still",
  "scholar",
  "poster",
  "portrait",
  "garden",
];
export const PALETTES = [
  "porto",
  "plum",
  "newsprint",
  "riviera",
  "sherbet",
  "matcha",
  "oxford",
  "signal",
  "midnight",
  "eucalyptus",
];
const RESERVED = new Set([
  "www",
  "app",
  "api",
  "admin",
  "dashboard",
  "support",
  "help",
  "mail",
  "vowel",
  "ines",
  "portuguesewithines",
  "billing",
  "auth",
  "assets",
  "status",
  "test",
  "demo",
  "null",
  "undefined",
  "fuck",
  "shit",
  "porn",
  "sex",
  "nazi",
]);
const text = (value, max = 200) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
function number(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw problem(`Choose ${label} between ${min} and ${max}.`);
  return value;
}
export function slugOf(value) {
  const slug = text(value, 40).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) || RESERVED.has(slug))
    throw problem(
      "Choose an address of 3–40 letters, numbers or dashes, starting with a letter.",
    );
  return slug;
}
export function siteAddress(site, env, origin) {
  const domain = String(env.VOWEL_BASE_DOMAIN ?? "")
    .trim()
    .toLowerCase();
  return domain ? `https://${site.slug}.${domain}` : `${origin}/t/${site.id}`;
}
export function newSite(user, id, now = Date.now()) {
  return {
    id,
    ownerId: user.id,
    slug: `teacher-${id.slice(0, 8)}`,
    state: "draft",
    version: 1,
    step: 0,
    createdAt: now,
    publishedAt: null,
    trialEndsAt: null,
    billing: "not_started",
    stripeAccount: null,
    name: user.name || "",
    shortName: user.name?.split(" ")[0] || "",
    brand: "",
    language: {
      name: "English",
      variety: "English",
      code: "en",
      phrases: { hello: "Hello", goodbye: "See you soon" },
    },
    place: {
      city: "",
      timeZone: "Europe/London",
      country: "GB",
      currency: "GBP",
      inPersonKey: "porto",
    },
    pronouns: { subject: "they", object: "them", possessive: "their" },
    look: { layout: "portrait", palette: "eucalyptus" },
    photo: null,
    source: "",
    content: {
      hero: { title: "", line: "" },
      principles: [],
      about: { heading: "A little about me", body: "" },
      faq: [],
      reviewed: false,
    },
    lessons: [
      {
        id: "trial",
        name: "Trial lesson",
        durationMinutes: 30,
        priceCents: 1500,
        active: true,
        firstLessonOnly: true,
        canRepeat: false,
      },
      {
        id: "single",
        name: "Lesson",
        durationMinutes: 60,
        priceCents: 2500,
        active: true,
        firstLessonOnly: false,
        canRepeat: true,
      },
      {
        id: "long",
        name: "Longer lesson",
        durationMinutes: 90,
        priceCents: 3500,
        active: true,
        firstLessonOnly: false,
        canRepeat: true,
      },
    ],
    hours: [],
    rules: {
      noticeHours: 24,
      horizonDays: 84,
      intervalMinutes: 15,
      bufferMinutes: 15,
      lateFeeCents: 0,
      noShow: "none",
      noShowCents: 0,
      paymentMode: "manual",
      online: true,
      inPerson: false,
    },
    features: { homework: false, curriculum: false, expressions: false },
    contact: { whatsapp: "" },
  };
}
export function updateSite(site, patch) {
  const next = structuredClone(site);
  for (const [key, length] of [
    ["name", 100],
    ["shortName", 60],
    ["brand", 120],
    ["source", 12000],
  ])
    if (key in patch) next[key] = text(patch[key], length);
  if (patch.slug !== undefined) next.slug = slugOf(patch.slug);
  if (patch.step !== undefined) next.step = number(patch.step, 0, 11, "a step");
  if (patch.language) {
    for (const key of ["name", "variety", "code"])
      if (key in patch.language)
        next.language[key] = text(patch.language[key], 100);
    if (patch.language.phrases)
      for (const key of ["hello", "goodbye"])
        if (key in patch.language.phrases)
          next.language.phrases[key] = text(patch.language.phrases[key], 60);
  }
  if (patch.place) {
    for (const key of ["city", "timeZone", "country", "currency"])
      if (key in patch.place) next.place[key] = text(patch.place[key], 80);
    try {
      new Intl.DateTimeFormat("en", { timeZone: next.place.timeZone }).format();
    } catch {
      throw problem("Choose your time zone from the list.");
    }
    if (
      !/^[A-Z]{2}$/.test(next.place.country) ||
      !/^[A-Z]{3}$/.test(next.place.currency)
    )
      throw problem("Choose a country and currency.");
    // The booking engine's current cents contract supports two-decimal currencies.
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: next.place.currency,
    }).resolvedOptions().maximumFractionDigits;
    if (digits !== 2)
      throw problem(
        "This first version supports currencies with two decimal places. Choose a supported currency.",
      );
    if (
      site.publishedAt &&
      (next.place.currency !== site.place.currency ||
        next.place.timeZone !== site.place.timeZone)
    )
      throw problem(
        "Your currency and time zone are fixed after launch to protect existing bookings.",
        409,
      );
  }
  if (patch.look) {
    if (patch.look.layout && !LAYOUTS.includes(patch.look.layout))
      throw problem("Choose one of the ten layouts.");
    if (patch.look.palette && !PALETTES.includes(patch.look.palette))
      throw problem("Choose one of the ten colour sets.");
    next.look = {
      ...next.look,
      ...Object.fromEntries(
        ["layout", "palette"]
          .filter((key) => patch.look[key])
          .map((key) => [key, patch.look[key]]),
      ),
    };
  }
  if (patch.contact)
    next.contact = {
      whatsapp: text(patch.contact.whatsapp, 30).replace(/[^+\d\s()-]/g, ""),
    };
  if (patch.content) {
    const c = patch.content;
    if (c.hero)
      next.content.hero = {
        title: text(c.hero.title, 160),
        line: text(c.hero.line, 500),
      };
    if (c.about)
      next.content.about = {
        heading: text(c.about.heading, 120),
        body: text(c.about.body, 8000),
      };
    if (Array.isArray(c.principles))
      next.content.principles = c.principles
        .slice(0, 3)
        .map((p) => ({ title: text(p.title, 80), body: text(p.body, 500) }));
    if (Array.isArray(c.faq))
      next.content.faq = c.faq
        .slice(0, 15)
        .map((f) => ({ q: text(f.q, 250), a: text(f.a, 1500) }));
    if ("feature" in c) next.content.feature = text(c.feature, 300);
    if (typeof c.reviewed === "boolean") next.content.reviewed = c.reviewed;
  }
  if (patch.lessons) {
    if (
      !Array.isArray(patch.lessons) ||
      patch.lessons.length < 1 ||
      patch.lessons.length > 6
    )
      throw problem("Add between one and six lesson types.");
    const ids = new Set();
    next.lessons = patch.lessons.map((l, i) => {
      const id = text(l.id || `lesson-${i}`, 40);
      if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id))
        throw problem("Each lesson needs a different reference.");
      ids.add(id);
      const priceCents = number(l.priceCents, 0, 1000000, "a price in cents");
      if (priceCents > 0 && priceCents < 50)
        throw problem("A paid lesson must cost at least 0.50.");
      return {
        id,
        name: text(l.name, 100) || "Lesson",
        durationMinutes: number(l.durationMinutes, 15, 240, "minutes"),
        priceCents,
        active: l.active !== false,
        firstLessonOnly: l.firstLessonOnly === true,
        canRepeat: l.canRepeat !== false && !l.firstLessonOnly,
      };
    });
    if (
      next.lessons.filter((lesson) => lesson.firstLessonOnly && lesson.active)
        .length > 1
    )
      throw problem(
        "Choose one introductory lesson type. Other lessons can be booked again.",
      );
  }
  if (patch.hours) {
    if (!Array.isArray(patch.hours) || patch.hours.length > 28)
      throw problem("Choose your weekly teaching hours.");
    next.hours = patch.hours.map((h) => ({
      weekday: number(h.weekday, 0, 6, "a weekday"),
      startMinute: number(h.startMinute, 0, 1439, "a start minute"),
      endMinute: number(h.endMinute, 1, 1440, "an end minute"),
    }));
    for (const h of next.hours)
      if (h.endMinute <= h.startMinute)
        throw problem("Your finish time must be after your start time.");
    for (const h of next.hours)
      if (
        next.hours.some(
          (other) =>
            other !== h &&
            other.weekday === h.weekday &&
            other.startMinute < h.endMinute &&
            other.endMinute > h.startMinute,
        )
      )
        throw problem("Those teaching hours overlap.");
  }
  if (patch.rules) {
    const r = patch.rules;
    for (const [key, min, max] of [
      ["noticeHours", 0, 72],
      ["horizonDays", 7, 365],
      ["intervalMinutes", 5, 60],
      ["bufferMinutes", 0, 120],
      ["lateFeeCents", 0, 1000000],
      ["noShowCents", 0, 1000000],
    ])
      if (key in r)
        next.rules[key] = number(
          r[key],
          min,
          max,
          key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
        );
    if (r.noShow && !["none", "fixed", "full"].includes(r.noShow))
      throw problem(
        "Choose no charge, a fixed fee or the lesson price for a missed lesson.",
      );
    if (r.paymentMode && !["manual", "card", "both"].includes(r.paymentMode))
      throw problem("Choose how students pay you.");
    for (const key of ["noShow", "paymentMode"])
      if (r[key]) next.rules[key] = r[key];
    for (const key of ["online", "inPerson"])
      if (typeof r[key] === "boolean") next.rules[key] = r[key];
    if (!next.rules.online && !next.rules.inPerson)
      throw problem("Offer online lessons, in-person lessons, or both.");
    for (const key of ["lateFeeCents", "noShowCents"])
      if (next.rules[key] > 0 && next.rules[key] < 50)
        throw problem("A card fee must be zero or at least 0.50.");
    const prices = next.lessons
      .filter((l) => l.active && l.priceCents > 0)
      .map((l) => l.priceCents);
    if (
      prices.length &&
      (next.rules.lateFeeCents > Math.min(...prices) ||
        next.rules.noShowCents > Math.min(...prices))
    )
      throw problem("A fee cannot exceed your cheapest paid lesson.");
  }
  if (patch.features)
    for (const key of ["homework", "curriculum"])
      if (typeof patch.features[key] === "boolean")
        next.features[key] = patch.features[key];
  return next;
}
export function launchProblems(site) {
  const errors = [];
  if (!site.name || !site.language.name)
    errors.push("Add your name and the language you teach.");
  if (!site.content.about.body || !site.content.reviewed)
    errors.push("Read and approve your page wording.");
  if (!site.lessons.some((l) => l.active))
    errors.push("Offer at least one lesson.");
  if (!site.hours.length) errors.push("Choose some teaching hours.");
  return errors;
}
export function tutorRecord(site, env, origin) {
  const url = siteAddress(site, env, origin);
  return {
    id: site.id,
    database: "DB",
    name: site.name,
    shortName: site.shortName || site.name.split(" ")[0],
    brand:
      site.brand || `${site.language.name} with ${site.shortName || site.name}`,
    brandPlain: site.brand || site.name,
    language: {
      ...site.language,
      aiStyle: `Teach ${site.language.variety || site.language.name}. Use the student's stated level.`,
      aiMarkingStyle: `Preserve the spelling and vocabulary of ${site.language.variety || site.language.name}.`,
    },
    pronouns: site.pronouns,
    place: site.place,
    look: site.look,
    contact: site.contact,
    site: {
      url,
      domain: new URL(url).host,
      origins: [new URL(url).origin],
      mailFrom: `${(site.brand || site.name).replace(/[\r\n<>"\\]/g, " ")} <${env.VOWEL_MAIL_SENDER || ""}>`,
      mailSender: env.VOWEL_MAIL_SENDER || "",
    },
    bookings: {
      referencePrefix: "VL",
      calendarUidDomain: `${site.id}.vowel.invalid`,
    },
    defaults: {
      noticeHours: site.rules.noticeHours,
      bookingHorizonDays: site.rules.horizonDays,
      lateChangeFeeCents: site.rules.lateFeeCents,
    },
    features: { ...site.features, expressions: false },
    platform: true,
  };
}
