import { useEffect, useRef, useState } from "react";
import { api, tutorApi, BOOT } from "./runtime";
import type { Capabilities, Site, User } from "./types";
import {
  Field,
  LessonEditor,
  LookPicker,
  PortraitUpload,
  Preview,
  RuleEditor,
  useSiteDraft,
  WeekEditor,
} from "./onboarding";
import { Curriculum } from "./curriculum";
import { parseStudents, type ImportStudent } from "./import-students";
import { csvCell } from "../lib/csv";

type Student = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  awaitingWelcome?: boolean;
};
function SiteSettings({
  initial,
  onPublished,
}: {
  initial: Site;
  onPublished: (site: Site) => void;
}) {
  const draft = useSiteDraft(initial),
    { site, change, flush, current, replace } = draft;
  const [section, setSection] = useState("words"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      await flush();
      const result = await api<{ site: Site }>(`/sites/${site.id}/publish`, {
        version: current.current.version,
      });
      replace(result.site);
      onPublished(result.site);
      setNotice("Your changes are live.");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vo-site-settings">
      <section>
        <div className="vo-subtabs" role="group" aria-label="Site settings">
          {[
            ["words", "Your words"],
            ["look", "Your look"],
            ["lessons", "Lessons"],
            ["week", "Your week"],
            ["rules", "Rules"],
          ].map(([id, name]) => (
            <button
              type="button"
              key={id}
              aria-pressed={section === id}
              onClick={() => setSection(id)}
            >
              {name}
            </button>
          ))}
        </div>
        <fieldset disabled={busy} className="vo-step-fields">
          {section === "look" ? (
            <LookPicker site={site} onChange={(look) => change({ look })} />
          ) : section === "lessons" ? (
            <LessonEditor
              site={site}
              onChange={(lessons) => change({ lessons })}
            />
          ) : section === "week" ? (
            <WeekEditor site={site} onChange={(hours) => change({ hours })} />
          ) : section === "rules" ? (
            <RuleEditor site={site} onChange={(rules) => change({ rules })} />
          ) : (
            <>
              <Field label="Your site name">
                <input
                  value={site.brand}
                  placeholder={`${site.language.name} with ${site.shortName}`}
                  onChange={(event) => change({ brand: event.target.value })}
                />
              </Field>
              <Field label="Your page heading">
                <input
                  value={site.content.hero.title}
                  onChange={(event) =>
                    change({
                      content: {
                        ...site.content,
                        hero: {
                          ...site.content.hero,
                          title: event.target.value,
                        },
                        reviewed: false,
                      },
                    })
                  }
                />
              </Field>
              <Field label="A line underneath">
                <input
                  value={site.content.hero.line}
                  onChange={(event) =>
                    change({
                      content: {
                        ...site.content,
                        hero: {
                          ...site.content.hero,
                          line: event.target.value,
                        },
                        reviewed: false,
                      },
                    })
                  }
                />
              </Field>
              <Field label="About you">
                <textarea
                  rows={7}
                  value={site.content.about.body}
                  onChange={(event) =>
                    change({
                      content: {
                        ...site.content,
                        about: {
                          ...site.content.about,
                          body: event.target.value,
                        },
                        reviewed: false,
                      },
                    })
                  }
                />
              </Field>
              <PortraitUpload
                site={site}
                beforeUpload={flush}
                onUploaded={replace}
                onBusy={setBusy}
              />
              <h3>Questions your students ask</h3>
              {site.content.faq.map((faq, index) => (
                <div className="vo-faq-edit" key={index}>
                  <Field label={`Question ${index + 1}`}>
                    <input
                      value={faq.q}
                      onChange={(event) =>
                        change({
                          content: {
                            ...site.content,
                            faq: site.content.faq.map((f, i) =>
                              i === index ? { ...f, q: event.target.value } : f,
                            ),
                            reviewed: false,
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Your answer">
                    <textarea
                      rows={3}
                      value={faq.a}
                      onChange={(event) =>
                        change({
                          content: {
                            ...site.content,
                            faq: site.content.faq.map((f, i) =>
                              i === index ? { ...f, a: event.target.value } : f,
                            ),
                            reviewed: false,
                          },
                        })
                      }
                    />
                  </Field>
                  <button
                    className="vo-text-button"
                    type="button"
                    onClick={() =>
                      change({
                        content: {
                          ...site.content,
                          faq: site.content.faq.filter((_, i) => i !== index),
                          reviewed: false,
                        },
                      })
                    }
                  >
                    Remove question
                  </button>
                </div>
              ))}
              {site.content.faq.length < 15 && (
                <button
                  type="button"
                  className="vo-text-button"
                  onClick={() =>
                    change({
                      content: {
                        ...site.content,
                        faq: [...site.content.faq, { q: "", a: "" }],
                        reviewed: false,
                      },
                    })
                  }
                >
                  Add a question
                </button>
              )}
              <Field label="WhatsApp number, if you want to share it">
                <input
                  type="tel"
                  value={site.contact.whatsapp}
                  onChange={(event) =>
                    change({ contact: { whatsapp: event.target.value } })
                  }
                />
              </Field>
              <label className="vo-check">
                <input
                  type="checkbox"
                  checked={site.content.reviewed}
                  onChange={(event) =>
                    change({
                      content: {
                        ...site.content,
                        reviewed: event.target.checked,
                      },
                    })
                  }
                />{" "}
                I’ve read and checked this wording.
              </label>
              <h3>Your teaching tools</h3>
              <div className="vo-inline-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={site.features.homework}
                    onChange={(event) =>
                      change({
                        features: {
                          ...site.features,
                          homework: event.target.checked,
                        },
                      })
                    }
                  />{" "}
                  Homework
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={site.features.curriculum}
                    onChange={(event) =>
                      change({
                        features: {
                          ...site.features,
                          curriculum: event.target.checked,
                        },
                      })
                    }
                  />{" "}
                  Lesson plans
                </label>
              </div>
            </>
          )}
        </fieldset>
        <p className="vo-hint" role="status">
          {draft.saving
            ? "Saving your draft…"
            : "Your draft is saved separately. Students see changes after you publish."}
        </p>
        {(error || draft.error) && (
          <p role="alert" className="vo-error">
            {error || draft.error}
          </p>
        )}
        {notice && (
          <p role="status" className="vo-notice">
            {notice}
          </p>
        )}
        <button
          type="button"
          className="vo-button"
          disabled={busy}
          onClick={() => void publish()}
        >
          Save and publish
        </button>
      </section>
      <Preview site={site} />
    </div>
  );
}
function StudentImport({ site, token }: { site: Site; token: string }) {
  const [students, setStudents] = useState<Student[]>([]),
    [text, setText] = useState(""),
    [review, setReview] = useState<ImportStudent[] | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState(false);
  const load = () =>
    tutorApi<{ students: Student[] }>(site.id, token, "/admin/students").then(
      (value) => {
        setStudents(value.students);
        return value.students;
      },
    );
  useEffect(() => {
    let active = true;
    void tutorApi<{ students: Student[] }>(site.id, token, "/admin/students")
      .then((value) => {
        if (active) setStudents(value.students);
      })
      .catch((caught) => {
        if (active) setError(caught.message);
      });
    return () => {
      active = false;
    };
  }, [site.id, token]);
  const read = () => {
    setError("");
    setNotice("");
    try {
      setReview(parseStudents(text));
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  const save = async () => {
    if (!review) return;
    setBusy(true);
    setError("");
    setNotice("");
    let added = 0,
      skipped = 0;
    try {
      const existing = await load(),
        seen = new Set(
          existing.filter((s) => s.email).map((s) => s.email.toLowerCase()),
        );
      for (const row of review) {
        if (!row.name.trim())
          throw new Error(
            "Every student needs a name. Check the review first.",
          );
        if (row.email && seen.has(row.email.toLowerCase())) {
          skipped++;
          continue;
        }
        const result = await tutorApi<{ student: Student }>(
          site.id,
          token,
          "/admin/students",
          { ...row, nif: "", mark: "" },
        );
        added++;
        if (row.email) seen.add(row.email.toLowerCase());
        if (invite && result.student.email)
          await tutorApi(
            site.id,
            token,
            `/admin/students/${result.student.id}/welcome`,
            { onlyIfWaiting: true },
          );
      }
      await load();
      setReview(null);
      setText("");
      setNotice(
        `${added} student${added === 1 ? "" : "s"} added.${skipped ? ` ${skipped} existing email${skipped === 1 ? "" : "s"} skipped.` : ""}${invite ? " Welcome emails sent to those with an address." : " No invitations sent."}`,
      );
    } catch (caught) {
      setError(
        `${added ? `${added} saved so far. ` : ""}${(caught as Error).message} Review the remaining list before trying again.`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  };
  const exportList = () => {
    const content = [
        ["Name", "Email", "Phone"],
        ...students.map((s) => [s.name, s.email, s.phone || ""]),
      ]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n"),
      url = URL.createObjectURL(
        new Blob([content], { type: "text/csv;charset=utf-8" }),
      ),
      link = document.createElement("a");
    link.href = url;
    link.download = "my-students.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="vo-students">
      <p className="vo-eyebrow">Bring the people you already teach</p>
      <h2>Your students, together.</h2>
      <p>
        Paste names, email addresses and phone numbers as they come, or choose a
        CSV spreadsheet. You’ll review everything before saving. Existing
        students are kept as they are.
      </p>
      <Field label="Your list">
        <textarea
          rows={6}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setReview(null);
          }}
          placeholder={"Name,Email,Phone\nAlex,alex@example.com,\nSam,,+44..."}
        />
      </Field>
      <label className="vo-file-label">
        Choose a CSV file
        <input
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              if (file.size > 500000) {
                setError("Choose a smaller CSV file, up to 500 KB.");
                return;
              }
              void file.text().then((value) => {
                setText(value);
                setReview(null);
              });
            }
            event.target.value = "";
          }}
        />
      </label>
      <button
        type="button"
        className="vo-button vo-button-secondary"
        disabled={!text.trim() || busy}
        onClick={read}
      >
        Review the list
      </button>
      {review && (
        <>
          <div className="vo-table-scroll">
            <table className="vo-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {review.map((row, index) => (
                  <tr key={index}>
                    {(["name", "email", "phone"] as const).map((key) => (
                      <td key={key}>
                        <input
                          aria-label={`${key} for row ${index + 1}`}
                          value={row[key]}
                          onChange={(event) =>
                            setReview(
                              review.map((value, i) =>
                                i === index
                                  ? { ...value, [key]: event.target.value }
                                  : value,
                              ),
                            )
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="vo-check">
            <input
              type="checkbox"
              checked={invite}
              onChange={(event) => setInvite(event.target.checked)}
            />{" "}
            Send a welcome email to each new student with an address.
          </label>
          <button
            type="button"
            className="vo-button"
            disabled={busy || !review.length}
            onClick={() => void save()}
          >
            {busy
              ? "Saving students…"
              : `Save ${review.length} student${review.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      {notice && (
        <p role="status" className="vo-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="vo-error">
          {error}
        </p>
      )}
      <div className="vo-section-heading">
        <h3>{students.length} students</h3>
        {Boolean(students.length) && (
          <button type="button" className="vo-text-button" onClick={exportList}>
            Export my students
          </button>
        )}
      </div>
      <ul className="vo-student-list">
        {students.map((student) => (
          <li key={student.id}>
            <span>
              <strong>{student.name}</strong>
              <small>{student.email || "No email yet"}</small>
            </span>
            <a href={`/t/${site.id}/schedule/`}>
              Open their teaching page <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="vo-hint">
        Add a usual lesson time or a personal price from your teaching page. For
        a new price on a weekly run, send an offer below so the student can
        agree.
      </p>
      <RateOffer site={site} token={token} students={students} />
    </section>
  );
}
function RateOffer({
  site,
  token,
  students,
}: {
  site: Site;
  token: string;
  students: Student[];
}) {
  const [studentId, setStudentId] = useState(""),
    [typeId, setTypeId] = useState(site.lessons[0]?.id || ""),
    [amount, setAmount] = useState(""),
    [message, setMessage] = useState("");
  return (
    <details className="vo-rate-offer">
      <summary>Offer a student’s own lesson price</summary>
      <Field label="Student">
        <select
          value={studentId}
          onChange={(event) => setStudentId(event.target.value)}
        >
          <option value="">Choose a student</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Lesson">
        <select
          value={typeId}
          onChange={(event) => setTypeId(event.target.value)}
        >
          {site.lessons
            .filter((l) => !l.firstLessonOnly)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.durationMinutes} minutes
              </option>
            ))}
        </select>
      </Field>
      <Field label={`New price · ${site.place.currency}`}>
        <input
          type="number"
          min={0}
          step="0.50"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <p>
        The student sees this offer on their lesson page. It changes their
        future lessons only after they accept.
      </p>
      <button
        type="button"
        className="vo-button vo-button-secondary"
        disabled={!studentId || !typeId || amount === ""}
        onClick={() =>
          void tutorApi(site.id, token, "/vowel/rates", {
            studentId,
            lessonTypeId: typeId,
            amountCents: Math.round(Number(amount) * 100),
          })
            .then(() => setMessage("Offer saved for the student to review."))
            .catch((caught) => setMessage(caught.message))
        }
      >
        Offer this price
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
function GetPaid({
  site,
  onSite,
}: {
  site: Site;
  onSite: (site: Site) => void;
}) {
  const holder = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const check = async () => {
    try {
      const result = await api<{ site: Site; ready: boolean }>(
        `/sites/${site.id}/connect/status`,
      );
      onSite(result.site);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const first = await api<{ clientSecret: string; publishableKey: string }>(
        `/sites/${site.id}/connect`,
        {},
      );
      if (!first.publishableKey)
        throw new Error(
          "Stripe's payment form isn't configured yet. You can still take payment directly.",
        );
      const { loadConnectAndInitialize } = await import("@stripe/connect-js");
      let initial = first.clientSecret;
      const stripe = loadConnectAndInitialize({
        publishableKey: first.publishableKey,
        fetchClientSecret: async () => {
          if (initial) {
            const value = initial;
            initial = "";
            return value;
          }
          return (
            await api<{ clientSecret: string }>(`/sites/${site.id}/connect`, {})
          ).clientSecret;
        },
        appearance: {
          variables: {
            colorPrimary: "#0e6b4c",
            fontFamily: "Commissioner, Arial, sans-serif",
            borderRadius: "6px",
          },
        },
      });
      const banner = stripe.create("notification-banner"),
        onboarding = stripe.create("account-onboarding"),
        management = stripe.create("account-management");
      onboarding.setOnExit(() => void check());
      holder.current?.replaceChildren(banner, onboarding, management);
      setOpen(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <p className="vo-eyebrow">Your lessons. Your money.</p>
      <h2>Get paid your way.</h2>
      <p>
        Students can pay you directly from day one. Connect Stripe when you want
        to save cards and charge after each lesson. Lesson money goes to your
        own Stripe account. Vowel takes no commission.
      </p>
      <p className="vo-hint">
        Stripe collects its processing fees and handles the banking and identity
        checks in its own form.
      </p>
      <button
        type="button"
        className="vo-button"
        disabled={busy}
        onClick={() => void connect()}
      >
        {busy
          ? "Opening Stripe…"
          : open
            ? "Refresh Stripe form"
            : "Connect my Stripe account"}
      </button>
      <div ref={holder} className="vo-connect-form" />
      {(open || site.stripeAccount) && (
        <button
          type="button"
          className="vo-text-button"
          onClick={() => void check()}
        >
          Check my account status
        </button>
      )}
      <p role="status">
        {site.stripeReady
          ? "Your Stripe account is ready. Choose card payments under Site → Rules, then publish."
          : "Direct payment stays available while you finish setting up Stripe."}
      </p>
      {error && (
        <p role="alert" className="vo-error">
          {error}
        </p>
      )}
      <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer">
        Open my Stripe dashboard <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
function Billing({ site }: { site: Site }) {
  const [openedAt] = useState(() => Date.now());
  const [cancelledNow, setCancelledNow] = useState(false);
  const [consent, setConsent] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function open(portal = false) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>(
        `/sites/${site.id}/billing${portal ? "/portal" : ""}`,
        portal ? {} : { consent },
      );
      const target = new URL(result.url);
      if (
        !["checkout.stripe.com", "billing.stripe.com"].includes(target.hostname)
      )
        throw new Error("The payment link could not be verified.");
      window.location.assign(target.href);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  }
  const first = site.trialEndsAt
    ? new Date(Math.max(openedAt, site.trialEndsAt)).toLocaleDateString("en-GB")
    : "after you put your site live";
  if (site.billing === "exempt")
    return (
      <section>
        <p className="vo-eyebrow">Your place on Vowel</p>
        <h2>Your site is free.</h2>
        <p>
          No subscription or payment card is needed. Lesson payments go directly
          to you.
        </p>
      </section>
    );
  return (
    <section>
      <p className="vo-eyebrow">One clear price</p>
      <h2>€25 a month.</h2>
      <p>
        No commission on lessons. Your first 30 days are free from putting your
        site live.
      </p>
      <div className="vo-billing-facts">
        <p>
          <span>Current status</span>
          <strong>
            {site.billing === "scheduled"
              ? "Card saved · first payment scheduled"
              : site.billing.replaceAll("_", " ")}
          </strong>
        </p>
        <p>
          <span>First payment</span>
          <strong>{first}</strong>
        </p>
      </div>
      {(!site.stripeSubscription ||
        ["canceled", "cancelled", "incomplete_expired"].includes(
          site.billing,
        )) && (
        <>
          <label className="vo-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />{" "}
            I agree to €25 monthly billing, first charged {first}. I can cancel
            in my dashboard before the next payment.
          </label>
          <button
            type="button"
            className="vo-button"
            disabled={busy || !consent || !site.publishedAt}
            onClick={() => void open()}
          >
            Add my Vowel payment details
          </button>
        </>
      )}
      <button
        type="button"
        className="vo-button vo-button-secondary"
        disabled={busy || !site.stripeAccount}
        onClick={() => void open(true)}
      >
        Manage billing at Stripe
      </button>
      <button
        type="button"
        className="vo-text-button"
        disabled={
          busy ||
          cancelledNow ||
          site.cancelAtPeriodEnd ||
          !["scheduled", "pending_confirmation", "active", "trialing"].includes(
            site.billing,
          )
        }
        onClick={() =>
          void api(`/sites/${site.id}/billing/cancel`, {})
            .then(() => {
              setCancelledNow(true);
              setNotice(
                "Future renewal is cancelled. Your existing lesson records stay available.",
              );
            })
            .catch((caught) => setError(caught.message))
        }
      >
        {cancelledNow || site.cancelAtPeriodEnd
          ? "Renewal cancelled"
          : "Cancel future renewal"}
      </button>
      <p className="vo-hint">
        Returning from Stripe doesn’t confirm a payment. Your dashboard updates
        when Stripe confirms it.
      </p>
      {notice && (
        <p role="status" className="vo-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="vo-error">
          {error}
        </p>
      )}
    </section>
  );
}
type Domain = {
  host: string;
  status: string;
  verification: {
    cname: string;
    ownership?: { type?: string; name?: string; value?: string };
    ssl?: { txt_name?: string; txt_value?: string }[];
  };
};
function Domains({ site, enabled }: { site: Site; enabled: boolean }) {
  const [host, setHost] = useState(""),
    [domains, setDomains] = useState<Domain[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void api<{ domains: Domain[] }>(`/sites/${site.id}/domains`)
      .then((value) => setDomains(value.domains))
      .catch((caught) => setError(caught.message));
  }, [site.id]);
  return (
    <details className="vo-domains">
      <summary>Use your own domain</summary>
      <p>
        Your free address keeps working. Your own domain stays registered in
        your name.
      </p>
      <Field label="Your domain name">
        <input
          placeholder="lessons.example.com"
          value={host}
          onChange={(event) => setHost(event.target.value)}
        />
      </Field>
      <button
        type="button"
        className="vo-button vo-button-secondary"
        disabled={!enabled || !host.trim()}
        onClick={() =>
          void api<Domain>(`/sites/${site.id}/domains`, { host })
            .then((value) =>
              setDomains([
                ...domains.filter((d) => d.host !== value.host),
                value,
              ]),
            )
            .catch((caught) => setError(caught.message))
        }
      >
        Connect my domain
      </button>
      {!enabled && (
        <p>
          Custom domains aren’t open yet. Your free address is ready to use.
        </p>
      )}
      {domains.map((domain) => (
        <article key={domain.host}>
          <h3>{domain.host}</h3>
          <p>
            {domain.status === "active"
              ? "Connected"
              : "Waiting for DNS verification"}
          </p>
          {domain.status !== "active" && (
            <>
              <p>
                Add a CNAME record pointing this name to{" "}
                <code>{domain.verification.cname}</code> at your domain
                provider.
              </p>
              {domain.verification.ownership && (
                <dl>
                  <dt>Ownership record name</dt>
                  <dd>
                    <code>{domain.verification.ownership.name}</code>
                  </dd>
                  <dt>Value</dt>
                  <dd>
                    <code>{domain.verification.ownership.value}</code>
                  </dd>
                </dl>
              )}
              {domain.verification.ssl?.map((record, index) => (
                <p key={index}>
                  <code>{record.txt_name}</code>
                  <br />
                  <code>{record.txt_value}</code>
                </p>
              ))}
              <button
                type="button"
                className="vo-text-button"
                onClick={() =>
                  void api<Domain>(`/sites/${site.id}/domains/check`, {
                    host: domain.host,
                  })
                    .then((value) =>
                      setDomains(
                        domains.map((d) => (d.host === value.host ? value : d)),
                      ),
                    )
                    .catch((caught) => setError(caught.message))
                }
              >
                Check my DNS
              </button>
            </>
          )}
        </article>
      ))}
      {error && (
        <p role="alert" className="vo-error">
          {error}
        </p>
      )}
    </details>
  );
}
function Help({ site }: { site: Site }) {
  const [text, setText] = useState(""),
    [message, setMessage] = useState("");
  return (
    <section>
      <p className="vo-eyebrow">Something on your mind?</p>
      <h2>Leave a note.</h2>
      <p>
        Tell us what was difficult, what you need, or what went wrong. Please
        leave out card details, passwords and sign-in codes.
      </p>
      <Field label="Your note">
        <textarea
          rows={6}
          maxLength={4000}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <button
        type="button"
        className="vo-button"
        disabled={!text.trim()}
        onClick={() =>
          void api(`/sites/${site.id}/feedback`, { text })
            .then(() => {
              setText("");
              setMessage("Your note is saved for support.");
            })
            .catch((caught) => setMessage(caught.message))
        }
      >
        Send to support
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function Milestones({ siteId, token }: { siteId: string; token: string }) {
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("");
  useEffect(() => {
    if (!token) return;
    let active = true;
    void tutorApi<{
      firstBooking: { student_name: string } | null;
      firstPayment: { student_name: string } | null;
    }>(siteId, token, "/vowel/milestones")
      .then((result) => {
        const event = result.firstPayment
          ? "payment"
          : result.firstBooking
            ? "booking"
            : "";
        if (!active || !event) return;
        let seen = false;
        try {
          seen = localStorage.getItem(`vowel:${siteId}:${event}`) === "seen";
        } catch {}
        if (!seen) {
          setKind(event);
          setMessage(
            event === "payment"
              ? "Your first card payment has arrived. A little less admin, a little more room to teach."
              : `${result.firstBooking!.student_name.split(" ")[0]} booked your first lesson. Your teaching site is doing its job.`,
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [siteId, token]);
  return message ? (
    <aside className="vo-notice" role="status">
      <p>{message}</p>
      <button
        type="button"
        className="vo-text-button"
        onClick={() => {
          try {
            localStorage.setItem(`vowel:${siteId}:${kind}`, "seen");
          } catch {}
          setMessage("");
        }}
      >
        Lovely, thank you
      </button>
    </aside>
  ) : null;
}
function OperatorReviews() {
  type Item = { id: string; slug: string; kind: string; detail: string };
  const [data, setData] = useState<{
      items: Item[];
      failedJobs: { id: string; kind: string; site_id: string }[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void api<{
      items: Item[];
      failedJobs: { id: string; kind: string; site_id: string }[];
    }>("/operator/reviews")
      .then(setData)
      .catch((caught) => setError(caught.message));
  }, []);
  return (
    <section>
      <h2>Sites needing a look</h2>
      {error && <p role="alert">{error}</p>}
      {data && !data.items.length && <p>No open support notes.</p>}
      {data?.items.map((item) => (
        <article className="vo-plan-stage" key={item.id}>
          <h3>
            {item.slug} · {item.kind.replaceAll("_", " ")}
          </h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{item.detail}</p>
          <button
            type="button"
            className="vo-text-button"
            onClick={() =>
              void api("/operator/reviews", { id: item.id })
                .then(() =>
                  setData({
                    ...data,
                    items: data.items.filter((value) => value.id !== item.id),
                  }),
                )
                .catch((caught) => setError(caught.message))
            }
          >
            Mark reviewed
          </button>
        </article>
      ))}
      {data?.failedJobs.length ? (
        <>
          <h3>Background work needing help</h3>
          {data.failedJobs.map((job) => (
            <p key={job.id}>
              {job.kind} · {job.site_id}
            </p>
          ))}
        </>
      ) : null}
    </section>
  );
}
export function Dashboard({
  user,
  sites,
  capabilities,
  onSites,
}: {
  user: User;
  sites: Site[];
  capabilities: Capabilities;
  onSites: (sites: Site[]) => void;
}) {
  const [siteId, setSiteId] = useState(
      new URLSearchParams(window.location.search).get("site") ||
        sites[0]?.id ||
        "",
    ),
    [tab, setTab] = useState(
      new URLSearchParams(window.location.search).get("tab") || "site",
    ),
    [token, setToken] = useState(""),
    [error, setError] = useState("");
  const site = sites.find((s) => s.id === siteId) || sites[0];
  const [openedAt] = useState(() => Date.now());
  const selectedSiteId = site?.id;
  useEffect(() => {
    if (!selectedSiteId) return;
    let active = true;
    setToken("");
    void api<{ token: string }>(`/sites/${selectedSiteId}/teacher-session`, {})
      .then((value) => {
        if (active) setToken(value.token);
      })
      .catch((caught) => {
        if (active) setError(caught.message);
      });
    return () => {
      active = false;
    };
  }, [selectedSiteId]);
  const updateSite = (next: Site) =>
    onSites(sites.map((current) => (current.id === next.id ? next : current)));
  const address = site
    ? BOOT.baseDomain
      ? `https://${site.slug}.${BOOT.baseDomain}/`
      : `${window.location.origin}/t/${site.id}/`
    : "";
  if (!site)
    return (
      <section className="vo-prose">
        <h1>A place with your name on it.</h1>
        <p>Make your teaching site, then bring your students.</p>
        <a className="vo-button" href="/start/">
          Make my site
        </a>
      </section>
    );
  return (
    <div className="vo-dashboard">
      <aside className="vo-dashboard-nav">
        <p className="vo-eyebrow">Your place</p>
        <h1>{site.shortName || user.name || "Hello"}.</h1>
        {sites.length > 1 && (
          <Field label="Teaching site">
            <select
              value={site.id}
              onChange={(event) => setSiteId(event.target.value)}
            >
              {sites.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.brand || value.name || "New site"}
                </option>
              ))}
            </select>
          </Field>
        )}
        <nav aria-label="Your dashboard">
          {[
            ["site", "Your site"],
            ["teaching", "Your teaching"],
            ["students", "Your students"],
            ["curriculum", "Lesson plans"],
            ["paid", "Get paid"],
            ["billing", "Vowel billing"],
            ["help", "A little help"],
          ].map(([id, name]) => (
            <button
              type="button"
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              {name}
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </nav>
        <a href={address} target="_blank" rel="noreferrer">
          {site.publishedAt ? "Open your site" : "Preview your site"}{" "}
          <span aria-hidden="true">↗</span>
        </a>
        <small>
          {site.publishedAt
            ? site.billing === "active"
              ? "Your subscription is active."
              : site.billing === "exempt"
                ? "Your place is free."
                : site.trialEndsAt! > openedAt
                  ? `Trial ends ${new Date(site.trialEndsAt!).toLocaleDateString("en-GB")}`
                  : "New bookings are paused. Existing lessons stay available."
            : "Your site is still a draft."}
        </small>
        <button
          type="button"
          className="vo-text-button"
          onClick={() =>
            void api("/auth/logout", {}).then(
              () => (window.location.href = "/"),
            )
          }
        >
          Sign out
        </button>
      </aside>
      <main className="vo-dashboard-body">
        <Milestones key={site.id} siteId={site.id} token={token} />
        {!site.publishedAt && (
          <aside className="vo-notice">
            Your answers are saved.{" "}
            <a href={`/start/?site=${site.id}`}>
              Finish your setup and open your site.
            </a>
          </aside>
        )}
        {error && (
          <p role="alert" className="vo-error">
            {error}
          </p>
        )}
        {tab === "site" ? (
          <>
            <SiteSettings
              key={site.id}
              initial={site}
              onPublished={updateSite}
            />
            <Domains site={site} enabled={capabilities.domains} />
          </>
        ) : tab === "teaching" ? (
          <section>
            <p className="vo-eyebrow">The working day</p>
            <h2>A diary, with your students beside it.</h2>
            <p>
              Open your teaching page for your timetable, days off, student
              dashboards, lesson notes, homework and payment records.
            </p>
            <a
              className="vo-button vo-button-large"
              href={`/t/${site.id}/schedule/`}
            >
              Open my teaching page <span aria-hidden="true">↗</span>
            </a>
          </section>
        ) : tab === "students" ? (
          token ? (
            <StudentImport key={site.id} site={site} token={token} />
          ) : (
            <p role="status">Opening your students…</p>
          )
        ) : tab === "curriculum" ? (
          token ? (
            <Curriculum key={site.id} site={site} token={token} />
          ) : (
            <p role="status">Opening your lesson plans…</p>
          )
        ) : tab === "paid" ? (
          <GetPaid site={site} onSite={updateSite} />
        ) : tab === "billing" ? (
          <Billing site={site} />
        ) : (
          <>
            <Help site={site} />
            {capabilities.operator && <OperatorReviews />}
          </>
        )}
      </main>
    </div>
  );
}
