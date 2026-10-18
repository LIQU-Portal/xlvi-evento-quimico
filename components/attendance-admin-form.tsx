"use client";

import { useActionState, type ReactNode } from "react";
import { manageAttendance } from "@/app/administracion/asistencia/actions";

export function AttendanceAdminForm({ operation, label, children }: { operation: string; label: string; children?: ReactNode }) {
  const [state, action, pending] = useActionState(manageAttendance, { ok: false, message: "" });
  return <form action={action} className="attendance-admin-form" aria-busy={pending}>
    <input type="hidden" name="operation" value={operation} />
    <fieldset disabled={pending}>{children}</fieldset>
    <button className="attendance-secondary" disabled={pending} type="submit">{pending ? "Guardando…" : label}</button>
    {state.message && <p className="attendance-form-message" data-success={state.ok} role={state.ok ? "status" : "alert"}>{state.message}</p>}
  </form>;
}
