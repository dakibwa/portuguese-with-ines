"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import { formatLongDate } from "@/lib/booking-api";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { lockPageScroll } from "@/lib/scroll-lock";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";

/** Each lesson row wears the lesson's own mark, as it does on the calendar. */
type PromptLesson = { key: string; title: string; detail: string; mark?: ReactNode; onOpen: () => void };

/**
 * A calendar day with more than one booked lesson: its lessons to open, and
 * a way to book another. A free day goes straight to its times instead.
 */
export function CalendarBookingPrompt({ date, lessons, onBook, onClose }: {
  date: string;
  lessons: PromptLesson[];
  onBook: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropHandlers = useDialogBackdrop(onClose);
  const longDate = formatLongDate(`${date}T12:00:00Z`);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    dialog?.showModal();
    return () => {
      dialog?.close();
      releaseScroll();
      restoreDialogFocus(previous);
    };
  }, []);

  return (
    <dialog
      aria-labelledby="calendar-booking-title"
      className="policy-dialog calendar-booking-prompt"
      ref={dialogRef}
      {...backdropHandlers}
      onKeyDown={keepDialogFocus}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="policy-dialog__heading">
        {/* A day's lessons are titled by the day: "Your lessons" only
            repeated the card behind the dialog. */}
        <h2 id="calendar-booking-title">{longDate}</h2>
        <button aria-label="Close" onClick={onClose} type="button">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="calendar-booking-prompt__content">
        <ul className="calendar-booking-prompt__lessons">
          {lessons.map((lesson) => (
            <li key={lesson.key}>
              <button className="calendar-booking-prompt__lesson" onClick={lesson.onOpen} type="button">
                {lesson.mark}
                <span>
                  <strong>{lesson.title}</strong>
                  <small>{lesson.detail}</small>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="calendar-booking-prompt__actions">
          <button className="button button--coral" onClick={onBook} type="button">
            Book another lesson
          </button>
          <button className="button button--quiet" onClick={onClose} type="button">Not now</button>
        </div>
      </div>
    </dialog>
  );
}
