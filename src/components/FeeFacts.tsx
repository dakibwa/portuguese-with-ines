import { NO_SHOW_WINDOW_HOURS_AFTER } from "@/lib/config";
import { formatMoneyCents } from "@/lib/booking-api";

/*
 * The change rule and when a lesson is charged, in the words every page uses.
 * Kept apart from CardOnFile so booking can say them without loading the
 * card step's code.
 */

/**
 * When a lesson is charged, in words that follow the charge window: an hour
 * after it today, at its end once the window is nothing (2 November 2026,
 * Dan: "charged at the time of when the lessons ends").
 */
export const CHARGED_EACH = NO_SHOW_WINDOW_HOURS_AFTER ? "after each lesson" : "at the end of each lesson";
export const CHARGED_IT = NO_SHOW_WINDOW_HOURS_AFTER ? "after it ends" : "when it ends";

/**
 * The change and no-show rule as two dabs, what is free first (2 November
 * 2026, Dan: the same words across the site). `noShow` false leaves out the
 * no-show, where nothing charges a card for one.
 */
export function FeeFacts({ feeCents, noticeHours, noShow = true }: { feeCents: number; noticeHours: number; noShow?: boolean }) {
  if (!feeCents) return <li>No fee to change or cancel{noShow ? ", or for a missed lesson" : ""}</li>;
  return <>
    <li><strong className="is-free">Free to change or cancel</strong> a lesson up to {noticeHours}&nbsp;hours before</li>
    <li><strong>{formatMoneyCents(feeCents)}</strong> to move or cancel later{noShow ? ", or if you don’t show up" : ""}</li>
  </>;
}
