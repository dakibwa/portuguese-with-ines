"use client";

import { useEffect, useState } from "react";
import { AssetMark } from "@/components/BrandMarks";
import { BookingCalendar } from "@/components/BookingCalendar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BOOKING_CONFIGURED, CONTACT_WHATSAPP_URL } from "@/lib/config";

type BookingView = "book" | "lessons" | "manage";

/**
 * Booking, the learner's calendar and lesson management are one surface.
 * /my-lessons and /booking remain as old entry points, then normalise here
 * without throwing away an emailed token.
 */
export function BookingFlow({ initialView = "book" }: { initialView?: BookingView }) {
  const [manageToken, setManageToken] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("manage") || params.get("token") || "";
    setManageToken(token);

    if (window.location.pathname === "/book/") return;
    const target = new URL("/book/", window.location.origin);
    target.search = params.toString();
    if (token) {
      target.searchParams.set("manage", token);
      target.searchParams.delete("token");
    }
    else if (initialView === "lessons" || params.has("emailToken")) target.searchParams.set("view", "lessons");
    const emailToken = params.get("emailToken");
    if (emailToken) target.searchParams.set("emailToken", emailToken);
    window.history.replaceState({}, "", `${target.pathname}${target.search}`);
  }, [initialView]);

  return (
    <>
      <SiteHeader currentPage="book" />

      <main className="book-page" id="main-content">
        <section className="booking-composition" aria-labelledby="booking-title">
          <aside className="booking-intro">
            <h1 id="booking-title">
              Your{" "}
              <br />
              <span className="display-second-line">Lessons</span>
            </h1>
            <div className="editorial-rule" aria-hidden="true" />
            <ul className="booking-intro__points">
              <li>
                <AssetMark asset="/visuals/v2-splats/one-to-one-splat-v2.svg" />
                <span>Book on your calendar</span>
              </li>
              <li>
                <AssetMark asset="/visuals/v2-splats/flexible-rescheduling-splat-v2.svg" />
                <span>Move or cancel here</span>
              </li>
              <li>
                <AssetMark asset="/visuals/v2-splats/lesson-format-splat-v2.svg" />
                <span>Porto time</span>
              </li>
            </ul>
            <AssetMark
              asset="/visuals/v2-splats/booking-availability-splat-v2.svg"
              className="booking-intro__time-window"
            />
          </aside>

          <section className="booking-provider" aria-label="Your lesson calendar">
            {BOOKING_CONFIGURED ? (
              <BookingCalendar initialManageToken={manageToken} initialLessonsView={initialView === "lessons"} />
            ) : (
              <div className="booking-placeholder" aria-label="Booking setup placeholder">
                <p className="eyebrow">Not yet available</p>
                <h3>Booking will open here.</h3>
                <p>
                  Times will appear once booking is connected. In the meantime,{" "}
                  <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                    message Inês
                  </a>{" "}
                  and she&rsquo;ll arrange a lesson with you.
                </p>
              </div>
            )}
          </section>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
