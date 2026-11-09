import { DurableObject } from "cloudflare:workers";
import bookingSchema from "../booking/schema.sql";
import directorySchema from "./directory-schema.sql";
import tutorSchema from "./tutor-schema.sql";
import { Directory } from "./directory.mjs";
import { TutorDatabase } from "./store.mjs";
import { json, problem } from "./security.mjs";
import { newSite, LAYOUTS } from "./model.mjs";
import { renderTutor, teachingShell, documentShell } from "./site-render.mjs";
import { platformPage } from "./platform-render.mjs";

export class TutorDirectory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.directory = new Directory(ctx, env, directorySchema);
  }
  fetch(request) {
    return this.directory.fetch(request);
  }
  getSite(id) {
    return this.directory.getSite(id);
  }
  publicSite(id) {
    return this.directory.publicSite(id);
  }
  accessibleSite(id, request) {
    return this.directory.accessibleSite(id, request);
  }
  lookupHost(host) {
    return this.directory.lookupHost(host);
  }
  ownedAccess(id, request) {
    return this.directory.ownedAccess(id, request);
  }
  webhook(request) {
    return this.directory.webhook(request);
  }
  photo(id, hash, request) {
    return this.directory.photo(id, hash, request);
  }
  alarm() {
    return this.directory.alarm();
  }
}
export class TutorStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.tutor = new TutorDatabase(ctx, env, bookingSchema, tutorSchema);
  }
  dispatch(request, site, origin) {
    return this.tutor.dispatch(request, site, origin);
  }
  teacherSession(site, user, origin) {
    return this.tutor.teacherSession(site, user, origin);
  }
  paymentEvent(request, site) {
    return this.tutor.paymentEvent(request, site);
  }
  prepareSite(site, user) {
    return this.tutor.seedTeacher(site, user);
  }
  siteRecord(site, origin) {
    return this.tutor.siteRecord(site, origin);
  }
  alarm() {
    return this.tutor.alarm();
  }
}
function secure(response, html = false) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (html) {
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://js.stripe.com https://connect-js.stripe.com https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.stripe.com https://*.googleusercontent.com; connect-src 'self' https://*.stripe.com https://accounts.google.com https://www.googleapis.com; frame-src 'self' https://*.stripe.com https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self' https://*.stripe.com; frame-ancestors 'self'",
    );
  }
  return new Response(response.body, { status: response.status, headers });
}
function example(layout) {
  const site = newSite({ id: "example", name: "Alex" }, "example");
  site.name = "Alex";
  site.shortName = "Alex";
  site.brand = "English with Alex";
  site.language = {
    name: "English",
    variety: "English",
    code: "en",
    phrases: { hello: "Hello", goodbye: "See you soon" },
  };
  site.place.city = "London";
  site.look.layout = layout;
  site.look.palette = {
    atelier: "porto",
    lexicon: "plum",
    grid: "newsprint",
    postcard: "riviera",
    play: "sherbet",
    still: "matcha",
    scholar: "oxford",
    poster: "signal",
    portrait: "midnight",
    garden: "eucalyptus",
  }[layout];
  site.content = {
    hero: {
      title: "A little more confidence. A lot more conversation.",
      line: "English for the life you want to live. One-to-one lessons, online or in London.",
    },
    about: {
      heading: "Hello, I'm Alex.",
      body: "This is an example of a tutor's site. Your own story and words will live here. There are no qualifications, student reviews or teaching claims invented for you.",
    },
    principles: [
      {
        title: "Start where you are",
        body: "Your own words about how you help a student begin.",
      },
      {
        title: "Make it useful",
        body: "The things your students want to do with their new language.",
      },
      {
        title: "Keep it yours",
        body: "The details that make your teaching your own.",
      },
    ],
    faq: [],
    reviewed: true,
  };
  return site;
}
const worker = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url),
        origin = url.origin;
      if (
        url.pathname.startsWith("/assets/") ||
        url.pathname.startsWith("/visuals/")
      )
        return secure(await env.ASSETS.fetch(request));
      if (url.pathname === "/health")
        return json({
          ok: true,
          service: "vowel",
          signups: env.VOWEL_SIGNUPS_ENABLED === "1",
          name: "Vowel",
        });
      if (!env.TUTOR_DIRECTORY || !env.TUTOR_STORES)
        throw problem("Vowel isn't configured yet.", 503);
      const directory = env.TUTOR_DIRECTORY.getByName("directory");
      const photo = /^\/media\/([a-f0-9-]{36})\/([a-f0-9]{64})$/.exec(
        url.pathname,
      );
      if (photo)
        return secure(await directory.photo(photo[1], photo[2], request));
      if (url.pathname === "/api/stripe/webhook")
        return secure(await directory.webhook(request));
      if (url.pathname.startsWith("/api/platform/")) {
        if (
          env.VOWEL_SIGNUPS_ENABLED !== "1" &&
          /\/auth\/(code|google)$/.test(url.pathname)
        )
          return json(
            {
              error: "Vowel is being prepared. Public sign-up isn't open yet.",
            },
            503,
          );
        return secure(await directory.fetch(request));
      }
      const api = /^\/api\/tutor\/([a-f0-9-]{36})(\/.*)?$/.exec(url.pathname);
      if (api) {
        // RPC transfers a Request's stream. Ownership needs its cookie only;
        // reserve the original body for the tutor's booking handler.
        const site = await directory.accessibleSite(
          api[1],
          new Request(request.url, { headers: request.headers }),
        );
        if (!site) throw problem("That teaching site was not found.", 404);
        const target = new URL(url);
        target.pathname = api[2] || "/";
        return secure(
          await env.TUTOR_STORES.getByName(site.id).dispatch(
            new Request(target, request),
            site,
            origin,
          ),
        );
      }
      const look =
        /^\/looks\/([a-z]+)(?:\/(approach|lessons|faq|terms|privacy|book))?\/?$/.exec(
          url.pathname,
        );
      if (look && LAYOUTS.includes(look[1])) {
        const sample = example(look[1]),
          base = `/looks/${look[1]}`;
        if (look[2] === "book")
          return secure(
            new Response(
              documentShell({
                title: "Example booking · Vowel",
                content:
                  '<main class="vo-wrap vo-prose"><p class="vo-eyebrow">An example site</p><h1>Your real diary goes here.</h1><p>Your own site uses your lesson prices and teaching hours. This preview takes no bookings.</p><a class="vo-button" href="/start/">Make your teaching site</a></main>',
                privatePage: true,
              }),
            ),
            true,
          );
        let html = renderTutor(
          sample,
          env,
          origin,
          base,
          look[2] || "home",
          true,
        );
        html = html.replace(
          "<body>",
          `<body><aside class="vo-preview-banner">Example tutor site · <a href="/#looks">Back to the ten looks</a> · <a href="/start/">Make it yours</a></aside>`,
        );
        return secure(new Response(html), true);
      }
      const pathTutor = /^\/t\/([a-f0-9-]{36})(?:\/(.*))?$/.exec(url.pathname);
      let site = pathTutor
        ? await directory.accessibleSite(pathTutor[1], request)
        : await directory.lookupHost(url.hostname);
      if (site && !pathTutor)
        site = await directory.accessibleSite(site.id, request);
      if (pathTutor && !site)
        throw problem("That teaching site was not found.", 404);
      if (site) {
        site = await env.TUTOR_STORES.getByName(site.id).siteRecord(
          site,
          origin,
        );
        const base = pathTutor ? `/t/${site.id}` : "",
          page =
            (pathTutor ? pathTutor[2] : url.pathname.slice(1))?.replace(
              /\/$/,
              "",
            ) || "home";
        if (
          [
            "book",
            "schedule",
            "my-lessons",
            "booking",
            "reset-password",
          ].includes(page)
        )
          return secure(
            new Response(teachingShell(site, env, origin, base, page)),
            true,
          );
        if (
          !["home", "approach", "lessons", "faq", "terms", "privacy"].includes(
            page,
          )
        )
          throw problem("That page was not found.", 404);
        return secure(
          new Response(
            renderTutor(site, env, origin, base, page, site.state !== "live"),
          ),
          true,
        );
      }
      const path = url.pathname.replace(/\/+$/, "") + "/";
      if (
        ["/", "/start/", "/dashboard/", "/privacy/", "/terms/"].includes(path)
      )
        return secure(new Response(platformPage(path, env, origin)), true);
      throw problem("That page was not found.", 404);
    } catch (error) {
      const status = error.status || 503;
      const message =
        status < 500
          ? error.message
          : "Vowel couldn't open that just now. Please try again.";
      return secure(json({ error: message }, status));
    }
  },
};
export default worker;
