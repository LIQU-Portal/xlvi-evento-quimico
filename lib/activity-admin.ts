import { getSql } from "@/lib/db";

export const ADMIN_CANCELLATION_REASONS = {
  participant_request: "Solicitud del participante",
  duplicate: "Registro duplicado",
  incorrect_data: "Datos incorrectos",
  organization_decision: "Decisión organizativa",
  other: "Otro",
} as const;

export type AdminCancellationReason = keyof typeof ADMIN_CANCELLATION_REASONS;
export type AdminEnrollmentStatus = "Todos" | "Confirmado" | "Cancelado";

export type AdminActivitySummary = {
  id: number;
  type: "Taller" | "Concurso";
  title: string;
  capacity: number;
  confirmed: number;
  cancelled: number;
  remaining: number;
  capacityUnit: "personas" | "equipos";
};

export type AdminEnrollment = {
  id: number;
  activityId: number;
  activityType: "Taller" | "Concurso";
  activityTitle: string;
  participantId: string;
  participantEmail: string;
  participantName: string;
  status: "Confirmado" | "Cancelado";
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  teamName?: string;
};

export type AdminEnrollmentFilters = {
  search?: string;
  activityId?: number;
  status?: AdminEnrollmentStatus;
};

export function getActivityAdminEmails(): Set<string> {
  return new Set(
    (process.env.ACTIVITY_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isActivityAdmin(email: string | null | undefined): boolean {
  return Boolean(email && getActivityAdminEmails().has(email.trim().toLowerCase()));
}

export async function getAdminActivitySummary(): Promise<AdminActivitySummary[]> {
  const sql = getSql();
  const rows = await sql.query(`
    SELECT
      activity.id,
      activity.type,
      activity.title,
      activity.capacity,
      activity.capacity_unit,
      CASE WHEN activity.capacity_unit = 'equipos'
        THEN COUNT(DISTINCT enrollment.team_id) FILTER (WHERE enrollment.status = 'Confirmado')
        ELSE COUNT(enrollment.id) FILTER (WHERE enrollment.status = 'Confirmado') END::INTEGER AS confirmed,
      CASE WHEN activity.capacity_unit = 'equipos'
        THEN COUNT(DISTINCT enrollment.team_id) FILTER (WHERE enrollment.status = 'Cancelado')
        ELSE COUNT(enrollment.id) FILTER (WHERE enrollment.status = 'Cancelado') END::INTEGER AS cancelled,
      GREATEST(activity.capacity - activity.reserved_count, 0)::INTEGER AS remaining
    FROM activities AS activity
    LEFT JOIN activity_enrollments AS enrollment ON enrollment.activity_id = activity.id
    WHERE activity.id > 0
    GROUP BY activity.id
    ORDER BY activity.type, activity.title
  `);

  return rows.map((row) => ({
    id: row.id as number,
    type: row.type as "Taller" | "Concurso",
    title: row.title as string,
    capacity: row.capacity as number,
    confirmed: row.confirmed as number,
    cancelled: row.cancelled as number,
    remaining: row.remaining as number,
    capacityUnit: row.capacity_unit as "personas" | "equipos",
  }));
}

export async function getAdminEnrollments(
  filters: AdminEnrollmentFilters = {},
): Promise<AdminEnrollment[]> {
  const search = filters.search?.trim().slice(0, 160) || null;
  const activityId = Number.isInteger(filters.activityId) ? filters.activityId! : null;
  const status =
    filters.status === "Confirmado" || filters.status === "Cancelado"
      ? filters.status
      : null;
  const sql = getSql();
  const rows = await sql.query(
    `
      SELECT
        enrollment.id,
        enrollment.activity_id,
        activity.type AS activity_type,
        activity.title AS activity_title,
        enrollment.participant_id,
        enrollment.participant_email,
        enrollment.participant_name,
        enrollment.status,
        enrollment.created_at,
        enrollment.cancelled_at,
        enrollment.cancelled_by,
        enrollment.cancellation_reason
        , team.name AS team_name
      FROM activity_enrollments AS enrollment
      INNER JOIN activities AS activity ON activity.id = enrollment.activity_id
      LEFT JOIN activity_teams AS team ON team.id = enrollment.team_id
      WHERE activity.id > 0
        AND ($1::INTEGER IS NULL OR activity.id = $1)
        AND ($2::TEXT IS NULL OR enrollment.status = $2)
        AND (
          $3::TEXT IS NULL
          OR enrollment.participant_name ILIKE '%' || $3 || '%'
          OR enrollment.participant_email ILIKE '%' || $3 || '%'
          OR enrollment.participant_id ILIKE '%' || $3 || '%'
        )
      ORDER BY enrollment.created_at DESC, enrollment.id DESC
    `,
    [activityId, status, search],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    activityId: row.activity_id as number,
    activityType: row.activity_type as "Taller" | "Concurso",
    activityTitle: row.activity_title as string,
    participantId: row.participant_id as string,
    participantEmail: row.participant_email as string,
    participantName: row.participant_name as string,
    status: row.status as "Confirmado" | "Cancelado",
    createdAt: row.created_at as string,
    ...(row.cancelled_at ? { cancelledAt: row.cancelled_at as string } : {}),
    ...(row.cancelled_by ? { cancelledBy: row.cancelled_by as string } : {}),
    ...(row.cancellation_reason
      ? { cancellationReason: row.cancellation_reason as string }
      : {}),
    ...(row.team_name ? { teamName: row.team_name as string } : {}),
  }));
}

export async function cancelEnrollmentAsAdmin(input: {
  enrollmentId: number;
  adminEmail: string;
  reason: AdminCancellationReason;
  detail?: string;
}) {
  const label = ADMIN_CANCELLATION_REASONS[input.reason];
  const detail = input.detail?.trim().slice(0, 240);

  if (!label || (input.reason === "other" && !detail)) {
    throw new Error("Selecciona un motivo válido y agrega la explicación requerida.");
  }

  const completeReason = detail ? `${label}: ${detail}` : label;
  const sql = getSql();
  const rows = await sql.query(
    "SELECT * FROM admin_cancel_activity_enrollment($1, $2, $3)",
    [input.enrollmentId, input.adminEmail, completeReason],
  );

  return rows[0] as {
    outcome: "cancelled" | "already_cancelled" | "not_found";
    remaining_capacity: number | null;
  };
}
