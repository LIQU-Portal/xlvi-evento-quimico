"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getSql } from "@/lib/db";
import { isAttendanceAdmin, simulationEnabled, syncAttendanceSessions } from "@/lib/attendance";
import { buildSimulationSessions } from "@/lib/attendance-simulations";

export type AttendanceAdminState = { message: string; ok: boolean };

export async function manageAttendance(_previous: AttendanceAdminState, form: FormData): Promise<AttendanceAdminState> {
  const session = await auth();
  const actor = session?.user?.email?.trim().toLowerCase();
  if (!actor || !isAttendanceAdmin(actor)) return { ok: false, message: "Acceso no autorizado." };
  const operation = String(form.get("operation") ?? "");
  const sql = getSql();
  try {
    let message = "Cambios guardados.";
    if (operation === "operator") {
      const email = String(form.get("email") ?? "").trim().toLowerCase();
      const active = form.get("active") === "true";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new Error("Escribe un correo válido.");
      if (active) {
        const staff = await sql.query("SELECT id FROM participants WHERE lower(email) = $1 AND role = 'Staff' AND status = 'Confirmado'", [email]);
        if (!staff.length) throw new Error("La cuenta debe estar registrada y reconocida como staff activo. Sincroniza la lista antes de habilitarla.");
      }
      await sql.transaction([
        sql.query(`INSERT INTO attendance_operators(email, active, updated_by) VALUES ($1,$2,$3)
          ON CONFLICT(email) DO UPDATE SET active = EXCLUDED.active, updated_by = EXCLUDED.updated_by, updated_at = NOW()`, [email, active, actor]),
        sql.query("INSERT INTO attendance_audit(actor_email, action, detail) VALUES ($1,'operator',$2::jsonb)", [actor, JSON.stringify({ email, active })]),
      ]);
      message = active ? "Staff de registro habilitado." : "Acceso al lector desactivado.";
    } else if (operation === "assign") {
      const sessionId = String(form.get("sessionId") ?? "").slice(0, 120);
      const emails = [...new Set(form.getAll("operators").map((v) => String(v).trim().toLowerCase()))];
      const rows = await sql.query("SELECT id, is_simulation FROM attendance_sessions WHERE id = $1 AND active", [sessionId]);
      if (!rows.length || (rows[0].is_simulation && !simulationEnabled())) throw new Error("Sesión no disponible.");
      const operators = await sql.query(`SELECT o.email FROM attendance_operators o JOIN participants p ON lower(p.email) = o.email
        WHERE o.active AND p.role = 'Staff' AND p.status = 'Confirmado' AND o.email = ANY($1::text[])`, [emails]);
      if (operators.length !== emails.length) throw new Error("Una de las cuentas seleccionadas no tiene acceso activo.");
      await sql.transaction([
        sql.query("SELECT id FROM attendance_sessions WHERE id = $1 FOR UPDATE", [sessionId]),
        sql.query("DELETE FROM attendance_assignments WHERE session_id = $1", [sessionId]),
        ...emails.map((email) => sql.query("INSERT INTO attendance_assignments(session_id, operator_email, assigned_by) VALUES ($1,$2,$3)", [sessionId, email, actor])),
        sql.query("INSERT INTO attendance_audit(actor_email, action, detail) VALUES ($1,'assign',$2::jsonb)", [actor, JSON.stringify({ sessionId, emails })]),
      ]);
      message = "Asignaciones guardadas. El operador debe volver a abrir su panel.";
    } else if (operation === "sync") {
      const result = await syncAttendanceSessions(actor);
      message = `${result.count} sesiones actualizadas desde el programa.${result.skipped.length
        ? ` Sin fecha/horario válido (revisar en Sheets): ${result.skipped.join("; ")}.` : ""}`;
    } else if (operation === "simulation") {
      if (!simulationEnabled()) throw new Error("Las simulaciones solo están habilitadas en el entorno de pruebas.");
      const sessions = buildSimulationSessions();
      await sql.transaction([
        ...sessions.map((s) => sql.query(`INSERT INTO attendance_sessions
          (id, activity_id, title, type, venue, starts_at, ends_at, is_simulation, updated_by)
          VALUES ($1,NULL,$2,$3,$4,$5,$6,TRUE,$7) ON CONFLICT(id) DO NOTHING`,
          [s.id, s.title, s.type, s.venue, s.startsAt, s.endsAt, actor])),
        sql.query("INSERT INTO attendance_audit(actor_email, action, detail) VALUES ($1,'create_simulations',$2::jsonb)", [actor, JSON.stringify({ ids: sessions.map((s) => s.id) })]),
      ]);
      message = "Cinco actividades de simulación creadas para hoy. Asigna a tus operadores abajo.";
    } else if (operation === "simulation-roster") {
      if (!simulationEnabled()) throw new Error("Simulaciones deshabilitadas.");
      const id = String(form.get("participantId") ?? "").trim().toUpperCase();
      const participant = await sql.query("SELECT id FROM participants WHERE id = $1 AND status = 'Confirmado'", [id]);
      if (!participant.length) throw new Error("No encontramos ese ID de participante confirmado.");
      const active = form.get("active") === "true";
      const query = active
        ? `INSERT INTO attendance_simulation_roster(session_id, participant_id)
          SELECT s.id,$1 FROM attendance_sessions s WHERE s.is_simulation AND s.type IN ('Taller','Concurso')
          AND (s.starts_at AT TIME ZONE 'America/Mexico_City')::date = (NOW() AT TIME ZONE 'America/Mexico_City')::date
          ON CONFLICT DO NOTHING`
        : `DELETE FROM attendance_simulation_roster r USING attendance_sessions s
          WHERE r.session_id = s.id AND s.is_simulation AND r.participant_id = $1`;
      await sql.transaction([
        sql.query(query, [id]),
        sql.query("INSERT INTO attendance_audit(actor_email, action, detail) VALUES ($1,'simulation_roster',$2::jsonb)", [actor, JSON.stringify({ participantId: id, active })]),
      ]);
      message = active ? "Participante autorizado en el taller y concurso de simulación de hoy." : "Autorización de simulación retirada. El registro general no cambió.";
    } else throw new Error("Acción desconocida.");
    revalidatePath("/administracion/asistencia");
    revalidatePath("/registro-asistencia");
    revalidatePath("/mi-cuenta");
    return { ok: true, message };
  } catch (error) {
    console.error("Error de coordinación de asistencia", error instanceof Error ? error.name : "Error");
    const message = error instanceof Error && error.name === "Error" ? error.message : "No se guardó el cambio. Revisa la conexión y vuelve a intentar.";
    return { ok: false, message };
  }
}
