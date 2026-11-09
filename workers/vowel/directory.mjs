import {
  body,
  checkOrigin,
  digest,
  emailAddress,
  json,
  problem,
  randomToken,
  same,
  signature,
} from "./security.mjs";
import { launchProblems, newSite, slugOf, updateSite } from "./model.mjs";
import { sendMail } from "./mail.mjs";
import { verifyGoogleIdToken } from "../booking/google.mjs";
import {
  billingPortal,
  connectAccount,
  connectSession,
  connectStatus,
  stripeClient,
  subscriptionCheckout,
  startSubscription,
  handlePlatformWebhook,
} from "./payments.mjs";
import { connectDomain, refreshDomain } from "./domains.mjs";
import { draftCopy, reviewSite } from "./writing.mjs";

const SESSION_LIFE = 30 * 86400000;

/** One registry, separate from every tutor's private teaching database. */
export class Directory {
  constructor(ctx, env, schema) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(schema);
  }
  rows(query, ...values) {
    return this.sql.exec(query, ...values).toArray();
  }
  one(query, ...values) {
    return this.rows(query, ...values)[0] ?? null;
  }
  isOperator(user) {
    return String(this.env.VOWEL_OPERATORS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .includes(user.email);
  }
  async limit(key, max, ms) {
    const now = Date.now();
    this.rows(
      "INSERT INTO limits(key,attempts,resets_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN resets_at<=? THEN 1 ELSE attempts+1 END,resets_at=CASE WHEN resets_at<=? THEN excluded.resets_at ELSE resets_at END",
      key,
      now + ms,
      now,
      now,
    );
    if (this.one("SELECT attempts FROM limits WHERE key=?", key).attempts > max)
      throw problem("Please wait a little before trying again.", 429);
  }
  async provisionUser(email, name = "", googleSub = null) {
    const existing = this.one("SELECT * FROM users WHERE email=?", email);
    if (existing?.google_sub && googleSub && existing.google_sub !== googleSub)
      throw problem(
        "Please use the Google account already linked to this email.",
        409,
      );
    const id = existing?.id || crypto.randomUUID();
    this.rows(
      "INSERT INTO users(id,email,name,google_sub,created_at) VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET google_sub=COALESCE(users.google_sub,excluded.google_sub),name=CASE WHEN users.name='' THEN excluded.name ELSE users.name END",
      id,
      email,
      String(name).slice(0, 100),
      googleSub,
      Date.now(),
    );
    return this.one("SELECT id,email,name FROM users WHERE email=?", email);
  }
  async createSession(userId) {
    const token = randomToken();
    this.rows(
      "INSERT INTO sessions VALUES(?,?,?)",
      await digest(token),
      userId,
      Date.now() + SESSION_LIFE,
    );
    return token;
  }
  cookie(request, token, clear = false) {
    return `vowel_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_LIFE / 1000}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  }
  async userFor(request, required = true) {
    const raw = /(?:^|;\s*)vowel_session=([a-f0-9]{64})(?:;|$)/.exec(
      request.headers.get("Cookie") ?? "",
    )?.[1];
    const user = raw
      ? this.one(
          "SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.digest=? AND s.expires_at>?",
          await digest(raw),
          Date.now(),
        )
      : null;
    if (!user && required) throw problem("Please sign in to Vowel.", 401);
    return user;
  }
  getSite(id) {
    const row = this.one("SELECT * FROM sites WHERE id=?", id);
    if (!row) return null;
    return {
      ...JSON.parse(row.record),
      state: row.state,
      version: row.version,
      publishedAt: row.published_at,
      trialEndsAt: row.trial_ends_at,
      stripeAccount: row.stripe_account,
      stripeSubscription: row.stripe_subscription,
      billing: row.billing,
      cancelAtPeriodEnd:
        this.one(
          "SELECT value FROM platform_settings WHERE key=?",
          `billing_renewal_cancelled:${id}`,
        )?.value === "1",
    };
  }
  sitesFor(userId) {
    return this.rows(
      "SELECT id FROM sites WHERE owner_id=? ORDER BY rowid DESC",
      userId,
    ).map((row) => this.getSite(row.id));
  }
  publicSite(id) {
    const current = this.getSite(id),
      published = this.one(
        "SELECT record FROM published_sites WHERE site_id=?",
        id,
      );
    return current && published
      ? {
          ...JSON.parse(published.record),
          billing: current.billing,
          stripeAccount: current.stripeAccount,
          stripeSubscription: current.stripeSubscription,
          stripeReady: current.stripeReady,
        }
      : null;
  }
  ownedSite(id, user) {
    const site = this.getSite(id);
    if (!site || site.ownerId !== user.id)
      throw problem("That site was not found.", 404);
    return site;
  }
  async accessibleSite(id, request) {
    const site = this.getSite(id);
    if (!site) return null;
    // Trial expiry pauses new bookings; existing students retain their records.
    if (site.state === "live") return this.publicSite(id);
    const user = await this.userFor(request, false);
    return user?.id === site.ownerId ? site : null;
  }
  lookupHost(host) {
    const base = String(this.env.VOWEL_BASE_DOMAIN ?? "").toLowerCase();
    if (
      base &&
      host.endsWith(`.${base}`) &&
      host.slice(0, -(base.length + 1)).indexOf(".") === -1
    ) {
      const row = this.one(
        "SELECT id FROM sites WHERE slug=?",
        host.slice(0, -(base.length + 1)),
      );
      return row ? this.getSite(row.id) : null;
    }
    const row = this.one(
      "SELECT site_id FROM domains WHERE host=? AND status='active'",
      host,
    );
    return row ? this.getSite(row.site_id) : null;
  }
  async ownedAccess(id, request) {
    const user = await this.userFor(request);
    const site = this.ownedSite(id, user);
    return { site, user };
  }
  save(site) {
    this.rows(
      "INSERT INTO sites(id,owner_id,slug,state,version,record,published_at,trial_ends_at,billing) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,state=excluded.state,version=excluded.version,record=excluded.record,published_at=excluded.published_at,trial_ends_at=excluded.trial_ends_at",
      site.id,
      site.ownerId,
      site.slug,
      site.state,
      site.version,
      JSON.stringify(site),
      site.publishedAt,
      site.trialEndsAt,
      site.billing,
    );
  }
  async createSite(user) {
    if (this.sitesFor(user.id).length >= 5)
      throw problem(
        "You already have five sites. Open one of those to continue.",
        409,
      );
    const site = newSite(user, crypto.randomUUID());
    this.save(site);
    await this.scheduleJob(site.id, "finish_setup", Date.now() + 86400000);
    return site;
  }
  async changeSite(id, patch, user) {
    const current = this.ownedSite(id, user);
    if (patch.version !== current.version)
      throw problem(
        "This site changed in another window. Reload to keep both sets of changes.",
        409,
      );
    const next = updateSite(current, patch);
    if (current.publishedAt && next.slug !== current.slug)
      throw problem(
        "Your free address stays fixed once your site is live.",
        409,
      );
    const clash = this.one(
      "SELECT id FROM sites WHERE slug=? AND id<>?",
      next.slug,
      id,
    );
    if (clash)
      throw problem("That address is already in use. Try another.", 409);
    if (
      ["card", "both"].includes(next.rules.paymentMode) &&
      !current.stripeReady
    )
      throw problem("Connect Stripe before switching on card payments.", 409);
    next.version++;
    this.save(next);
    return next;
  }
  async publishSite(id, version, user, origin = this.env.VOWEL_ORIGIN) {
    const site = this.ownedSite(id, user);
    if (version !== site.version)
      throw problem("Reload to publish the latest version.", 409);
    const errors = launchProblems(site);
    if (errors.length) throw problem(errors.join(" "));
    if (!site.publishedAt) {
      site.publishedAt = Date.now();
      site.trialEndsAt = site.publishedAt + 30 * 86400000;
      const exempt = String(this.env.VOWEL_EXEMPT_EMAILS || "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .includes(user.email);
      site.billing = exempt ? "exempt" : "trialing";
    }
    site.state = "live";
    site.version++;
    await this.env.TUTOR_STORES.getByName(id).prepareSite(site, user, origin);
    if (this.getSite(id).version !== version)
      throw problem(
        "Your draft changed while publishing. Reload to review the latest version.",
        409,
      );
    if (!this.getSite(id).publishedAt)
      this.rows("UPDATE sites SET billing=? WHERE id=?", site.billing, id);
    this.save(site);
    this.rows(
      "INSERT OR REPLACE INTO published_sites VALUES(?,?)",
      id,
      JSON.stringify(site),
    );
    const photoHash = site.photo?.asset.split("/").at(-1) || "";
    this.rows(
      "DELETE FROM photos WHERE site_id=? AND digest<>?",
      id,
      photoHash,
    );
    await this.scheduleJob(id, "site_review", Date.now() + 5 * 60000);
    await this.scheduleJob(id, "first_day", Date.now() + 86400000);
    await this.scheduleJob(
      id,
      "trial_reminder",
      site.trialEndsAt - 5 * 86400000,
    );
    return site;
  }
  async scheduleJob(siteId, kind, due, restart = false) {
    this.rows(
      `INSERT INTO jobs(id,site_id,kind,due_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET due_at=excluded.due_at,state='pending',attempts=0 WHERE ?=1 AND jobs.state IN ('cancelled','done')`,
      `${siteId}:${kind}`,
      siteId,
      kind,
      due,
      restart ? 1 : 0,
    );
    const next = this.one(
      "SELECT MIN(due_at) AS due FROM jobs WHERE state='pending'",
    )?.due;
    if (next)
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
  }
  async requestCode(request, input) {
    const email = emailAddress(input.email);
    const ipKey = await digest(
      request.headers.get("CF-Connecting-IP") || "local",
    );
    await this.limit(`code-ip:${ipKey}`, 15, 3600000);
    await this.limit(`code-mail:${await digest(email)}`, 5, 3600000);
    await this.limit(`code-minute:${await digest(email)}`, 1, 60000);
    const id = crypto.randomUUID();
    let n;
    do {
      n = crypto.getRandomValues(new Uint32Array(1))[0];
    } while (n >= 4294000000);
    const code = String(n % 1000000).padStart(6, "0");
    const hash = await signature(`${id}:${code}`, this.env.VOWEL_AUTH_SECRET);
    // Sending must succeed before a new challenge retires the previous one.
    await sendMail(this.env, {
      to: email,
      subject: "Your Vowel sign-in code",
      heading: "A place for your teaching.",
      text: `Your sign-in code is ${code}.\n\nIt works for ten minutes. If you didn't ask for this, you can ignore this email.`,
      id,
    });
    this.ctx.storage.transactionSync(() => {
      this.rows("DELETE FROM codes WHERE email=?", email);
      this.rows(
        "INSERT INTO codes(id,email,digest,expires_at) VALUES(?,?,?,?)",
        id,
        email,
        hash,
        Date.now() + 600000,
      );
    });
    return json({ challengeId: id });
  }
  async confirmCode(request, input) {
    const id = String(input.challengeId ?? "");
    const code = String(input.code ?? "");
    if (!/^[\d]{6}$/.test(code))
      throw problem("Enter the six-digit code from your email.");
    const expected = await signature(
      `${id}:${code}`,
      this.env.VOWEL_AUTH_SECRET,
    );
    const email = this.ctx.storage.transactionSync(() => {
      const row = this.one("SELECT * FROM codes WHERE id=?", id);
      if (!row || row.expires_at <= Date.now() || row.attempts >= 5)
        throw problem("That code has expired. Ask for a new one.");
      this.rows("UPDATE codes SET attempts=attempts+1 WHERE id=?", id);
      if (!same(expected, row.digest)) return null;
      this.rows("DELETE FROM codes WHERE id=?", id);
      return row.email;
    });
    if (!email) throw problem("That code didn't match. Please try again.");
    const user = await this.provisionUser(email);
    return json({ user }, 200, {
      "Set-Cookie": this.cookie(request, await this.createSession(user.id)),
    });
  }
  async uploadPhoto(site, input) {
    if (input.version !== site.version)
      throw problem("Your site changed. Reload before adding this photo.", 409);
    const match =
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
        String(input.data || ""),
      );
    if (!match || match[2].length > 700000)
      throw problem("Choose a JPEG, PNG or WebP portrait smaller than 500 KB.");
    const bytes = Uint8Array.from(atob(match[2]), (character) =>
      character.charCodeAt(0),
    );
    const valid =
      match[1] === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216
        : match[1] === "image/png"
          ? bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71
          : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
            new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    if (!valid || bytes.length > 512000)
      throw problem("That file doesn't look like a supported portrait.");
    const hash = await digest(match[2]),
      current = this.getSite(site.id);
    if (current.version !== input.version)
      throw problem("Your site changed. Reload before adding this photo.", 409);
    current.photo = {
      asset: `/media/${site.id}/${hash}`,
      alt: `Portrait of ${current.name || "your tutor"}`,
    };
    current.version++;
    this.ctx.storage.transactionSync(() => {
      this.rows(
        "INSERT OR REPLACE INTO photos VALUES(?,?,?,?)",
        site.id,
        hash,
        bytes.buffer,
        match[1],
      );
      this.save(current);
      const publishedHash =
        this.publicSite(site.id)?.photo?.asset.split("/").at(-1) || "";
      this.rows(
        "DELETE FROM photos WHERE site_id=? AND digest NOT IN (?,?)",
        site.id,
        hash,
        publishedHash,
      );
    });
    return json({ site: current });
  }
  async photo(id, hash, request) {
    const published = this.publicSite(id),
      isPublic =
        published?.state === "live" &&
        published.photo?.asset === `/media/${id}/${hash}`;
    if (!isPublic) {
      const user = await this.userFor(request, false);
      if (!user || this.getSite(id)?.ownerId !== user.id)
        throw problem("That portrait was not found.", 404);
    }
    const row = this.one(
      "SELECT * FROM photos WHERE site_id=? AND digest=?",
      id,
      hash,
    );
    return row
      ? new Response(row.data, {
          headers: {
            "Content-Type": row.type,
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        })
      : new Response("Portrait not found", { status: 404 });
  }
  async fetch(request) {
    try {
      checkOrigin(request);
      const url = new URL(request.url),
        path =
          url.pathname.replace(/^\/api\/platform/, "").replace(/\/$/, "") ||
          "/";
      if (path === "/auth/code" && request.method === "POST")
        return await this.requestCode(request, await body(request));
      if (path === "/auth/confirm" && request.method === "POST")
        return await this.confirmCode(request, await body(request));
      if (path === "/auth/google" && request.method === "POST") {
        const input = await body(request),
          profile = await verifyGoogleIdToken(
            input.credential,
            this.env.GOOGLE_CLIENT_ID,
          );
        const user = await this.provisionUser(
          emailAddress(profile.email),
          profile.name,
          profile.sub,
        );
        return json({ user }, 200, {
          "Set-Cookie": this.cookie(request, await this.createSession(user.id)),
        });
      }
      if (path === "/me" && request.method === "GET") {
        const user = await this.userFor(request, false);
        return json({
          user,
          sites: user ? this.sitesFor(user.id) : [],
          capabilities: {
            google: Boolean(this.env.GOOGLE_CLIENT_ID),
            payments: Boolean(this.env.VOWEL_STRIPE_SECRET_KEY),
            ai: this.env.VOWEL_AI_ENABLED === "1",
            domains: Boolean(
              this.env.VOWEL_ZONE_ID && this.env.VOWEL_CLOUDFLARE_TOKEN,
            ),
            baseDomain: this.env.VOWEL_BASE_DOMAIN || "",
            operator: Boolean(user && this.isOperator(user)),
          },
        });
      }
      const user = await this.userFor(request);
      if (path === "/operator/reviews") {
        if (!this.isOperator(user))
          throw problem("That page was not found.", 404);
        if (request.method === "GET")
          return json({
            items: this.rows(
              "SELECT s.id,s.site_id,s.kind,s.detail,s.created_at,s.state,t.slug FROM support s JOIN sites t ON t.id=s.site_id WHERE s.state='open' ORDER BY s.created_at LIMIT 100",
            ),
            failedJobs: this.rows(
              "SELECT id,site_id,kind,attempts FROM jobs WHERE state='needs_help' LIMIT 100",
            ),
          });
        if (request.method !== "POST")
          throw problem("Use the review controls.", 405);
        const input = await body(request);
        if (typeof input.id !== "string") throw problem("Choose a review.");
        this.rows("UPDATE support SET state='reviewed' WHERE id=?", input.id);
        return json({ ok: true });
      }
      if (path === "/auth/logout" && request.method === "POST") {
        const token = /(?:^|;\s*)vowel_session=([a-f0-9]{64})/.exec(
          request.headers.get("Cookie") ?? "",
        )?.[1];
        if (token)
          this.rows("DELETE FROM sessions WHERE digest=?", await digest(token));
        return json({ ok: true }, 200, {
          "Set-Cookie": this.cookie(request, "", true),
        });
      }
      if (path === "/sites" && request.method === "POST")
        return json({ site: await this.createSite(user) }, 201);
      const match = /^\/sites\/([a-f0-9-]{36})(?:\/(.*))?$/.exec(path);
      if (!match) throw problem("That page was not found.", 404);
      const [, id, action = ""] = match;
      let site = this.ownedSite(id, user);
      if (!action && request.method === "GET") return json({ site });
      if (action === "progress" && request.method === "POST") {
        const input = await body(request);
        if (
          !Number.isInteger(input.step) ||
          input.step < 0 ||
          input.step > 6 ||
          !Number.isInteger(input.durationMs) ||
          input.durationMs < 0 ||
          input.durationMs > 86400000
        )
          throw problem("That setup step could not be recorded.");
        this.rows(
          "INSERT OR IGNORE INTO onboarding_events VALUES(?,?,?,?)",
          id,
          input.step,
          input.durationMs,
          Date.now(),
        );
        return json({ ok: true });
      }
      if (!action && request.method === "PATCH")
        return json({
          site: await this.changeSite(id, await body(request), user),
        });
      if (action === "publish" && request.method === "POST")
        return json({
          site: await this.publishSite(
            id,
            (await body(request)).version,
            user,
            url.origin,
          ),
        });
      if (action === "address" && request.method === "GET") {
        const slug = slugOf(url.searchParams.get("slug"));
        return json({
          available: !this.one(
            "SELECT id FROM sites WHERE slug=? AND id<>?",
            slug,
            id,
          ),
        });
      }
      if (action === "photo" && request.method === "POST")
        return await this.uploadPhoto(site, await body(request, 750000));
      if (action === "draft" && request.method === "POST") {
        await this.limit(
          `draft:${id}:${new Date().toISOString().slice(0, 7)}`,
          Number(this.env.VOWEL_AI_MONTHLY_LIMIT || 200),
          32 * 86400000,
        );
        const copy = await draftCopy(site, this.env);
        site = await this.changeSite(
          id,
          { version: site.version, content: copy },
          user,
        );
        return json({ site });
      }
      if (action === "teacher-session" && request.method === "POST") {
        const token = await this.env.TUTOR_STORES.getByName(id).teacherSession(
          this.publicSite(id) || site,
          user,
          url.origin,
        );
        return json({ token });
      }
      if (action === "connect" && request.method === "POST") {
        let account = site.stripeAccount;
        if (!account) {
          const created = await connectAccount(this.env, site, user);
          account = created.id;
          this.rows(
            "UPDATE sites SET stripe_account=? WHERE id=?",
            account,
            id,
          );
        }
        return json(await connectSession(this.env, account));
      }
      if (action === "connect/status" && request.method === "GET") {
        const status = await connectStatus(this.env, site.stripeAccount);
        site.stripeReady = status.ready;
        site.version++;
        this.save(site);
        return json({ ready: status.ready, site });
      }
      if (action === "billing" && request.method === "POST") {
        if (site.billing === "exempt")
          throw problem(
            "Your Vowel site is free. No subscription is needed.",
            409,
          );
        if ((await body(request)).consent !== true)
          throw problem(
            "Confirm the €25 monthly subscription and its first payment date.",
          );
        if (!site.stripeAccount) {
          const account = await connectAccount(this.env, site, user);
          this.rows(
            "UPDATE sites SET stripe_account=? WHERE id=?",
            account.id,
            id,
          );
          site = this.getSite(id);
        }
        return json(
          await subscriptionCheckout(this.env, site, user, url.origin),
        );
      }
      if (action === "billing/portal" && request.method === "POST")
        return json(await billingPortal(this.env, site, url.origin));
      if (action === "billing/cancel" && request.method === "POST") {
        this.rows(
          "INSERT OR REPLACE INTO platform_settings VALUES(?,?)",
          `billing_cancelled:${site.id}`,
          String(Date.now()),
        );
        if (site.stripeSubscription)
          await stripeClient(this.env).subscriptions.update(
            site.stripeSubscription,
            { cancel_at_period_end: true },
            {
              idempotencyKey: `vowel:cancel:${site.id}:${site.stripeSubscription}`,
            },
          );
        else
          this.ctx.storage.transactionSync(() => {
            this.rows("DELETE FROM billing_methods WHERE site_id=?", site.id);
            this.rows(
              "UPDATE jobs SET state='cancelled' WHERE id=?",
              `${site.id}:subscription_start`,
            );
            this.rows(
              "UPDATE sites SET billing='cancelled' WHERE id=?",
              site.id,
            );
          });
        this.rows(
          "INSERT OR REPLACE INTO platform_settings VALUES(?,?)",
          `billing_renewal_cancelled:${id}`,
          "1",
        );
        return json({ ok: true });
      }
      if (action === "domains" && request.method === "GET")
        return json({
          domains: this.rows(
            "SELECT host,status,verification FROM domains WHERE site_id=?",
            id,
          ).map((row) => ({
            ...row,
            verification: JSON.parse(row.verification),
          })),
        });
      if (action === "domains" && request.method === "POST")
        return json(
          await connectDomain(this, site, (await body(request)).host),
        );
      if (action === "domains/check" && request.method === "POST")
        return json(
          await refreshDomain(this, site, (await body(request)).host),
        );
      if (action === "feedback" && request.method === "POST") {
        const input = await body(request);
        this.rows(
          "INSERT INTO support VALUES(?,?,?,?,?,?)",
          crypto.randomUUID(),
          id,
          "tutor_question",
          String(input.text ?? "")
            .trim()
            .slice(0, 4000),
          Date.now(),
          "open",
        );
        return json({ ok: true });
      }
      throw problem("That action was not found.", 404);
    } catch (error) {
      return json(
        {
          error:
            error.status && error.status < 500
              ? error.message
              : error.status === 503
                ? error.message
                : "Vowel couldn't save that just now. Please try again.",
        },
        error.status || 500,
      );
    }
  }
  async webhook(request) {
    return handlePlatformWebhook(this, request);
  }
  async alarm() {
    const jobs = this.rows(
      "SELECT * FROM jobs WHERE state='pending' AND due_at<=? ORDER BY due_at LIMIT 10",
      Date.now(),
    );
    for (const job of jobs) {
      const site = this.getSite(job.site_id);
      if (!site) {
        this.rows("UPDATE jobs SET state='done' WHERE id=?", job.id);
        continue;
      }
      const user = this.one("SELECT email FROM users WHERE id=?", site.ownerId);
      try {
        if (job.kind === "subscription_start") {
          await startSubscription(this, site);
        } else if (job.kind === "site_review") {
          const result = await reviewSite(site, this.env);
          if (result.flags.length)
            this.rows(
              "INSERT INTO support VALUES(?,?,?,?,?,?)",
              crypto.randomUUID(),
              site.id,
              "site_review",
              JSON.stringify(result),
              Date.now(),
              "open",
            );
          this.rows(
            "UPDATE jobs SET result=? WHERE id=?",
            JSON.stringify(result),
            job.id,
          );
          if (result.suggestions.length)
            await sendMail(this.env, {
              to: user.email,
              subject: "A quick look at your new site",
              heading: "Your site is open.",
              text: result.suggestions.join("\n\n"),
              action: {
                label: "Open your dashboard",
                url: `${this.env.VOWEL_ORIGIN}/dashboard/`,
              },
              id: job.id,
            });
        } else if (job.kind === "finish_setup" && !site.publishedAt) {
          await sendMail(this.env, {
            to: user.email,
            subject: "Your teaching site is waiting",
            heading: "Pick up where you left off.",
            text: "Your answers are saved. Come back whenever you're ready.",
            action: {
              label: "Continue your site",
              url: `${this.env.VOWEL_ORIGIN}/start/?site=${site.id}`,
            },
            id: job.id,
          });
        } else if (
          job.kind === "trial_reminder" &&
          !["active", "exempt"].includes(site.billing)
        ) {
          await sendMail(this.env, {
            to: user.email,
            subject: "Five days left on your Vowel trial",
            heading: "Keep your teaching site open.",
            text: "Your free trial ends in five days. Vowel is €25 a month, with no commission on your lessons. Add your payment details from your dashboard. Your data stays available if you need more time.",
            action: {
              label: "Open billing",
              url: `${this.env.VOWEL_ORIGIN}/dashboard/?tab=billing`,
            },
            id: job.id,
          });
        } else if (job.kind === "first_day") {
          await sendMail(this.env, {
            to: user.email,
            subject: "How did setting up your site feel?",
            heading: "One small question.",
            text: "Was anything difficult or missing? You can leave a note in your dashboard. It's optional, and we read every answer.",
            action: {
              label: "Leave a note",
              url: `${this.env.VOWEL_ORIGIN}/dashboard/?tab=help`,
            },
            id: job.id,
          });
        }
        this.rows("UPDATE jobs SET state='done' WHERE id=?", job.id);
      } catch {
        this.rows(
          "UPDATE jobs SET attempts=attempts+1,due_at=?,state=CASE WHEN attempts>=7 THEN 'needs_help' ELSE 'pending' END WHERE id=?",
          Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts),
          job.id,
        );
      }
    }
    this.rows("DELETE FROM codes WHERE expires_at<?", Date.now());
    this.rows("DELETE FROM sessions WHERE expires_at<?", Date.now());
    this.rows("DELETE FROM limits WHERE resets_at<?", Date.now());
    const next = this.one(
      "SELECT MIN(due_at) AS due FROM jobs WHERE state='pending'",
    )?.due;
    if (next)
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
  }
}
