"use client";

import { useState } from "react";
import { updateStudentDetails, type AdminStudent } from "@/lib/admin-api";

/**
 * All of a student's details together, filled in or corrected after she set
 * them up, from a name alone if that was all she had (13 October 2026, Dan:
 * "she can build upon that"). It opens in place from Edit details on their
 * profile (14 October 2026, Dan). Their email is how they sign in, so it is
 * hers to give only until they first do; after that they change it from their
 * account. It is never needed for her to add their lessons.
 */
export function StudentDetailsForm({ token, student, onSaved, onCancel, onBusy }: {
  token: string;
  student: AdminStudent;
  onSaved: (student: AdminStudent) => void;
  onCancel: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [details, setDetails] = useState({ name: student.name, email: student.email, phone: student.phone, nif: student.nif ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (field: keyof typeof details) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setDetails((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form
      className="teacher-form teacher-profile__form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        onBusy?.(true);
        setError("");
        try {
          const result = await updateStudentDetails(token, student.id, {
            name: details.name.trim(),
            email: details.email.trim(),
            phone: details.phone.trim(),
            nif: details.nif.trim(),
            mark: student.mark ?? "",
          });
          onSaved(result.student);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Their details couldn’t be saved.");
        } finally {
          setBusy(false);
          onBusy?.(false);
        }
      }}
    >
      <label>
        <span>Full name</span>
        <input autoComplete="off" autoFocus disabled={busy} onChange={set("name")} required type="text" value={details.name} />
      </label>
      <label>
        <span>
          Email{" "}
          <span className="teacher-field-optional">
            {student.signedIn ? "(they change it from their account)" : student.email ? "" : "(optional, their welcome needs one)"}
          </span>
        </span>
        <input
          autoComplete="off"
          disabled={busy || student.signedIn}
          onChange={set("email")}
          required={Boolean(student.email)}
          type="email"
          value={details.email}
        />
      </label>
      <label>
        <span>Phone <span className="teacher-field-optional">(optional)</span></span>
        <input autoComplete="off" disabled={busy} onChange={set("phone")} type="tel" value={details.phone} />
      </label>
      <label>
        <span>NIF <span className="teacher-field-optional">(optional, for receipts)</span></span>
        <input autoComplete="off" disabled={busy} inputMode="numeric" onChange={set("nif")} type="text" value={details.nif} />
      </label>
      <div className="teacher-dialog-actions">
        <button className="button button--coral" disabled={busy} type="submit">{busy ? "Saving…" : "Save details"}</button>
        <button className="button button--outline" disabled={busy} onClick={onCancel} type="button">Cancel</button>
      </div>
      {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
    </form>
  );
}
