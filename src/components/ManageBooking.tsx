"use client";

import { MeetingLink } from "@/components/MeetingLink";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, Clock3, Globe2, MapPin } from "lucide-react";
import {
  addDaysToKey,
  browserTimeZone,
  buildBookingWeeks,
  cancelBooking,
  fetchAvailability,
  fetchBooking,
  formatLongDate,
  formatMoneyCents,
  differingLocalTime,
  formatSlotTime,
  portoDateKey,
  shortMonth,
  rescheduleBooking,
  startWithFirstBookableWeek,
  type Booking,
  type Slot
} from "@/lib/booking-api";
import {
  BOOKING_HORIZON_DAYS_FALLBACK,
  BOOKING_TIME_ZONE,
  CONTACT_WHATSAPP_URL,
  NOTICE_HOURS,
  formatLessonDuration
} from "@/lib/config";

type Mode = "view" | "reschedule" | "confirm-cancel";
type Outcome = { kind: "rescheduled" | "cancelled"; sameDayFee?: boolean; refunded?: boolean } | null;

export function ManageBooking({
  manageToken,
  onBack,
  onBook
}: {
  manageToken?: string;
  onBack?: () => void;
  onBook?: () => void;
} = {}) {
  const [token, setToken] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isPast, setIsPast] = useState(false);
  const [changeLocked, setChangeLocked] = useState(false);
  const [sameDayFeeApplies, setSameDayFeeApplies] = useState(false);
  const [sameDayFeeAutomatic, setSameDayFeeAutomatic] = useState(false);
  const [refundOnCancel, setRefundOnCancel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [working, setWorking] = useState(false);
  const [studentZone, setStudentZone] = useState(BOOKING_TIME_ZONE);

  const [todayKey, setTodayKey] = useState("");
  const [horizonDays, setHorizonDays] = useState(BOOKING_HORIZON_DAYS_FALLBACK);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Slot[]>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    const key = portoDateKey(new Date());
    setTodayKey(key);
    setStudentZone(browserTimeZone());

    const params = new URLSearchParams(window.location.search);
    const found = manageToken || params.get("manage") || params.get("token");
    if (!found) {
      setError("This page needs the link from your confirmation email.");
      setLoading(false);
      return;
    }

    setToken(found);
    fetchBooking(found)
      .then((data) => {
        setBooking(data.booking);
        setIsPast(data.isPast);
        setChangeLocked(Boolean(data.changeLocked));
        setSameDayFeeApplies(Boolean(data.sameDayFeeApplies));
        setSameDayFeeAutomatic(Boolean(data.sameDayFeeAutomatic));
        setRefundOnCancel(Boolean(data.refundOnCancel));
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, [manageToken]);

  const loadSlots = useCallback(
    (signal?: AbortSignal) => {
      if (!booking || !todayKey || mode !== "reschedule") return;

      setLoadingSlots(true);

      // Generous window, clamped by the Worker to the real horizon. See the
      // note in BookingCalendar: a fixed window and a horizon-sized grid drift
      // apart the moment the horizon changes.
      fetchAvailability(booking.lessonType.id, todayKey, addDaysToKey(todayKey, 140), signal)
        .then((data) => {
          setSlotsByDate(data.slotsByDate);
          setHorizonDays(data.horizonDays || BOOKING_HORIZON_DAYS_FALLBACK);
          setSelectedDate((current) =>
            current && data.slotsByDate[current]?.length ? current : Object.keys(data.slotsByDate).sort()[0] ?? ""
          );
        })
        .catch(() => setSlotsByDate({}))
        .finally(() => {
          if (!signal?.aborted) setLoadingSlots(false);
        });
    },
    [booking, todayKey, mode]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSlots(controller.signal);
    return () => controller.abort();
  }, [loadSlots]);

  const calendarWeeks = useMemo(() => {
    if (!todayKey || loadingSlots) return [];
    return startWithFirstBookableWeek(buildBookingWeeks(todayKey, horizonDays), slotsByDate);
  }, [todayKey, horizonDays, loadingSlots, slotsByDate]);

  async function doReschedule() {
    if (!token || !selectedSlot) return;
    setWorking(true);
    setActionError("");
    try {
      const result = await rescheduleBooking(token, selectedSlot);
      setBooking(result.booking);
      setOutcome({ kind: "rescheduled", sameDayFee: result.sameDayFeeApplied });
      setMode("view");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That change could not be made.");
      loadSlots();
    } finally {
      setWorking(false);
    }
  }

  async function doCancel() {
    if (!token) return;
    setWorking(true);
    setActionError("");
    try {
      const result = await cancelBooking(token);
      setBooking(result.booking);
      setOutcome({
        kind: "cancelled",
        sameDayFee: result.sameDayFeeApplied,
        refunded: result.booking.paymentStatus === "refunded"
      });
      setMode("view");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That lesson could not be cancelled.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <p className="booking-state-note">Finding your booking…</p>;
  }

  if (error || !booking) {
    return (
      <div className="booking-alert" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <p>
          {error || "That booking could not be found."} If you can&rsquo;t find your confirmation email,{" "}
          <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
            message Inês
          </a>{" "}
          and she&rsquo;ll sort it out.
        </p>
      </div>
    );
  }

  const cancelled = booking.status === "cancelled";

  return (
    <div className="manage-booking">
      {onBack ? (
        <button className="booking-back manage-booking__back" onClick={onBack} type="button">
          <ArrowLeft size={16} aria-hidden="true" /> All your lessons
        </button>
      ) : null}

      {outcome ? (
        <div className="booking-outcome" role="status">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <strong>
              {outcome.kind === "rescheduled" ? "Your lesson has been moved." : "Your lesson has been cancelled."}
            </strong>
            <p>
              We&rsquo;ve emailed you the details and updated your calendar.
              {outcome.refunded && booking.amountCents
                ? ` Your ${formatMoneyCents(booking.amountCents)} is on its way back to your card. Refunds usually show within a few days.`
                : ""}
              {outcome.sameDayFee
                ? sameDayFeeAutomatic
                  ? ` Because this was less than ${NOTICE_HOURS} hours before the lesson, the ${formatMoneyCents(
                      booking.sameDayFeeCents
                    )} late change fee will be charged to your saved card.`
                  : ` Because this was less than ${NOTICE_HOURS} hours before the lesson, the ${formatMoneyCents(
                      booking.sameDayFeeCents
                    )} late change fee applies. Inês will arrange it with you.`
                : ""}
            </p>
          </div>
        </div>
      ) : null}

      <div className="manage-booking__card">
        <p className="eyebrow">{cancelled ? "Cancelled" : "Your booking"}</p>
        <h2>{booking.lessonType.name}</h2>
        <dl className="manage-booking__facts">
          <div>
            <dt>
              <CalendarDays size={17} aria-hidden="true" /> Porto time
            </dt>
            <dd className={cancelled ? "is-struck" : ""}>
              {formatLongDate(booking.startAt)}, {formatSlotTime(booking.startAt)}
            </dd>
          </div>
          {differingLocalTime(booking.startAt, studentZone) ? (
            <div>
              <dt>
                <Globe2 size={17} aria-hidden="true" /> Your time
              </dt>
              <dd className={cancelled ? "is-struck" : ""}>
                {formatLongDate(booking.startAt, studentZone)}, {formatSlotTime(booking.startAt, studentZone)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>
              <Clock3 size={17} aria-hidden="true" /> Length
            </dt>
            <dd>{formatLessonDuration(booking.lessonType.durationMinutes)}</dd>
          </div>
          <div>
            <dt>
              <MapPin size={17} aria-hidden="true" /> Where
            </dt>
            <dd>{booking.location === "porto" ? "In person, in Porto" : "Online"}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{booking.reference}</dd>
          </div>
        </dl>
        <MeetingLink meetingUrl={booking.meetingUrl} location={booking.location} status={booking.status} />
      </div>

      {cancelled ? (
        <>
          <p className="booking-state-note">This lesson is cancelled.</p>
          <div className="manage-booking__onward">
            {onBack ? (
              <button className="button button--coral" onClick={onBack} type="button">
                Go to your lessons
              </button>
            ) : (
              <a className="button button--coral" href="/book/?view=lessons">
                Go to your lessons
              </a>
            )}
            {onBook ? (
              <button className="text-action" onClick={onBook} type="button">
                Book another lesson
              </button>
            ) : (
              <a className="text-action" href="/book/">
                Book another lesson
              </a>
            )}
          </div>
        </>
      ) : isPast ? (
        <>
          <p className="booking-state-note">This lesson has already happened, so it can no longer be changed here.</p>
          <div className="manage-booking__onward">
            {onBack ? (
              <button className="button button--coral" onClick={onBack} type="button">
                Go to your lessons
              </button>
            ) : (
              <a className="button button--coral" href="/book/?view=lessons">
                Go to your lessons
              </a>
            )}
            {onBook ? (
              <button className="text-action" onClick={onBook} type="button">
                Book another lesson
              </button>
            ) : (
              <a className="text-action" href="/book/">
                Book another lesson
              </a>
            )}
          </div>
        </>
      ) : (
        <>
          {changeLocked && !outcome ? (
            <div className="booking-alert booking-alert--warn" role="status">
              <AlertCircle size={18} aria-hidden="true" />
              <p>
                Your lesson is less than {NOTICE_HOURS} hours away, and it&rsquo;s already paid, so it can&rsquo;t be moved or cancelled now.
                See you there. If something has happened, reply to your confirmation email and Inês will help.
              </p>
            </div>
          ) : null}

          {sameDayFeeApplies && !outcome ? (
            <div className="booking-alert booking-alert--warn" role="status">
              <AlertCircle size={18} aria-hidden="true" />
              <p>
                Your lesson is less than {NOTICE_HOURS} hours away. Changing or cancelling now means the{" "}
                {formatMoneyCents(booking.sameDayFeeCents)} late change fee{" "}
                {sameDayFeeAutomatic ? "is charged automatically." : "applies."}
              </p>
            </div>
          ) : null}

          {actionError ? (
            <div className="booking-alert" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <p>{actionError}</p>
            </div>
          ) : null}

          {mode === "view" && !changeLocked ? (
            <div className="manage-booking__actions">
              <button
                className="button button--coral"
                onClick={() => {
                  setLoadingSlots(true);
                  setMode("reschedule");
                }}
                type="button"
              >
                Move to another time
              </button>
              <button className="button button--quiet" onClick={() => setMode("confirm-cancel")} type="button">
                Cancel this lesson
              </button>
            </div>
          ) : null}

          {mode === "confirm-cancel" ? (
            <div className="manage-booking__confirm">
              <p>
                Cancel your {booking.lessonType.name.toLowerCase()} on {formatLongDate(booking.startAt)} at{" "}
                {formatSlotTime(booking.startAt)}? This can&rsquo;t be undone. You&rsquo;d need to book again.
                {refundOnCancel && booking.amountCents
                  ? ` Your ${formatMoneyCents(booking.amountCents)} comes straight back to your card.`
                  : ""}
              </p>
              <div className="manage-booking__actions">
                <button className="button button--coral" disabled={working} onClick={doCancel} type="button">
                  {working ? "Cancelling…" : "Yes, cancel it"}
                </button>
                <button className="button button--quiet" onClick={() => setMode("view")} type="button">
                  Keep my lesson
                </button>
              </div>
            </div>
          ) : null}

          {mode === "reschedule" ? (
            <div className="manage-booking__reschedule">
              <div className="calendar-section-heading">
                <h3>Pick a new time</h3>
                <p>All times are Porto time.</p>
              </div>

              <div className="calendar-weekdays" aria-hidden="true">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div>
                {calendarWeeks.map((week) => (
                  <Fragment key={week.key}>
                    {week.showMonth ? <p className="calendar-month">{week.month}</p> : null}
                    <div className="calendar-week">
                      {week.cells.map((cell) => {
                        const slots = slotsByDate[cell.key] ?? [];
                        return (
                          <button
                            aria-label={`${formatLongDate(`${cell.key}T12:00:00Z`)}${
                              slots.length ? `, ${slots.length} times free` : ", no times free"
                            }`}
                            aria-pressed={selectedDate === cell.key}
                            className={`${
                              selectedDate === cell.key ? "is-selected" : slots.length ? "has-availability" : ""
                            }${cell.isToday ? " is-today" : ""}`}
                            disabled={!slots.length}
                            key={cell.key}
                            onClick={() => {
                              setSelectedDate(cell.key);
                              setSelectedSlot("");
                            }}
                            type="button"
                          >
                            <span>
                              {cell.day}
                              {cell.month !== week.monthNumber ? <em>{shortMonth(cell.month, cell.key)}</em> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Fragment>
                ))}
              </div>

              {loadingSlots ? (
                <p className="booking-state-note">Checking what&rsquo;s free…</p>
              ) : (slotsByDate[selectedDate] ?? []).length ? (
                <div className="slot-grid">
                  {(slotsByDate[selectedDate] ?? []).map((slot) => (
                    <button
                      aria-pressed={selectedSlot === slot.startAt}
                      className={selectedSlot === slot.startAt ? "is-selected" : ""}
                      key={slot.startAt}
                      onClick={() => setSelectedSlot(slot.startAt)}
                      type="button"
                    >
                      {formatSlotTime(slot.startAt)}
                      {differingLocalTime(slot.startAt, studentZone) ? (
                        <small>{differingLocalTime(slot.startAt, studentZone)} your time</small>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="booking-state-note">No times free on this day. Try another.</p>
              )}

              <div className="manage-booking__actions">
                <button
                  className="button button--coral"
                  disabled={!selectedSlot || working}
                  onClick={doReschedule}
                  type="button"
                >
                  {working ? "Moving…" : selectedSlot ? `Move to ${formatSlotTime(selectedSlot)}` : "Choose a time"}
                </button>
                <button className="booking-back" onClick={() => setMode("view")} type="button">
                  <ArrowLeft size={16} aria-hidden="true" /> Back
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Every one of these pages is somewhere a student arrives from an email
          and would otherwise have to reach for the back button. A finished
          action should always say where to go next. */}
      {outcome && !cancelled ? (
        <div className="manage-booking__onward">
          {onBack ? (
            <button className="button button--coral" onClick={onBack} type="button">
              Go to your lessons
            </button>
          ) : (
            <a className="button button--coral" href="/book/?view=lessons">
              Go to your lessons
            </a>
          )}
        </div>
      ) : null}
    </div>
  );
}
