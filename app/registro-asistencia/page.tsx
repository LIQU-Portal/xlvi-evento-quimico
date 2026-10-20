import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AttendanceScanner } from "@/components/attendance-scanner";
import { attendanceAccess, listAttendanceSessions } from "@/lib/attendance";
import "./style.css";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/mi-cuenta");
  const access = await attendanceAccess(session.user.email);
  if (!access.operator && !access.admin) redirect("/mi-cuenta");
  return <main className="attendance-page"><div className="attendance-container">
    <header className="attendance-header"><Image src="/branding/logo-evento-2026.png" width={140} height={70} alt="Evento del Químico" />
      <Link href="/mi-cuenta">Mi cuenta</Link></header>
    <p className="attendance-eyebrow">Staff de registro</p>
    {access.admin && <Link className="attendance-admin-link" href="/administracion/asistencia">Coordinar sesiones →</Link>}
    {access.operator ? <AttendanceScanner sessions={await listAttendanceSessions(session.user.email, true)} initialNow={new Date().toISOString()} />
      : <p>Tu acceso es de coordinación. Abre “Coordinar sesiones” para asignar al staff de registro.</p>}
  </div></main>;
}
