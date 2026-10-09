"use client";

import { useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { createBookingFor } from "@/lib/admin-api";
import { portoTimeToUtc } from "@/lib/booking-api";
import { SITE_BASE_PATH } from "@/lib/paths";

const empty = {
  email: "",
  name: "",
  lessonType: "single",
  date: "",
  time: "17:00",
  location: "online" as "online" | "porto",
};

export function ManualLessonForm({
  token,
  onCreated,
}: {
  token: string;
  onCreated: () => void;
}) {
  const [lesson, setLesson] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  return (
    <details className="teacher-manual">
      <summary>
        <span>
          <span className="teacher-eyebrow">
            For a booking arranged elsewhere
          </span>
          <span className="teacher-manual-title">
            Add a lesson for a student
          </span>
        </span>
        <Plus size={22} aria-hidden="true" />
      </summary>
      <div className="teacher-manual-body">
        <p>
          Students can book through{" "}
          <a href={`${SITE_BASE_PATH}/book/?view=book`}>the booking page</a>.
          Use this if you&rsquo;ve already arranged a lesson another way.
        </p>
        <form
          className="teacher-form teacher-manual-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            setStatus("");
            try {
              await createBookingFor(token, {
                email: lesson.email.trim(),
                name: lesson.name.trim(),
                lessonType: lesson.lessonType,
                startAt: portoTimeToUtc(lesson.date, lesson.time),
                location: lesson.location,
                notes: "",
              });
              setLesson(empty);
              setStatus(
                "Lesson added. The student has been emailed the details.",
              );
              onCreated();
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : "This lesson couldn’t be added.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            <span>Student&rsquo;s email</span>
            <input
              type="email"
              required
              disabled={busy}
              value={lesson.email}
              onChange={(e) => setLesson({ ...lesson, email: e.target.value })}
            />
          </label>
          <label>
            <span>Student&rsquo;s name</span>
            <input
              type="text"
              disabled={busy}
              value={lesson.name}
              onChange={(e) => setLesson({ ...lesson, name: e.target.value })}
            />
          </label>
          <label>
            <span>Lesson</span>
            <select
              disabled={busy}
              value={lesson.lessonType}
              onChange={(e) =>
                setLesson({ ...lesson, lessonType: e.target.value })
              }
            >
              <option value="trial">Trial · 60 mins</option>
              <option value="single">60 mins</option>
              <option value="long">90 mins</option>
            </select>
          </label>
          <label>
            <span>Where</span>
            <select
              disabled={busy}
              value={lesson.location}
              onChange={(e) =>
                setLesson({
                  ...lesson,
                  location: e.target.value as "online" | "porto",
                })
              }
            >
              <option value="online">Online</option>
              <option value="porto">In Porto</option>
            </select>
          </label>
          <label>
            <span>Date</span>
            <input
              type="date"
              required
              disabled={busy}
              value={lesson.date}
              onChange={(e) => setLesson({ ...lesson, date: e.target.value })}
            />
          </label>
          <label>
            <span>Time in Porto</span>
            <input
              type="time"
              required
              disabled={busy}
              value={lesson.time}
              onChange={(e) => setLesson({ ...lesson, time: e.target.value })}
            />
          </label>
          <div className="teacher-manual-submit">
            <button
              className="button button--coral"
              type="submit"
              disabled={busy}
            >
              {busy ? "Adding…" : "Add lesson and email student"}
            </button>
          </div>
        </form>
        {error ? (
          <p className="teacher-inline-error" role="alert">
            {error}
          </p>
        ) : null}
        {status ? (
          <div className="teacher-inline-success" role="status">
            <CheckCircle2 size={20} aria-hidden="true" />
            {status}
          </div>
        ) : null}
      </div>
    </details>
  );
}
