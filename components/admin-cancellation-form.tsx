"use client";

import { useActionState, useState } from "react";

import {
  cancelEnrollmentAdminAction,
  type AdminCancellationState,
} from "@/app/administracion/inscripciones/actions";
import { ADMIN_CANCELLATION_REASONS } from "@/lib/activity-admin";

const initialState: AdminCancellationState = { status: "idle", message: "" };

export function AdminCancellationForm({ enrollmentId }: { enrollmentId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(
    cancelEnrollmentAdminAction,
    initialState,
  );

  if (!open) {
    return (
      <button className="admin-cancel-trigger" type="button" onClick={() => setOpen(true)}>
        Cancelar
      </button>
    );
  }

  return (
    <form action={formAction} className="admin-cancel-form">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <label>
        Motivo
        <select
          name="reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          <option value="">Selecciona…</option>
          {Object.entries(ADMIN_CANCELLATION_REASONS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      {reason === "other" && (
        <label>
          Explicación
          <textarea name="detail" minLength={3} maxLength={240} required />
        </label>
      )}
      {state.message && (
        <p className={state.status === "error" ? "admin-form-error" : "admin-form-success"} role="status">
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending}>{pending ? "Cancelando…" : "Confirmar cancelación"}</button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)}>Volver</button>
      </div>
    </form>
  );
}
