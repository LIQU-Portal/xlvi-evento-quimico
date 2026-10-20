import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AttendanceAdminForm } from "@/components/attendance-admin-form";
import { AttendanceOperatorList } from "@/components/attendance-operator-list";
import { AttendanceSessionList } from "@/components/attendance-session-list";
import { operatorCanScan } from "@/lib/attendance-operator-list";
import { attendanceReport, isAttendanceAdmin, listAttendanceOperators, listAttendanceSessions, simulationEnabled } from "@/lib/attendance";
import "@/app/registro-asistencia/style.css";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
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
  const enabled = operators.filter(operatorCanScan);
  const unassigned = sessions.filter((s) => s.active && !enabled.some((o) => s.operators?.includes(o.email))).length;
  return <main className="attendance-page"><div className="attendance-container attendance-admin-container">
    <header className="attendance-header"><Link href="/mi-cuenta">← Mi cuenta</Link><Link href="/registro-asistencia">Abrir lector</Link></header>
    <p className="attendance-eyebrow">Coordinación · Staff de registro</p><h1>Control de asistencia</h1>
    <p>Elige al staff, prepara las sesiones y asigna quién registra cada actividad.</p>
    <div className="attendance-overview" aria-label="Resumen de coordinación">
      <div><strong>{enabled.length}</strong><span>Operadores habilitados</span></div>
      <div><strong>{sessions.filter((s) => s.active).length}</strong><span>Sesiones activas</span></div>
      <div><strong>{unassigned}</strong><span>Sesiones sin operador</span></div>
    </div>
    <nav className="attendance-step-nav" aria-label="Pasos de coordinación"><a href="#operadores">1 · Elegir staff</a><a href="#preparar">2 · Preparar sesiones</a><a href="#asignar">3 · Asignar</a><a href="#registros">4 · Ver asistentes</a></nav>
    <section id="operadores" className="attendance-admin-section"><h2>1. Elige quién puede registrar</h2>
      <AttendanceAdminForm operation="staff-sync" label="Actualizar staff desde Sheets" />
      <p>Después de editar Staff, actualiza aquí. Solo el staff activo con función Registro de asistencia puede habilitarse. Si falta su registro general, aparecerá pendiente. No se crean usuarios ni permisos automáticamente.</p>
      <p>Busca a la persona y pulsa <strong>Habilitar lector</strong>. Después asígnale sus sesiones en el paso 3.</p>
      <AttendanceOperatorList operators={operators} sessions={sessions} />
    </section>
    <section id="preparar" className="attendance-admin-section"><h2>2. Prepara las sesiones</h2>
      <details className="attendance-program-setup"><summary>Importar o actualizar el programa real</summary>
        <p>Agrupa las conferencias por auditorio y día. Talleres y concursos conservan su sesión diaria. Los bloques con lecturas no admiten cambios de horarios o sede.</p>
        <AttendanceAdminForm operation="sync" label="Actualizar sesiones del programa" />
      </details>
      {simulationEnabled() && <div className="attendance-simulation"><h3>Pruebas internas</h3>
        <p>Dos auditorios: A y C consecutivas en Aula azul y B simultánea en Aula morada; un taller y un concurso. No aparecen en el programa público.</p>
        <AttendanceAdminForm operation="simulation" label="Crear las 5 simulaciones de hoy" />
        <h4>Autoriza al participante de prueba</h4><p>Para registrar su entrada al taller y al concurso de simulación, agrega su ID. Las conferencias no necesitan este paso.</p>
        <AttendanceAdminForm operation="simulation-roster" label="Guardar inscripción de simulación">
          <label>ID de la cuenta participante<input name="participantId" required placeholder="EQ26-XXXXXXXXXX" /></label>
          <label>Inscripción de prueba<select name="active"><option value="true">Autorizar taller y concurso de simulación</option><option value="false">Retirar autorización de simulación</option></select></label>
        </AttendanceAdminForm>
      </div>}
    </section>
    <section id="asignar" className="attendance-admin-section"><h2>3. Asigna operadores a cada sesión</h2>
      <p>Filtra por día, abre una actividad, marca a sus operadores y guarda. El staff verá únicamente las sesiones asignadas del día actual.</p>
      <AttendanceSessionList sessions={sessions} operators={operators} />
    </section>
    <section id="registros" className="attendance-admin-section"><h2>4. Asistentes</h2>
      <form method="get" className="attendance-admin-form"><label>Sesión<select name="sesion" defaultValue={selected ?? ""}>
        <option value="">Todas</option>{sessions.map((s) => <option key={s.id} value={s.id}>{format(s.startsAt)} · {s.title}</option>)}
      </select></label><button type="submit" className="attendance-secondary">Ver registros</button></form>
      <Link href={`/administracion/asistencia/exportar${selected ? `?sesion=${encodeURIComponent(selected)}` : ""}`}>Descargar CSV</Link>
      <p><Link href={`/administracion/asistencia/exportar?detalle=estancias${selected ? `&sesion=${encodeURIComponent(selected)}` : ""}`}>Descargar entradas y salidas de auditorio</Link></p>
      <p>{records.length} registros por actividad. En conferencias se reconocen todos los minutos reales con entrada y salida, sin porcentaje mínimo. Sin salida, esa estancia no suma. No se emiten constancias todavía.</p>
      <div className="attendance-table-wrapper"><table><thead><tr><th>Actividad</th><th>Participante</th><th>ID</th><th>Primera entrada</th><th>Última salida</th><th>Minutos presentes / reconocidos</th><th>Entradas sin salida</th></tr></thead>
        <tbody>{records.map((r) => <tr key={`${r.session_id}:${r.participant_id}:${r.evidence_type}`}><td>{String(r.title)}</td><td>{String(r.name)}</td><td>{String(r.participant_id)}</td><td>{format(r.entered_at)}</td><td>{format(r.exited_at)}</td><td>{r.evidence_type === "auditorium_intervals" ? `${r.attended_minutes} / ${r.credited_minutes}` : "Sin cálculo: registro individual"}</td><td>{String(r.open_intervals ?? "—")}</td></tr>)}</tbody></table></div>
    </section>
  </div></main>;
}
