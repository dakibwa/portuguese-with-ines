import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  isValidElement,
  cloneElement,
  type ReactNode,
} from "react";
import QRCode from "qrcode";
import { api, BOOT } from "./runtime";
import type { Site, Lesson, Rules } from "./types";
import { LAYOUTS, PALETTES } from "../../workers/vowel/model.mjs";
import {
  documentShell,
  siteMarkup,
  ruleSentences,
} from "../../workers/vowel/site-render.mjs";
import palettes from "../../workers/vowel/palettes.json";

export const languageOptions = [
  ["en", "English", "Hello"],
  ["pt-PT", "European Portuguese", "Olá"],
  ["pt-BR", "Brazilian Portuguese", "Olá"],
  ["es", "Spanish", "Hola"],
  ["fr", "French", "Bonjour"],
  ["de", "German", "Hallo"],
  ["it", "Italian", "Ciao"],
  ["el", "Greek", "Γεια σας"],
  ["ja", "Japanese", "こんにちは"],
  ["zh", "Mandarin", "你好"],
  ["ar", "Arabic", "مرحباً"],
  ["hi", "Hindi", "नमस्ते"],
];
const money = (site: Site, value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: site.place.currency,
    maximumFractionDigits: value % 100 ? 2 : 0,
  }).format(value / 100);
const label = (id: string) =>
  id === "play" ? "Playground" : id[0].toUpperCase() + id.slice(1);
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const labelId = useId();
  const control =
    isValidElement<Record<string, unknown>>(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type)
      ? cloneElement(children, { "aria-labelledby": labelId })
      : children;
  return (
    <label className="vo-field">
      <span id={labelId}>{label}</span>
      {control}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function editable(site: Site) {
  return {
    name: site.name,
    shortName: site.shortName,
    brand: site.brand,
    language: site.language,
    place: site.place,
    look: site.look,
    source: site.source,
    content: site.content,
    lessons: site.lessons,
    hours: site.hours,
    rules: site.rules,
    features: site.features,
    contact: site.contact,
    slug: site.slug,
    step: site.step,
  };
}
export function useSiteDraft(initial: Site) {
  const [site, setSite] = useState(initial),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const latest = useRef(initial),
    version = useRef(initial.version),
    saved = useRef(JSON.stringify(editable(initial))),
    flight = useRef<Promise<void> | null>(null);
  const change = useCallback((patch: Partial<Site>) => {
    latest.current = { ...latest.current, ...patch };
    setSite(latest.current);
  }, []);
  const replace = useCallback((next: Site) => {
    latest.current = next;
    version.current = next.version;
    saved.current = JSON.stringify(editable(next));
    setSite(next);
  }, []);
  const flush = useCallback(async () => {
    if (flight.current) {
      await flight.current;
      return;
    }
    const job = async () => {
      setError("");
      setSaving(true);
      try {
        while (JSON.stringify(editable(latest.current)) !== saved.current) {
          const input = editable(latest.current),
            snapshot = JSON.stringify(input);
          const response = await api<{ site: Site }>(
            `/sites/${latest.current.id}`,
            { ...input, version: version.current },
            "PATCH",
          );
          version.current = response.site.version;
          saved.current = snapshot;
          latest.current = { ...latest.current, version: version.current };
          setSite(latest.current);
        }
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "Your changes couldn't be saved.";
        setError(message);
        throw caught;
      } finally {
        setSaving(false);
      }
    };
    flight.current = job();
    try {
      await flight.current;
    } finally {
      flight.current = null;
    }
  }, []);
  useEffect(() => {
    if (JSON.stringify(editable(site)) === saved.current) return;
    const timer = window.setTimeout(() => void flush().catch(() => {}), 600);
    return () => window.clearTimeout(timer);
  }, [site, flush]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(editable(latest.current)) !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  return { site, change, replace, flush, error, saving, current: latest };
}
export function Preview({ site }: { site: Site }) {
  const [phone, setPhone] = useState(false),
    [width, setWidth] = useState(600);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const base = phone ? 390 : 1280,
    zoom = Math.min(width / base, 1);
  const html = documentShell({
    title: site.brand || "Your site",
    content: siteMarkup(site, `/t/${site.id}`, "home", true),
    css: `${window.location.origin}/assets/teaching.css`,
    privatePage: true,
  });
  return (
    <aside className="vo-preview">
      <div className="vo-preview-tools">
        <span>Your site, as you go.</span>
        <div role="group" aria-label="Preview width">
          <button
            type="button"
            aria-pressed={!phone}
            onClick={() => setPhone(false)}
          >
            Desktop
          </button>
          <button
            type="button"
            aria-pressed={phone}
            onClick={() => setPhone(true)}
          >
            Phone
          </button>
        </div>
      </div>
      <div
        className="vo-preview-frame"
        ref={frame}
        style={{ height: Math.min((phone ? 1000 : 1050) * zoom, 800) }}
      >
        <iframe
          title="Your teaching site preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          style={{
            width: base,
            height: phone ? 1000 : 1050,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        />
      </div>
      <p className="vo-preview-note">
        Your words. Your look. The same pages your students will see.
      </p>
    </aside>
  );
}
export function PortraitUpload({
  site,
  beforeUpload,
  onUploaded,
  onBusy,
}: {
  site: Site;
  beforeUpload: () => Promise<void>;
  onUploaded: (site: Site) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 20 * 1024 * 1024
      )
        throw new Error(
          "Choose a JPEG, PNG or WebP portrait smaller than 20 MB.",
        );
      const bitmap = await createImageBitmap(file);
      let data = "";
      try {
        if (bitmap.width * bitmap.height > 64000000)
          throw new Error("Choose a smaller portrait.");
        const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height)),
          canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Your browser couldn't open that photo.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        data = canvas.toDataURL("image/jpeg", 0.82);
      } finally {
        bitmap.close();
      }
      if (data.length > 680000)
        throw new Error(
          "That portrait is still too large. Try a smaller copy.",
        );
      await beforeUpload();
      // Read the current version after any queued text edits were saved.
      const latest = await api<{ site: Site }>(`/sites/${site.id}`);
      const response = await api<{ site: Site }>(`/sites/${site.id}/photo`, {
        version: latest.site.version,
        data,
      });
      onUploaded(response.site);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <div className="vo-portrait-upload">
      {site.photo && (
        <img
          src={site.photo.asset}
          alt={site.photo.alt}
          width="100"
          height="125"
        />
      )}
      <label className="vo-button vo-button-secondary">
        {busy
          ? "Preparing your portrait…"
          : site.photo
            ? "Change your portrait"
            : "Add your portrait"}
        <input
          className="vo-sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </label>
      <small>
        Optional. For your own teaching site. We resize it and leave your face
        alone.
      </small>
      {error && (
        <p role="alert" className="vo-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function LookPicker({
  site,
  onChange,
}: {
  site: Site;
  onChange: (look: Site["look"]) => void;
}) {
  return (
    <>
      <div className="vo-look-picker" role="group" aria-label="Site layout">
        {LAYOUTS.map((id) => (
          <button
            type="button"
            key={id}
            aria-pressed={site.look.layout === id}
            className={`vo-look-choice vo-look-${id}`}
            onClick={() => onChange({ ...site.look, layout: id })}
          >
            <span>{label(id)}</span>
            <small>
              {
                [
                  "Painted and personal",
                  "A dictionary of your own",
                  "Clear, bold, considered",
                  "A note from somewhere",
                  "A little room for play",
                  "Quiet, with room to breathe",
                  "The printed page",
                  "Something worth saying",
                  "A personal introduction",
                  "A place to grow",
                ][LAYOUTS.indexOf(id)]
              }
            </small>
          </button>
        ))}
      </div>
      <p className="vo-subheading">And a little colour.</p>
      <div className="vo-palette-picker" role="group" aria-label="Site colours">
        {PALETTES.map((id) => {
          const p = palettes[id as keyof typeof palettes];
          return (
            <button
              type="button"
              key={id}
              aria-label={label(id)}
              title={label(id)}
              aria-pressed={site.look.palette === id}
              onClick={() => onChange({ ...site.look, palette: id })}
            >
              <span style={{ background: p.ground }} />
              <span style={{ background: p.brand }} />
              <span style={{ background: p.pop }} />
              <small>{label(id)}</small>
            </button>
          );
        })}
      </div>
    </>
  );
}
export function LessonEditor({
  site,
  onChange,
}: {
  site: Site;
  onChange: (lessons: Lesson[]) => void;
}) {
  const change = (index: number, patch: Partial<Lesson>) =>
    onChange(
      site.lessons.map((lesson, i) =>
        i === index ? { ...lesson, ...patch } : lesson,
      ),
    );
  return (
    <>
      <p className="vo-hint">
        Starter amounts, for you to change. Prices are in {site.place.currency}.
      </p>
      <div className="vo-lesson-editor">
        {site.lessons.map((lesson, index) => (
          <fieldset className="vo-lesson-edit" key={lesson.id}>
            <legend>Lesson {index + 1}</legend>
            <Field label="Name">
              <input
                value={lesson.name}
                maxLength={100}
                onChange={(event) =>
                  change(index, { name: event.target.value })
                }
              />
            </Field>
            <div className="vo-two-fields">
              <Field label="Minutes">
                <input
                  type="number"
                  min={15}
                  max={240}
                  value={lesson.durationMinutes}
                  onChange={(event) =>
                    change(index, {
                      durationMinutes: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label={`Price · ${site.place.currency}`}>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step="0.50"
                  value={lesson.priceCents / 100}
                  onChange={(event) =>
                    change(index, {
                      priceCents: Math.round(Number(event.target.value) * 100),
                    })
                  }
                />
              </Field>
            </div>
            <div className="vo-inline-checks">
              <label>
                <input
                  type="checkbox"
                  checked={lesson.firstLessonOnly}
                  onChange={(event) =>
                    change(index, {
                      firstLessonOnly: event.target.checked,
                      canRepeat: event.target.checked
                        ? false
                        : lesson.canRepeat,
                    })
                  }
                />{" "}
                First lesson only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={lesson.canRepeat}
                  disabled={lesson.firstLessonOnly}
                  onChange={(event) =>
                    change(index, { canRepeat: event.target.checked })
                  }
                />{" "}
                Can repeat weekly
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={lesson.active}
                  onChange={(event) =>
                    change(index, { active: event.target.checked })
                  }
                />{" "}
                Offered
              </label>
            </div>
            {site.lessons.length > 1 && (
              <button
                className="vo-text-button"
                type="button"
                onClick={() =>
                  onChange(site.lessons.filter((_, i) => i !== index))
                }
              >
                Remove this lesson
              </button>
            )}
          </fieldset>
        ))}
      </div>
      {site.lessons.length < 6 && (
        <button
          type="button"
          className="vo-button vo-button-secondary"
          onClick={() =>
            onChange([
              ...site.lessons,
              {
                id: `lesson-${crypto.randomUUID().slice(0, 8)}`,
                name: "Lesson",
                durationMinutes: 60,
                priceCents: 2500,
                active: true,
                firstLessonOnly: false,
                canRepeat: true,
              },
            ])
          }
        >
          Add a lesson
        </button>
      )}
    </>
  );
}
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const time = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function WeekEditor({
  site,
  onChange,
}: {
  site: Site;
  onChange: (hours: Site["hours"]) => void;
}) {
  const presets = (kind: string) => {
    const days = kind === "weekends" ? [0, 6] : [1, 2, 3, 4, 5];
    onChange(
      days.map((weekday) => ({
        weekday,
        startMinute: kind === "evenings" ? 17 * 60 : 9 * 60,
        endMinute:
          kind === "evenings"
            ? 20 * 60
            : kind === "mornings"
              ? 12 * 60
              : 17 * 60,
      })),
    );
  };
  return (
    <>
      <p className="vo-hint">
        Choose when a lesson may start. Times use{" "}
        {site.place.timeZone.replaceAll("_", " ")}.
      </p>
      <div className="vo-preset-row">
        {["mornings", "evenings", "weekends"].map((p) => (
          <button
            type="button"
            key={p}
            className="vo-chip"
            onClick={() => presets(p)}
          >
            {label(p)}
          </button>
        ))}
      </div>
      <div className="vo-week-editor">
        {DAYS.map((day, index) => {
          const weekday = (index + 1) % 7,
            entry = site.hours.find((h) => h.weekday === weekday);
          const update = (patch: Partial<Site["hours"][number]>) =>
            onChange(
              site.hours.map((h) => (h === entry ? { ...h, ...patch } : h)),
            );
          return (
            <div className="vo-week-day" key={day}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(entry)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [
                            ...site.hours,
                            {
                              weekday,
                              startMinute: 9 * 60,
                              endMinute: 17 * 60,
                            },
                          ]
                        : site.hours.filter((h) => h.weekday !== weekday),
                    )
                  }
                />
                <span>{day}</span>
              </label>
              {entry ? (
                <>
                  <label>
                    <span className="vo-sr-only">{day} first start</span>
                    <input
                      type="time"
                      value={time(entry.startMinute)}
                      onChange={(event) => {
                        const [hour, minute] = event.target.value
                          .split(":")
                          .map(Number);
                        update({ startMinute: hour * 60 + minute });
                      }}
                    />
                  </label>
                  <span>to</span>
                  <label>
                    <span className="vo-sr-only">{day} last start</span>
                    <input
                      type="time"
                      value={time(entry.endMinute)}
                      onChange={(event) => {
                        const [hour, minute] = event.target.value
                          .split(":")
                          .map(Number);
                        update({ endMinute: hour * 60 + minute });
                      }}
                    />
                  </label>
                </>
              ) : (
                <small>A day off</small>
              )}
            </div>
          );
        })}
      </div>
      <p className="vo-hint">
        First and last lesson starts. You can fine-tune your timetable and days
        off from your teaching page.
      </p>
    </>
  );
}
export function RuleEditor({
  site,
  onChange,
}: {
  site: Site;
  onChange: (rules: Rules) => void;
}) {
  const r = site.rules,
    change = (patch: Partial<Rules>) => onChange({ ...r, ...patch });
  return (
    <>
      <div className="vo-rule-paragraph">
        Students book at least{" "}
        <label>
          <span className="vo-sr-only">Booking notice in hours</span>
          <input
            type="number"
            min={0}
            max={72}
            value={r.noticeHours}
            onChange={(event) =>
              change({ noticeHours: Number(event.target.value) })
            }
          />
        </label>{" "}
        hours ahead, up to{" "}
        <label>
          <span className="vo-sr-only">Booking horizon in days</span>
          <input
            type="number"
            min={7}
            max={365}
            value={r.horizonDays}
            onChange={(event) =>
              change({ horizonDays: Number(event.target.value) })
            }
          />
        </label>{" "}
        days ahead. Leave{" "}
        <label>
          <span className="vo-sr-only">Gap after each lesson in minutes</span>
          <input
            type="number"
            min={0}
            max={120}
            step={5}
            value={r.bufferMinutes}
            onChange={(event) =>
              change({ bufferMinutes: Number(event.target.value) })
            }
          />
        </label>{" "}
        minutes after each lesson. A late change costs{" "}
        <label>
          <span className="vo-sr-only">Late change fee</span>
          <input
            type="number"
            min={0}
            step="0.50"
            value={r.lateFeeCents / 100}
            onChange={(event) =>
              change({
                lateFeeCents: Math.round(Number(event.target.value) * 100),
              })
            }
          />
        </label>{" "}
        {site.place.currency}.
      </div>
      <div className="vo-two-fields">
        <Field label="A missed lesson costs">
          <select
            value={r.noShow}
            onChange={(event) =>
              change({ noShow: event.target.value as Rules["noShow"] })
            }
          >
            <option value="none">Nothing</option>
            <option value="fixed">A fixed fee</option>
            <option value="full">The lesson price</option>
          </select>
        </Field>
        {r.noShow === "fixed" && (
          <Field label={`Missed lesson fee · ${site.place.currency}`}>
            <input
              type="number"
              min={0}
              step="0.50"
              value={r.noShowCents / 100}
              onChange={(event) =>
                change({
                  noShowCents: Math.round(Number(event.target.value) * 100),
                })
              }
            />
          </Field>
        )}
      </div>
      <div className="vo-two-fields">
        <Field label="Lesson start intervals">
          <select
            value={r.intervalMinutes}
            onChange={(event) =>
              change({ intervalMinutes: Number(event.target.value) })
            }
          >
            {[5, 10, 15, 20, 30, 60].map((value) => (
              <option key={value} value={value}>
                {value} minutes
              </option>
            ))}
          </select>
        </Field>
        <Field label="How students pay">
          <select
            value={r.paymentMode}
            onChange={(event) =>
              change({
                paymentMode: event.target.value as Rules["paymentMode"],
              })
            }
          >
            <option value="manual">Pay me directly</option>
            <option value="card" disabled={!site.stripeReady}>
              Card after each lesson
            </option>
            <option value="both" disabled={!site.stripeReady}>
              Direct payment or card
            </option>
          </select>
        </Field>
      </div>
      {!site.stripeReady && (
        <p className="vo-hint">
          Students pay you directly to start with. Connect Stripe from your
          dashboard when you’re ready to take cards.
        </p>
      )}
      <details className="vo-terms-preview">
        <summary>What your students will read</summary>
        {ruleSentences(site).map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </details>
      <p className="vo-hint">
        These rules apply to new bookings. Existing bookings keep their own
        terms.
      </p>
    </>
  );
}
export function LivePanel({ site }: { site: Site }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  const url = BOOT.baseDomain
    ? `https://${site.slug}.${BOOT.baseDomain}/`
    : `${window.location.origin}/t/${site.id}/`;
  const [qr, setQr] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, {
      width: 180,
      margin: 1,
      color: { dark: "#0e6b4c", light: "#ffffff" },
    }).then((value) => {
      if (active) setQr(value);
    });
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <section className="vo-live">
      <div className="vo-milestone-mark" aria-hidden="true">
        <img src="/assets/icon.svg" alt="" width="70" height="70" />
      </div>
      <p className="vo-eyebrow">The door is open.</p>
      <h1>Your site is live.</h1>
      <a className="vo-live-url" href={url} target="_blank" rel="noreferrer">
        {url.replace(/^https?:\/\//, "")}
      </a>
      <p>30 days free, starting today. No card needed yet.</p>
      <div className="vo-actions">
        <button
          type="button"
          className="vo-button"
          onClick={() =>
            void navigator.clipboard.writeText(url).then(() => setCopied(true))
          }
        >
          {copied ? "Copied" : "Copy your link"}
        </button>
        <a
          className="vo-button vo-button-secondary"
          href={`https://wa.me/?text=${encodeURIComponent(`My language lessons have a new home: ${url}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          Share on WhatsApp
        </a>
      </div>
      {qr && (
        <figure>
          <img
            src={qr}
            alt="QR code for your teaching site"
            width="180"
            height="180"
          />
          <figcaption>Scan to open your site.</figcaption>
        </figure>
      )}
      <a
        className="vo-button vo-button-large"
        href={`/dashboard/?site=${site.id}`}
      >
        Open your dashboard <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
export function Onboarding({ initial }: { initial: Site }) {
  const draft = useSiteDraft(initial),
    { site, change, replace, flush, current } = draft;
  const [step, setStep] = useState(Math.min(initial.step, 6)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [live, setLive] = useState<Site | null>(null),
    [address, setAddress] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const stepStartedAt = useRef(0);
  useEffect(() => {
    stepStartedAt.current = Date.now();
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (step !== 6) return;
    const timer = window.setTimeout(
      () =>
        void api<{ available: boolean }>(
          `/sites/${site.id}/address?slug=${encodeURIComponent(site.slug)}`,
        )
          .then((result) =>
            setAddress(
              result.available
                ? "That address is yours to use."
                : "That address is already in use.",
            ),
          )
          .catch((caught) => setAddress(caught.message)),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [step, site.id, site.slug]);
  if (live) return <LivePanel site={live} />;
  const next = async () => {
    setError("");
    setBusy(true);
    try {
      change({ step: Math.min(step + 1, 6) });
      await flush();
      void api(`/sites/${site.id}/progress`, {
        step,
        durationMs: Math.min(86400000, Date.now() - stepStartedAt.current),
      }).catch(() => {});
      setStep(Math.min(step + 1, 6));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      await flush();
      const result = await api<{ site: Site }>(`/sites/${site.id}/publish`, {
        version: current.current.version,
      });
      replace(result.site);
      setLive(result.site);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const title = [
    "What do you teach?",
    "Tell it in your own words.",
    "Try something on.",
    "Your lessons. Your prices.",
    "Make room in your week.",
    "Write your house rules.",
    "A name on the door.",
  ][step];
  return (
    <div className="vo-onboarding">
      <section className="vo-onboarding-form">
        <div className="vo-step-top">
          <a href="/dashboard/">Your dashboard</a>
          <span role="status">
            {draft.saving
              ? "Saving…"
              : draft.error
                ? "Not saved yet"
                : "Your answers save as you go."}
          </span>
        </div>
        <p className="vo-eyebrow">Make it yours · {step + 1} of 7</p>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <fieldset disabled={busy} className="vo-step-fields">
          {step === 0 ? (
            <>
              <Field label="Your name">
                <input
                  autoComplete="name"
                  value={site.name}
                  maxLength={100}
                  onChange={(event) =>
                    change({
                      name: event.target.value,
                      shortName: event.target.value.split(" ")[0],
                    })
                  }
                />
              </Field>
              <Field label="What you teach">
                <select
                  value={site.language.code}
                  onChange={(event) => {
                    const chosen = languageOptions.find(
                      (language) => language[0] === event.target.value,
                    )!;
                    change({
                      language: {
                        name: chosen[1].replace(/^(European|Brazilian) /, ""),
                        variety: chosen[1],
                        code: chosen[0],
                        phrases: { hello: chosen[2], goodbye: "See you soon" },
                      },
                    });
                  }}
                >
                  <option value="">Choose a language</option>
                  {languageOptions.map((option) => (
                    <option key={option[0]} value={option[0]}>
                      {option[1]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="vo-inline-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={site.rules.online}
                    onChange={(event) =>
                      change({
                        rules: { ...site.rules, online: event.target.checked },
                      })
                    }
                  />{" "}
                  Online
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={site.rules.inPerson}
                    onChange={(event) =>
                      change({
                        rules: {
                          ...site.rules,
                          inPerson: event.target.checked,
                        },
                      })
                    }
                  />{" "}
                  In person
                </label>
              </div>
              <Field label="Your city">
                <input
                  value={site.place.city}
                  maxLength={80}
                  onChange={(event) =>
                    change({
                      place: { ...site.place, city: event.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Your time zone">
                <select
                  value={site.place.timeZone}
                  onChange={(event) =>
                    change({
                      place: { ...site.place, timeZone: event.target.value },
                    })
                  }
                >
                  {Intl.supportedValuesOf("timeZone").map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="vo-two-fields">
                <Field label="Your country">
                  <select
                    value={site.place.country}
                    onChange={(event) =>
                      change({
                        place: { ...site.place, country: event.target.value },
                      })
                    }
                  >
                    {[
                      ["GB", "United Kingdom"],
                      ["PT", "Portugal"],
                      ["US", "United States"],
                      ["IE", "Ireland"],
                      ["ES", "Spain"],
                      ["FR", "France"],
                      ["DE", "Germany"],
                      ["IT", "Italy"],
                      ["NL", "Netherlands"],
                      ["BE", "Belgium"],
                      ["CA", "Canada"],
                      ["AU", "Australia"],
                      ["BR", "Brazil"],
                      ["GR", "Greece"],
                      ["IN", "India"],
                      ["AE", "United Arab Emirates"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Your currency">
                  <select
                    value={site.place.currency}
                    onChange={(event) =>
                      change({
                        place: { ...site.place, currency: event.target.value },
                      })
                    }
                  >
                    {[
                      "GBP",
                      "EUR",
                      "USD",
                      "CAD",
                      "AUD",
                      "BRL",
                      "INR",
                      "AED",
                      "CHF",
                      "CNY",
                      "SEK",
                      "NOK",
                      "DKK",
                      "PLN",
                    ].map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <PortraitUpload
                site={site}
                beforeUpload={flush}
                onUploaded={replace}
                onBusy={setBusy}
              />
              <Field label="Your site's name, if you have one">
                <input
                  value={site.brand}
                  placeholder={`${site.language.name || "Languages"} with ${site.shortName || "you"}`}
                  onChange={(event) => change({ brand: event.target.value })}
                />
              </Field>
            </>
          ) : step === 1 ? (
            <>
              <Field label="Paste a bio, a profile or a few notes">
                <textarea
                  rows={7}
                  value={site.source}
                  maxLength={12000}
                  placeholder="What do you teach? Who do you teach? What does a good lesson with you feel like?"
                  onChange={(event) =>
                    change({
                      source: event.target.value,
                      content: { ...site.content, reviewed: false },
                    })
                  }
                />
              </Field>
              <button
                type="button"
                className="vo-button vo-button-secondary"
                disabled={!site.source.trim()}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await flush();
                    const result = await api<{ site: Site }>(
                      `/sites/${site.id}/draft`,
                      {},
                    );
                    replace(result.site);
                  } catch (caught) {
                    setError((caught as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Use my words
              </button>
              <Field label="Your page heading">
                <input
                  className={!site.content.reviewed ? "vo-drafted" : ""}
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
                  className={!site.content.reviewed ? "vo-drafted" : ""}
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
                  className={!site.content.reviewed ? "vo-drafted" : ""}
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
                I’ve read these words. They are accurate and sound like me.
              </label>
            </>
          ) : step === 2 ? (
            <LookPicker site={site} onChange={(look) => change({ look })} />
          ) : step === 3 ? (
            <LessonEditor
              site={site}
              onChange={(lessons) => change({ lessons })}
            />
          ) : step === 4 ? (
            <WeekEditor site={site} onChange={(hours) => change({ hours })} />
          ) : step === 5 ? (
            <RuleEditor site={site} onChange={(rules) => change({ rules })} />
          ) : (
            <>
              <Field label="Your free address">
                <div className="vo-address-field">
                  <input
                    value={site.slug}
                    onChange={(event) =>
                      change({
                        slug: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, ""),
                      })
                    }
                    minLength={3}
                    maxLength={40}
                  />
                  <span>
                    {BOOT.baseDomain
                      ? `.${BOOT.baseDomain}`
                      : " · your Vowel address"}
                  </span>
                </div>
              </Field>
              <p className="vo-hint" role="status">
                {address}
              </p>
              <div className="vo-launch-readthrough">
                <h2>A quick read before opening.</h2>
                <p>{site.brand || `${site.language.name} with ${site.name}`}</p>
                <p>
                  {site.rules.online ? "Online" : ""}
                  {site.rules.online && site.rules.inPerson ? " and " : ""}
                  {site.rules.inPerson ? `in ${site.place.city}` : ""}
                </p>
                <p>
                  {site.lessons
                    .filter((l) => l.active)
                    .map(
                      (l) =>
                        `${l.durationMinutes} minutes · ${money(site, l.priceCents)}`,
                    )
                    .join(" / ")}
                </p>
                <p>
                  {site.hours.length} teaching days · {site.place.timeZone}
                </p>
                <p>
                  {site.content.reviewed
                    ? "Your wording is reviewed."
                    : "Read and approve your wording before opening."}
                </p>
              </div>
              <p>
                30 days free from today. No card needed. After that, €25 a month
                with your agreement.
              </p>
            </>
          )}
        </fieldset>
        {(error || draft.error) && (
          <p className="vo-error" role="alert">
            {error || draft.error}
          </p>
        )}
        <div className="vo-step-actions">
          {step > 0 && (
            <button
              type="button"
              className="vo-text-button"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          {step < 6 ? (
            <button
              type="button"
              className="vo-button"
              disabled={busy}
              onClick={() => void next()}
            >
              Continue <span aria-hidden="true">→</span>
            </button>
          ) : (
            <button
              type="button"
              className="vo-button vo-button-large"
              disabled={busy}
              onClick={() => void publish()}
            >
              {busy
                ? "Opening…"
                : site.publishedAt
                  ? "Publish my changes"
                  : "Put my site live"}
            </button>
          )}
        </div>
      </section>
      <Preview site={site} />
    </div>
  );
}
