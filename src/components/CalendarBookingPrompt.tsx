"use client";

import { useEffect, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import { formatLongDate } from "@/lib/booking-api";
import { keepDialogFocus } from "@/lib/dialog-focus";

type PromptLesson = { key: string; title: string; detail: string; onOpen: () => void };

/**
 * The question a calendar day asks. A free day offers to book; a day with
 * more than one booked lesson lists them to open, and can still book another.
 */
export function CalendarBookingPrompt({ date, lessons = [], onBook, onClose }: {
  date: string;
  lessons?: PromptLesson[];
  onBook: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      aria-labelledby="calendar-booking-title"
      aria-describedby="calendar-booking-date"
      className="policy-dialog calendar-booking-prompt"
      ref={dialogRef}
      onKeyDown={keepDialogFocus}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (
          event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom
        )) onClose();
      }}
    >
      <div className="policy-dialog__heading">
        <h2 id="calendar-booking-title">{lessons.length ? "Your lessons" : "Do you want to book?"}</h2>
        <button aria-label={lessons.length ? "Close" : "Close booking question"} onClick={onClose} type="button">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="calendar-booking-prompt__content">
        <p id="calendar-booking-date">{formatLongDate(`${date}T12:00:00Z`)}</p>
        {lessons.length ? (
          <ul className="calendar-booking-prompt__lessons">
            {lessons.map((lesson) => (
              <li key={lesson.key}>
                <button className="calendar-booking-prompt__lesson" onClick={lesson.onOpen} type="button">
                  <span>
                    <strong>{lesson.title}</strong>
                    <small>{lesson.detail}</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="calendar-booking-prompt__actions">
          <button className="button button--coral" onClick={onBook} type="button">
            {lessons.length ? "Book another lesson" : "Choose a lesson"}
          </button>
          <button className="button button--quiet" onClick={onClose} type="button">Not now</button>
        </div>
      </div>
    </dialog>
  );
}
