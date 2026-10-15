"use client";

import { useEffect, useState } from "react";
import { StudentLessons } from "@/components/teacher/StudentLessons";
import { fetchBookings, type AdminBooking, type AdminStudent } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";

type History = {
  token: string;
  studentId: string;
  email: string;
  bookings: AdminBooking[] | null;
  error: string;
};

/** All of this student's lessons, independent of the visible timetable week. */
export function StudentHistory({ student, token, refresh = 0, homeworkId }: {
  student: AdminStudent;
  token: string;
  refresh?: number;
  homeworkId?: string;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => Date.now());
  const studentId = student.id;
  const email = student.email?.trim().toLowerCase() ?? "";

  useEffect(() => {
    let active = true;
    void fetchBookings(token, "1970-01-01T00:00:00.000Z").then(result => {
      if (!active || readSession() !== token) return;
      // A linked account survives an email change. Only older, unlinked
      // lessons use an exact email match; names never identify a student.
      const bookings = result.bookings.filter(booking =>
        (booking.status === "confirmed" || booking.status === "cancelled") &&
        (booking.student_id
          ? booking.student_id === studentId
          : Boolean(email) && booking.student_email.trim().toLowerCase() === email));
      setHistory({ token, studentId, email, bookings, error: "" });
    }).catch(caught => {
      if (!active || readSession() !== token) return;
      setHistory({
        token, studentId, email, bookings: null,
        error: caught instanceof Error ? caught.message : "Lesson history couldn’t be loaded.",
      });
    });
    return () => { active = false; };
  }, [token, studentId, email, refresh, attempt]);

  // Hide an old student's result during the render before the next effect.
  const current = history?.token === token && history.studentId === studentId && history.email === email
    ? history : null;

  return (
    <StudentLessons
      token={token}
      requestedHomeworkId={homeworkId}
      bookings={current?.bookings ?? null}
      error={current?.error ?? ""}
      now={now}
      onRetry={() => { setHistory(null); setAttempt(value => value + 1); }}
    />
  );
}
