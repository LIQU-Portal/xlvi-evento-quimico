import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AttendanceAdminForm } from "@/components/attendance-admin-form";
import { attendanceReport, isAttendanceAdmin, listAttendanceOperators, listAttendanceSessions, simulationEnabled } from "@/lib/attendance";
import "@/app/registro-asistencia/style.css";

export const dynamic = "force-dynamic";
const format = (value: unknown) => value ? new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(String(value))) : "—";

export default async function AttendanceAdminPage({ searchParams }: { searchParams: Promise<{ sesion?: string }> }) {
  const user = await auth();
  if (!isAttendanceAdmin(user?.user?.email)) redirect("/mi-cuenta");
  const selected = (await searchParams).sesion?.slice(0, 120);
  const [sessions, operators, records] = await Promise.all([
    listAttendanceSessions(), listAttendanceOperators(), attendanceReport(selected),
  ]);
  const enabled = operators.filter((o) => o.active && o.role === "Staff" && o.status === "Confirmado");
  return <main className="attendance-page"><div className="attendance-container attendance-admin-container">
    <header className="attendance-header"><Link href="/mi-cuenta">← Mi cuenta</Link><Link href="/registro-asistencia">Abrir lector</Link></header>
    <p className="attendance-eyebrow">Coordinación · Staff de registro</p><h1>Control de asistencia</h1>
    <p>Habilita a tus operadores y asigna las sesiones. Pueden trabajar varios lectores en una misma sesión.</p>
    <section className="attendance-admin-section"><h2>1. Staff de registro</h2>
      <p>Solo cuentas con registro confirmado y clasificación Staff. La cuenta normal nunca ve el acceso al lector.</p>
      <AttendanceAdminForm operation="operator" label="Guardar acceso"><label>Correo institucional<input type="email" name="email" required maxLength={200} /></label>
        <label>Acceso<select name="active"><option value="true">Habilitar lector</option><option value="false">Desactivar lector</option></select></label></AttendanceAdminForm>
      <ul>{operators.map((o) => <li key={String(o.email)}>{String(o.email)} · {o.active && o.role === "Staff" && o.status === "Confirmado" ? "Activo" : "Sin acceso"}</li>)}</ul>
    </section>
    <section className="attendance-admin-section"><h2>2. Programa y sesiones</h2>
      <p>Actualiza después de cambiar horarios en Sheets. Cada día del taller tiene su propia sesión y conserva las lecturas existentes.</p>
      <AttendanceAdminForm operation="sync" label="Actualizar sesiones del programa" />
      {simulationEnabled() && <div className="attendance-simulation"><h3>Pruebas internas</h3>
        <p>Crea tres conferencias (A y B simultáneas), un taller y un concurso. Solo aparecen aquí y en los lectores asignados.</p>
        <AttendanceAdminForm operation="simulation" label="Crear las 5 simulaciones de hoy" />
        <AttendanceAdminForm operation="simulation-roster" label="Guardar inscripción de simulación">
          <label>ID de la cuenta participante<input name="participantId" required placeholder="EQ26-XXXXXXXXXX" /></label>
          <label>Inscripción de prueba<select name="active"><option value="true">Autorizar taller y concurso de simulación</option><option value="false">Retirar autorización de simulación</option></select></label>
        </AttendanceAdminForm>
      </div>}
    </section>
    <section className="attendance-admin-section"><h2>3. Asignar sesiones</h2>
      {!enabled.length && <p>Habilita primero al menos un integrante de staff de registro.</p>}
      <div className="attendance-admin-list">{sessions.map((s) => <article key={s.id} className="attendance-admin-card">
        <span>{s.isSimulation ? "SIMULACIÓN · " : ""}{s.type}{!s.active ? " · Inactiva" : ""}</span><h3>{s.title}</h3>
        <p>{format(s.startsAt)} – {format(s.endsAt)}<br />{s.venue}</p>
        <p><strong>{s.entries} entradas</strong>{s.type === "Conferencia" && <> · <strong>{s.exits} salidas</strong></>}</p>
        {s.active && <AttendanceAdminForm operation="assign" label="Guardar asignación">
          <input type="hidden" name="sessionId" value={s.id} />
          {enabled.map((o) => <label className="attendance-check" key={String(o.email)}>
            <input type="checkbox" name="operators" value={String(o.email)} defaultChecked={s.operators?.includes(String(o.email))} />{String(o.name ?? o.email)} ({String(o.email)})
          </label>)}
        </AttendanceAdminForm>}
        <Link href={`/administracion/asistencia?sesion=${encodeURIComponent(s.id)}#registros`}>Ver asistentes →</Link>
      </article>)}</div>
    </section>
    <section id="registros" className="attendance-admin-section"><h2>4. Asistentes</h2>
      <form method="get" className="attendance-admin-form"><label>Sesión<select name="sesion" defaultValue={selected ?? ""}>
        <option value="">Todas</option>{sessions.map((s) => <option key={s.id} value={s.id}>{format(s.startsAt)} · {s.title}</option>)}
      </select></label><button type="submit" className="attendance-secondary">Ver registros</button></form>
      <Link href={`/administracion/asistencia/exportar${selected ? `?sesion=${encodeURIComponent(selected)}` : ""}`}>Descargar CSV</Link>
      <p>{records.length} participantes por sesión. Las entradas y salidas no representan todavía horas acreditadas.</p>
      <div className="attendance-table-wrapper"><table><thead><tr><th>Sesión</th><th>Participante</th><th>ID</th><th>Entrada</th><th>Salida</th><th>Registró</th></tr></thead>
        <tbody>{records.map((r) => <tr key={`${r.session_id}:${r.participant_id}`}><td>{String(r.title)}</td><td>{String(r.name)}</td><td>{String(r.participant_id)}</td><td>{format(r.entered_at)}</td><td>{format(r.exited_at)}</td><td>{String(r.entry_operator ?? "—")} / {String(r.exit_operator ?? "—")}</td></tr>)}</tbody></table></div>
    </section>
  </div></main>;
}
