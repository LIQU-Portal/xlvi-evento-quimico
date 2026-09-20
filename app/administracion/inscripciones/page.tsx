import { Download, LogOut, Search, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { AdminCancellationForm } from "@/components/admin-cancellation-form";
import {
  getAdminActivitySummary,
  getAdminEnrollments,
  isActivityAdmin,
  type AdminEnrollmentStatus,
} from "@/lib/activity-admin";

type AdminPageProps = {
  searchParams: Promise<{
    buscar?: string;
    actividad?: string;
    estado?: string;
  }>;
};

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export default async function AdminEnrollmentsPage({ searchParams }: AdminPageProps) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email || !isActivityAdmin(email)) redirect("/mi-cuenta");

  const params = await searchParams;
  const search = params.buscar?.trim().slice(0, 160) ?? "";
  const activityId = /^\d+$/.test(params.actividad ?? "")
    ? Number(params.actividad)
    : undefined;
  const status: AdminEnrollmentStatus =
    params.estado === "Confirmado" || params.estado === "Cancelado"
      ? params.estado
      : "Todos";
  const [activities, enrollments] = await Promise.all([
    getAdminActivitySummary(),
    getAdminEnrollments({ search, activityId, status }),
  ]);
  const exportParams = new URLSearchParams();
  if (search) exportParams.set("buscar", search);
  if (activityId) exportParams.set("actividad", String(activityId));
  if (status !== "Todos") exportParams.set("estado", status);
  const exportHref = `/administracion/inscripciones/exportar${exportParams.size ? `?${exportParams}` : ""}`;

  return (
    <main className="admin-page">
      <div className="admin-container">
        <header className="admin-header">
          <Link href="/" className="admin-brand" aria-label="Ir al inicio">
            <Image src="/branding/isotipo.svg" alt="" width={38} height={38} />
            <span>XLVI Evento del Químico</span>
          </Link>
          <nav aria-label="Navegación administrativa">
            <Link href="/mi-cuenta">Mi cuenta</Link>
            <form action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}>
              <button type="submit"><LogOut size={16} /> Cerrar sesión</button>
            </form>
          </nav>
        </header>

        <section className="admin-intro">
          <p><ShieldCheck /> Acceso autorizado</p>
          <h1>Inscripciones</h1>
          <span>Consulta cupos, encuentra participantes y administra cancelaciones.</span>
        </section>

        <section className="admin-summary" aria-label="Resumen de actividades">
          {activities.length ? activities.map((activity) => (
            <article key={activity.id}>
              <span>{activity.type}</span>
              <h2>{activity.title}</h2>
              <dl>
                <div><dt>Cupo</dt><dd>{activity.capacity}</dd></div>
                <div><dt>Confirmados</dt><dd>{activity.confirmed}</dd></div>
                <div><dt>Cancelados</dt><dd>{activity.cancelled}</dd></div>
                <div><dt>Disponibles</dt><dd>{activity.remaining}</dd></div>
              </dl>
            </article>
          )) : (
            <p className="admin-empty">Aún no hay actividades sincronizadas.</p>
          )}
        </section>

        <section className="admin-records" aria-labelledby="admin-records-title">
          <div className="admin-records-heading">
            <div>
              <span>{enrollments.length} resultados</span>
              <h2 id="admin-records-title">Participantes</h2>
            </div>
            <a className="admin-export" href={exportHref}>
              <Download size={17} /> Exportar CSV
            </a>
          </div>

          <form className="admin-filters" method="get">
            <label className="admin-search">
              <span>Buscar</span>
              <div><Search size={17} /><input name="buscar" defaultValue={search} placeholder="Nombre, correo o ID" /></div>
            </label>
            <label>
              <span>Actividad</span>
              <select name="actividad" defaultValue={activityId ?? ""}>
                <option value="">Todas</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>{activity.title}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select name="estado" defaultValue={status}>
                <option value="Todos">Todos</option>
                <option value="Confirmado">Confirmados</option>
                <option value="Cancelado">Cancelados</option>
              </select>
            </label>
            <button type="submit">Aplicar filtros</button>
            <Link href="/administracion/inscripciones">Limpiar</Link>
          </form>

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Participante</th>
                  <th>Actividad</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Acción / auditoría</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td data-label="Participante">
                      <strong>{enrollment.participantName}</strong>
                      <span>{enrollment.participantEmail}</span>
                      <small>{enrollment.participantId}</small>
                    </td>
                    <td data-label="Actividad">
                      <strong>{enrollment.activityTitle}</strong>
                      <span>{enrollment.activityType}</span>
                    </td>
                    <td data-label="Estado">
                      <span className={`admin-status admin-status-${enrollment.status.toLowerCase()}`}>
                        {enrollment.status}
                      </span>
                    </td>
                    <td data-label="Fecha"><span>{formatDate(enrollment.createdAt)}</span></td>
                    <td data-label="Acción / auditoría">
                      {enrollment.status === "Confirmado" ? (
                        <AdminCancellationForm enrollmentId={enrollment.id} />
                      ) : (
                        <div className="admin-audit">
                          <strong>{enrollment.cancellationReason}</strong>
                          <span>{formatDate(enrollment.cancelledAt)}</span>
                          <small>{enrollment.cancelledBy}</small>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!enrollments.length && <p className="admin-empty">No hay inscripciones con estos filtros.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
