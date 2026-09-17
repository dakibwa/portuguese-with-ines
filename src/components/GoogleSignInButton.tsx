"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID } from "@/lib/config";
import { browserTimeZone } from "@/lib/booking-api";
import { signInWithGoogle, storeSession, type Student } from "@/lib/auth-api";

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Google's own maximum for a rendered button. */
const MAX_BUTTON_WIDTH = 400;

function loadGoogleScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google sign-in could not load.")));
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in could not load."));
    document.head.appendChild(script);
  });
}

/**
 * Google's own button, sat inside her coral frame.
 *
 * An earlier version drew our own coral button and held Google's invisibly on
 * top of it — seen here, clicked there. It measured as fully covered in a test
 * and was still broken in front of people, for two reasons worth keeping.
 *
 * The button was hidden with `display: none` until Google had rendered, so at
 * render time it had no width; Google fell back to 320px, and the code meant to
 * scale it over the 394px face measured zero and silently did nothing. The
 * result was a button whose bottom 20px and right 74px did nothing at all while
 * looking entirely pressable — which is exactly what "it isn't working" feels
 * like when you click the wrong half of it.
 *
 * The deeper reason is that there is nothing stable to pin to. Google renders a
 * button into this page and then, once it knows the visitor's session, replaces
 * it with a cross-origin iframe of a different size. Anything anchored to the
 * first one is wrong by the time the second arrives.
 *
 * So the button below is Google's, visible and untouched, and all that is ours
 * is the frame around it — which is where the coral goes. A frame that centres
 * whatever turns up survives the swap. The ID token, and the Worker's
 * verification of it, are unchanged.
 */
export function GoogleSignInButton({
  onSignedIn,
  onError
}: {
  onSignedIn: (student: Student) => void;
  onError: (message: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(false);

  // Callers pass inline functions, so their identity changes on every parent
  // render. Read through refs, the effect below runs once: re-running it
  // re-initialised Google's client and redrew the button each time.
  const onSignedInRef = useRef(onSignedIn);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSignedInRef.current = onSignedIn;
    onErrorRef.current = onError;
  });

  const handleCredential = useCallback(async (credential: string) => {
    try {
      const result = await signInWithGoogle(credential, browserTimeZone());
      storeSession(result.session);
      onSignedInRef.current(result.student);
    } catch (caught) {
      onErrorRef.current(caught instanceof Error ? caught.message : "That Google sign-in didn't work.");
    }
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;
    let lastWidth = 0;
    let resizes: ResizeObserver | null = null;

    /**
     * Google sizes its button in pixels and will not take a percentage, so the
     * width has to be measured and handed over — and handed over again when the
     * column changes, or the button sits narrower than the frame around it.
     */
    function draw() {
      if (cancelled || !holder.current || !frame.current || !window.google?.accounts?.id) return;

      const inner = frame.current.clientWidth - 8;
      const width = Math.min(MAX_BUTTON_WIDTH, Math.floor(inner) || 320);
      // Re-rendering on every observed pixel would thrash a cross-origin iframe.
      if (Math.abs(width - lastWidth) < 4) return;
      lastWidth = width;

      holder.current.replaceChildren();
      window.google.accounts.id.renderButton(holder.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        // Rounded ends sit inside a rounded frame; a rectangle inside it looks
        // like two shapes that were not designed together.
        shape: "pill",
        logo_alignment: "center",
        width
      });
      setAvailable(true);
    }

    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            void handleCredential(response.credential);
          }
        });

        draw();

        if (frame.current) {
          resizes = new ResizeObserver(draw);
          resizes.observe(frame.current);
        }
      })
      .catch(() => {
        // Blocked or offline. The password form is right there.
      });

    return () => {
      cancelled = true;
      resizes?.disconnect();
    };
  }, [handleCredential]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className={available ? "google-signin" : "google-signin is-loading"}>
      {/* Hidden with visibility rather than display: the frame has to have a
          width before Google will render into it, and reserving the height
          stops the card jumping when the button arrives. */}
      <div className="google-signin__frame" ref={frame}>
        <div ref={holder} />
      </div>
      {available ? (
        <p className="google-signin__divider">
          <span>or</span>
        </p>
      ) : null}
    </div>
  );
}
