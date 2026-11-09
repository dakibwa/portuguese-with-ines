import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { api, BOOT } from "./runtime";
import type { Me, Site } from "./types";
import { Field, Onboarding } from "./onboarding";
import { Dashboard } from "./dashboard";
import "./platform.css";

function GoogleButton({
  onSignedIn,
  onError,
}: {
  onSignedIn: () => void;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    signed = useRef(onSignedIn),
    error = useRef(onError);
  useEffect(() => {
    signed.current = onSignedIn;
    error.current = onError;
  }, [onSignedIn, onError]);
  useEffect(() => {
    if (!BOOT.googleClientId) return;
    let active = true;
    const ready = () => {
      if (!active || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: BOOT.googleClientId,
        callback: (response) =>
          void api("/auth/google", { credential: response.credential })
            .then(() => signed.current())
            .catch((caught) => error.current(caught.message)),
      });
      window.google.accounts.id.renderButton(ref.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 350,
      });
    };
    if (window.google?.accounts?.id) ready();
    else {
      let script = document.querySelector<HTMLScriptElement>(
        'script[src="https://accounts.google.com/gsi/client"]',
      );
      if (!script) {
        script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", ready);
    }
    return () => {
      active = false;
    };
  }, []);
  return BOOT.googleClientId ? (
    <div ref={ref} className="vo-google-button" />
  ) : null;
}
function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (challenge) {
        await api("/auth/confirm", { challengeId: challenge, code });
        onSignedIn();
      } else {
        const value = await api<{ challengeId: string }>("/auth/code", {
          email,
        });
        setChallenge(value.challengeId);
        setRetryAt(Date.now() + 60000);
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="vo-sign-in">
      <div className="vo-sign-in-copy">
        <p className="vo-eyebrow">Your name on the door.</p>
        <h1>
          A little place.
          <br />A good beginning.
        </h1>
        <p>
          Make a home for your teaching.
          <br />
          Bring your students when you’re ready.
        </p>
        <span className="vo-sign-in-mark" aria-hidden="true">
          ê
        </span>
      </div>
      <section className="vo-sign-in-form">
        <p className="vo-eyebrow">Hello, teacher.</p>
        <h2>{challenge ? "Check your email." : "Come on in."}</h2>
        <p>
          {challenge
            ? `We've sent a six-digit code to ${email}. It works for ten minutes.`
            : "No password to remember. Just your email, or your Google account."}
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <Field label={challenge ? "Your sign-in code" : "Your email"}>
            {challenge ? (
              <input
                key="code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
              />
            ) : (
              <input
                key="email"
                autoComplete="email"
                type="email"
                maxLength={254}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="vo-error">
              {error}
            </p>
          )}
          <button
            className="vo-button vo-button-wide"
            disabled={busy}
            type="submit"
          >
            {busy
              ? "One moment…"
              : challenge
                ? "Open my place"
                : "Email me a code"}
          </button>
        </form>
        {challenge ? (
          <div className="vo-sign-in-secondary">
            <button
              type="button"
              className="vo-text-button"
              disabled={now < retryAt}
              onClick={() => {
                setChallenge("");
                setCode("");
                setError("");
              }}
            >
              Use another email
            </button>
            <button
              type="button"
              className="vo-text-button"
              disabled={now < retryAt || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const value = await api<{ challengeId: string }>(
                    "/auth/code",
                    { email },
                  );
                  setChallenge(value.challengeId);
                  setRetryAt(Date.now() + 60000);
                } catch (caught) {
                  setError((caught as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {now < retryAt
                ? `Send again in ${Math.ceil((retryAt - now) / 1000)}s`
                : "Send a new code"}
            </button>
          </div>
        ) : (
          <GoogleButton onSignedIn={onSignedIn} onError={setError} />
        )}
        <p className="vo-hint">
          By continuing, you agree to Vowel’s <a href="/terms/">terms</a> and
          have read the <a href="/privacy/">privacy information</a>.
        </p>
      </section>
    </main>
  );
}
function App() {
  const [me, setMe] = useState<Me | null>(null),
    [site, setSite] = useState<Site | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const loading = useRef(false);
  useEffect(() => {
    let active = true;
    loading.current = false;
    void api<Me>("/me")
      .then((value) => {
        if (active) setMe(value);
      })
      .catch((caught) => {
        if (active) setError(caught.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!me?.user || BOOT.page !== "/start/" || site || loading.current) return;
    loading.current = true;
    let active = true;
    const wanted = new URLSearchParams(window.location.search).get("site"),
      existing = wanted
        ? me.sites.find((value) => value.id === wanted)
        : me.sites.find((value) => value.state === "draft");
    if (existing) {
      setSite(existing);
      return;
    }
    void api<{ site: Site }>("/sites", {})
      .then((value) => {
        if (active) setSite(value.site);
      })
      .catch((caught) => {
        if (active) setError(caught.message);
      })
      .finally(() => {
        loading.current = false;
      });
    return () => {
      active = false;
    };
  }, [me, site]);
  if (error)
    return (
      <main className="vo-prose">
        <h1>A moment to try again.</h1>
        <p role="alert" className="vo-error">
          {error}
        </p>
        <button
          type="button"
          className="vo-button"
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </button>
      </main>
    );
  if (!me)
    return (
      <p role="status" className="vo-loading">
        Opening your place…
      </p>
    );
  if (!me.user)
    return <SignIn onSignedIn={() => setAttempt((value) => value + 1)} />;
  if (BOOT.page === "/start/")
    return site ? (
      <main>
        <Onboarding initial={site} />
      </main>
    ) : (
      <p role="status" className="vo-loading">
        Making room for your site…
      </p>
    );
  return (
    <Dashboard
      user={me.user}
      sites={me.sites}
      capabilities={me.capabilities}
      onSites={(sites) => setMe({ ...me, sites })}
    />
  );
}
const root = document.getElementById("vowel-platform");
if (root) createRoot(root).render(<App />);
