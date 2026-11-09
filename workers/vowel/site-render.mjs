import palettes from "./palettes.json" with { type: "json" };
import { escapeHtml as e, safeJson } from "./security.mjs";
import { tutorRecord, siteAddress } from "./model.mjs";

export function paletteStyle(id) {
  const palette = palettes[id] || palettes.porto;
  return Object.entries(palette)
    .filter(([, value]) => typeof value === "string" && value.startsWith("#"))
    .map(
      ([key, value]) =>
        `--${key.replace(/[A-Z0-9]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`,
    )
    .join(";");
}
const money = (site, cents) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: site.place.currency,
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
export function ruleSentences(site) {
  const r = site.rules;
  return [
    `Book at least ${r.noticeHours} hours ahead, up to ${r.horizonDays} days in advance.`,
    `Moving or cancelling is free with at least ${r.noticeHours} hours' notice. ${r.lateFeeCents ? `After that, the fee is ${money(site, r.lateFeeCents)}, up to the lesson price, once per lesson.` : "There is no late change fee."}`,
    r.noShow === "full"
      ? "A missed lesson costs its agreed lesson price."
      : r.noShow === "fixed"
        ? `A missed lesson costs ${money(site, r.noShowCents)}, up to the agreed lesson price.`
        : "There is no charge for a missed lesson.",
    r.paymentMode === "manual"
      ? "Pay your tutor directly, using the method you agree together."
      : r.paymentMode === "both"
        ? "Choose to pay your tutor directly or save a card to be charged when each lesson ends."
        : "Save a card when you book. The lesson is charged when it ends; any agreed late change fee is charged when the change is made.",
    "Each booking keeps the rules and price agreed when it was made. A new price for a weekly run needs your agreement.",
  ];
}
function basics(site, base, preview, platformOrigin) {
  const name = e(site.shortName || site.name || "Your name");
  const language = e(site.language.name || "Your language");
  const title = e(
    site.content.hero.title ||
      `${site.language.name || "Languages"} with ${site.shortName || site.name || "you"}`,
  );
  const line = e(
    site.content.hero.line || "Your lessons. Your way of teaching.",
  );
  const brand = e(
    site.brand ||
      `${site.language.name || "Languages"} with ${site.shortName || site.name || "you"}`,
  );
  const book = `${base}/book/`,
    approach = `${base}/approach/`,
    lessons = `${base}/lessons/`,
    faq = `${base}/faq/`;
  const btn = (label = "Book a lesson", extra = "") =>
    `<a class="btn ${extra}" href="${e(book)}">${e(label)}</a>`;
  const nav = `<nav aria-label="Tutor pages"><a href="${e(approach)}">How I teach</a><a href="${e(lessons)}">Lessons</a><a href="${e(faq)}">Questions</a></nav>`;
  const mobile = `<details class="vowel-site-menu"><summary>Menu</summary>${nav}<a href="${e(book)}?view=lessons">Your lessons</a></details>`;
  const location = e(
    [
      site.rules.inPerson ? site.place.city : "",
      site.rules.online ? "online" : "",
    ]
      .filter(Boolean)
      .join(" and "),
  );
  const principles = site.content.principles.filter((p) => p.title && p.body);
  const prices = site.lessons
    .filter((l) => l.active)
    .map((l) => ({
      id: l.id,
      name: e(l.name),
      length: `${l.durationMinutes} minutes`,
      price: l.priceCents ? e(money(site, l.priceCents)) : "Free",
    }));
  const portrait = site.photo
    ? `<img class="vowel-tutor-photo" src="${e(site.photo.asset)}" alt="${e(site.photo.alt)}" loading="lazy" width="400" height="500">`
    : "";
  const about = `<section class="wrap vowel-site-about" id="about"><h2>${e(site.content.about.heading || `About ${site.shortName || site.name || "your tutor"}`)}</h2><div>${portrait}<p>${e(site.content.about.body || "Your own words about your teaching will appear here.").replaceAll("\n", "<br>")}</p></div></section>`;
  const card = `<div class="bk"><h3 class="bk-title">Find a time that suits you.</h3><p>See the available times on ${e(site.place.city || site.place.timeZone)}'s clock, or your own.</p><div class="bk-sum"><span>${prices[0] ? `${prices[0].length} · ${prices[0].price}` : "Choose a lesson"}</span>${btn()}</div></div>`;
  const footer = `<footer class="wrap vowel-site-footer"><span>${brand}</span><a href="${e(base)}/terms/">Terms</a><a href="${e(base)}/privacy/">Privacy</a><a href="${e(book)}?view=lessons">Your lessons</a><span class="colo">Site by <a href="${e(platformOrigin)}" aria-label="Vowel teaching platform">Vowel</a></span></footer>`;
  return {
    base,
    name,
    language,
    title,
    line,
    brand,
    book,
    approach,
    lessons,
    faq,
    btn,
    nav,
    mobile,
    location,
    principles,
    prices,
    about,
    card,
    footer,
    preview,
  };
}
const splat = `<svg viewBox="0 0 200 200" aria-hidden="true"><path fill="var(--pop)" d="M39 33C65 0 83 28 106 16s35-2 41 22 39 16 35 43 22 45-10 61-18 42-50 35-56 28-72-4S5 148 21 119-6 91 18 73 19 57 39 33Z"/><path fill="var(--pop-2)" d="M151 12c28-18 48 21 22 34s-43-23-22-34Z"/></svg>`;
function home(site, b) {
  const {
    name,
    language,
    title,
    line,
    brand,
    btn,
    nav,
    mobile,
    location,
    prices,
    principles,
    about,
    card,
    footer,
  } = b;
  const head = (cls, word = brand) =>
    `<header class="wrap ${cls}"><a class="vowel-site-brand" href="${e(b.base)}/">${word}</a>${nav}${btn()}${mobile}</header>`;
  const priceCards = (outer, item) =>
    `<section class="wrap ${outer}"><h2>Lessons and prices</h2><div class="vowel-site-price-grid">${prices.map((p) => `<div class="${item}"><span>${p.name}</span><strong>${p.price}</strong><span>${p.length}</span><a class="btn" href="${e(b.book)}?lesson=${encodeURIComponent(p.id)}">Choose a time</a></div>`).join("")}</div></section>`;
  const three = (outer, item) =>
    principles.length
      ? `<section class="wrap ${outer}">${principles.map((p, i) => `<div class="${item}"><span class="vowel-site-number">0${i + 1}</span><h3>${e(p.title)}</h3><p>${e(p.body)}</p></div>`).join("")}</section>`
      : "";
  const booking = (cls) =>
    `<section class="wrap ${cls}"><div><h2>Your next lesson</h2><p>${e(ruleSentences(site)[1])}</p></div>${card}</section>`;
  switch (site.look.layout) {
    case "atelier":
      return `${head("a-head", `<span class="a-word">${brand}</span>`)}<section class="a-hero"><div class="a-splat">${splat}</div><div class="wrap a-hero-in"><h1>${title}</h1><p>${line}</p><div class="a-acts">${btn()}<a class="btn ghost" href="${e(b.approach)}">How I teach</a></div></div></section>${three("a-princ", "a-p")}${about}${priceCards("a-prices", "a-card")}${booking("a-book")}${footer}`;
    case "lexicon":
      return `${head("l-run", `<span class="l-who">${brand}<i>${language} · ${location}</i></span>`)}<section class="wrap l-entry"><div><p class="l-guide">A place for language</p><h1 class="l-hw">${language}<sup>1</sup></h1><p class="l-pron"><i>A language. A conversation. A new beginning.</i></p><ol class="l-senses"><li><b>1</b><span>${title}</span></li><li><b>2</b><span>${line}</span></li></ol><div class="l-xref">${btn()}</div></div><aside class="l-use"><span class="l-lab">In your own words</span><p>${e(site.content.feature || site.content.about.body.slice(0, 220) || site.language.phrases.hello)}</p></aside></section>${three("l-words", "l-word")}${about}${priceCards("l-tarif", "l-fee")}${booking("l-book")}${footer}`;
    case "grid":
      return `${head("g-head")}<section class="wrap g-hero"><p class="g-kicker">${language} / ${location}</p><h1 class="g-title">${title}</h1><div class="g-row"><div class="g-lede"><p class="g-l1">${line}</p>${btn()}</div><aside class="g-table"><span>01 / In use</span><table><tbody><tr><th>Your teacher</th><td>${name}</td></tr><tr><th>Your language</th><td>${language}</td></tr><tr><th>Your place</th><td>${location}</td></tr></tbody></table></aside></div></section>${three("g-three", "g-p")}${about}${priceCards("g-prices", "g-price")}${booking("g-sec")}${footer}`;
    case "postcard":
      return `${head("p-head", `<span class="p-logo">${language}<small>with ${name}</small></span>`)}<section class="wrap p-hero"><div class="p-card"><div class="p-in"><div class="p-front"><span class="p-greet">${e(site.language.phrases.hello || "Hello")}</span><h1 class="p-city">${language}</h1><p class="p-line">${line}</p></div><div class="p-back"><div class="vowel-post-stamp">${prices[0]?.price || "Hello"}<small>${prices[0]?.length || "Your first lesson"}</small></div><h2>${title}</h2><p>${location}</p>${btn()}</div></div></div></section>${three("p-three", "p-note")}${about}${priceCards("p-prices", "p-stamp")}${booking("p-book")}${footer}`;
    case "play":
      return `${head("k-head")}<section class="wrap k-hero"><div class="k-copy"><p class="k-eye">${language} · ${location}</p><h1>${title}</h1><p class="k-line">${line}</p>${btn("Let's begin")}</div><div class="vowel-flashcards" aria-hidden="true"><span>${e(site.language.phrases.hello || "Hello")}</span><span>${language}</span><span>${name}</span></div></section>${three("k-three", "k-card")}${about}${priceCards("k-prices", "k-price")}${booking("k-book")}${footer}`;
    case "still":
      return `${head("z-head", `<span class="z-seal">${name.slice(0, 1)}</span><span>${brand}</span>`)}<section class="wrap z-hero"><div><p class="z-eyebrow">${language} · ${location}</p><h1 class="z-title">${title}</h1><p class="z-line">${line}</p>${btn()}</div><div class="vowel-manuscript" aria-hidden="true"><span>${e(site.language.phrases.hello || "Hello")}</span></div></section>${three("z-three", "z-note")}${about}${priceCards("z-prices", "z-fee")}${booking("z-book")}${footer}`;
    case "scholar":
      return `${head("o-head")}<section class="wrap o-hero"><p class="o-kicker">Private lessons / ${location}</p><h1 class="o-title">${title}</h1><p class="o-deck">${line}</p><p class="o-by">with ${name}</p>${btn()}<div class="vowel-contents"><span>Contents</span><a href="${e(b.approach)}">I. How I teach</a><a href="${e(b.lessons)}">II. Lessons and prices</a><a href="${e(b.faq)}">III. Your questions</a></div></section>${three("o-three", "o-chapter")}${about}${priceCards("o-prices", "o-price")}${booking("o-book")}${footer}`;
    case "poster":
      return `${head("x-head")}<section class="wrap x-hero"><p class="x-kicker">${location} / one to one</p><h1 class="vowel-poster-title"><span>${language}</span><span>WITH</span><span>${name}</span></h1><div class="x-under"><p>${line}</p>${btn()}</div></section>${three("x-three", "x-panel")}${about}${priceCards("x-prices", "x-price")}${booking("x-book")}${footer}`;
    case "garden":
      return `${head("w-head")}<section class="wrap w-hero"><div class="w-copy"><p class="w-eyebrow">${language} · ${location}</p><h1>${title}</h1><p>${line}</p>${btn()}</div><div class="vowel-garden" aria-hidden="true"><span>${e(site.language.phrases.hello || "Hello")}</span><svg viewBox="0 0 200 250"><path d="M100 250V40M100 200Q20 200 30 120Q100 110 100 200M100 140Q180 145 170 70Q100 70 100 140" fill="var(--brand)"/><circle cx="100" cy="43" r="30" fill="var(--pop)"/><circle cx="100" cy="43" r="12" fill="var(--pop-2)"/></svg></div></section>${three("w-three", "w-card")}${about}${priceCards("w-prices", "w-price")}${booking("w-book")}${footer}`;
    default:
      return `${head("r-head")}<section class="wrap r-hero"><div class="r-copy"><p class="r-eyebrow">${language} · ${location}</p><h1>${title}</h1><p class="r-line">${line}</p>${btn()}<p class="vowel-tutor-signature">${name}</p></div>${site.photo ? `<figure class="r-photo"><img src="${e(site.photo.asset)}" alt="${e(site.photo.alt)}" width="400" height="500"><figcaption>${e(site.language.phrases.hello || "Hello")}</figcaption></figure>` : `<div class="vowel-letter-portrait" aria-hidden="true"><span>${e((site.shortName || site.name || "Y").slice(0, 1))}</span><i>${e(site.language.phrases.hello || "Hello")}</i></div>`}</section>${three("r-three", "r-point")}${about}${priceCards("r-prices", "r-price")}${booking("r-book")}${footer}`;
  }
}
export function siteMarkup(
  site,
  base = "",
  page = "home",
  preview = false,
  platformOrigin = "/",
) {
  const b = basics(site, base, preview, platformOrigin);
  let inside;
  if (page === "home") {
    const full = home(site, b),
      headEnd = full.indexOf("</header>") + 9,
      footStart = full.lastIndexOf("<footer");
    inside =
      full.slice(0, headEnd) +
      "<main>" +
      full.slice(headEnd, footStart) +
      "</main>" +
      full.slice(footStart);
  } else {
    const header = `<header class="wrap vowel-site-inner-head"><a href="${e(base)}/">${b.brand}</a>${b.nav}${b.mobile}${b.btn()}</header>`;
    const title =
      {
        approach: "How I teach",
        lessons: "Lessons and prices",
        faq: "Your questions",
        terms: "Booking terms",
        privacy: "Your privacy",
      }[page] || "Your lessons";
    let content =
      page === "approach"
        ? `${b.about}${site.content.principles.map((p) => `<section><h2>${e(p.title)}</h2><p>${e(p.body)}</p></section>`).join("")}`
        : page === "lessons"
          ? `<div class="vowel-site-price-grid">${b.prices.map((p) => `<article><h2>${p.name}</h2><strong>${p.price}</strong><p>${p.length}</p>${b.btn()}</article>`).join("")}</div><p>${e(ruleSentences(site)[3])}</p>`
          : page === "faq"
            ? site.content.faq.length
              ? site.content.faq
                  .map(
                    (f) =>
                      `<details><summary>${e(f.q)}</summary><p>${e(f.a)}</p></details>`,
                  )
                  .join("")
              : ruleSentences(site)
                  .map((s) => `<p>${e(s)}</p>`)
                  .join("")
            : page === "terms"
              ? `<p>Your lessons are supplied by ${e(site.name)}.</p>${ruleSentences(
                  site,
                )
                  .map((s) => `<p>${e(s)}</p>`)
                  .join(
                    "",
                  )}<p>Booking times are shown with a time zone. Your tutor can help with an exceptional change. Statutory rights are unaffected by these booking rules.</p>`
              : `<p>${e(site.name)} uses Vowel to manage teaching records, bookings and homework. Vowel runs the software on Cloudflare. Transactional email is sent through Resend. If you choose card payments, Stripe handles your card; Vowel never stores card numbers.</p><p>Homework is shared with an AI provider only when your tutor enables that feature. Your tutor reviews drafts and marking suggestions before sharing them with you. Lesson notes stay private to your tutor.</p><p>Ask your tutor about access, corrections or removal of your records. Sign-in and booking records are used to run the service. This site does not use advertising trackers.</p>`;
    inside = `${header}<main class="wrap vowel-site-inner"><h1>${title}</h1>${content}${b.btn()}</main>${b.footer}`;
  }
  return `<div class="site" data-pal="${e(site.look.palette)}" style="${paletteStyle(site.look.palette)}"><div class="s t-${e(site.look.layout)}">${inside}</div></div>`;
}
export function documentShell({
  title,
  description = "",
  content,
  boot = null,
  script = "",
  css = "/assets/platform.css",
  canonical = "",
  privatePage = false,
}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${e(title)}</title><meta name="description" content="${e(description)}">${privatePage ? '<meta name="robots" content="noindex,nofollow">' : ""}${canonical ? `<link rel="canonical" href="${e(canonical)}">` : ""}<link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="${e(css)}"></head><body>${content}${boot ? `<script id="vowel-boot" type="application/json">${safeJson(boot)}</script>` : ""}${script ? `<script type="module" src="${e(script)}"></script>` : ""}</body></html>`;
}
export function renderTutor(
  site,
  env,
  origin,
  base,
  page = "home",
  preview = false,
) {
  return documentShell({
    title: `${site.brand || `${site.language.name} with ${site.name}`} · ${page === "home" ? "Language lessons" : page}`,
    description: site.content.hero.line,
    content: siteMarkup(site, base, page, preview, env.VOWEL_ORIGIN || origin),
    css: "/assets/teaching.css",
    canonical: preview
      ? ""
      : `${siteAddress(site, env, origin)}${page === "home" ? "/" : `/${page}/`}`,
    privatePage: preview,
  });
}
export function teachingShell(site, env, origin, base, page) {
  const record = tutorRecord(site, env, origin);
  const boot = {
    siteId: site.id,
    tutor: record,
    site,
    basePath: base,
    apiBase: `${origin}/api/tutor/${site.id}`,
    page,
    googleClientId: env.GOOGLE_CLIENT_ID || "",
    stripePublishableKey: env.VOWEL_STRIPE_PUBLISHABLE_KEY || "",
    stripeMode: env.VOWEL_STRIPE_EXPECTED_MODE || "test",
    platformOrigin: env.VOWEL_ORIGIN || origin,
  };
  return documentShell({
    title: `${page === "schedule" ? "Teaching" : "Your lessons"} · ${record.brand}`,
    content: `<div id="vowel-teaching" class="site" data-pal="${e(site.look.palette)}" style="${paletteStyle(site.look.palette)}"><p role="status">Opening your lessons…</p></div>`,
    boot,
    script: "/assets/teaching.js",
    css: "/assets/teaching.css",
    privatePage: true,
  });
}
