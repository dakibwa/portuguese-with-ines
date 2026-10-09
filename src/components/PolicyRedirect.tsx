"use client";

import { useEffect } from "react";
import Link from "next/link";
import { publicAssetPath } from "@/lib/paths";

// Cloudflare handles these old URLs. The static preview preserves fragments too;
// the ordinary link remains usable without JavaScript.
export function PolicyRedirect({ section }: { section?: "booking" | "privacy" }) {
  const destination = `/book/#${section ?? "terms-privacy"}`;

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const target = ["terms-privacy", "booking", "privacy", "change-booking"].includes(hash) ? `/book/#${hash}` : destination;
    window.location.replace(publicAssetPath(target));
  }, [destination]);

  return (
    <>
      <main className="policy-redirect" id="main-content">
        <h1>Terms &amp; privacy</h1>
        <p><Link href={destination}>Read the terms &amp; privacy</Link>.</p>
      </main>
    </>
  );
}
