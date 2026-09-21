import type { ProgramItem } from "@/config/content";
import { getSql, hasDatabaseConfiguration } from "@/lib/db";

export type ActivityRegistrationStatus =
  | "open"
  | "disabled"
  | "upcoming"
  | "closed"
  | "full"
  | "unavailable";

export type ActivityAvailability = {
  activityId: number;
  status: ActivityRegistrationStatus;
  capacity?: number;
  reservedCount?: number;
  remainingCapacity?: number;
  opensAt?: string;
  closesAt?: string;
  capacityUnit?: "personas" | "equipos";
  minMembers?: number;
  maxMembers?: number;
};

export type ActivityAvailabilityMap = Record<number, ActivityAvailability>;

export type EnrollmentOutcome =
  | "confirmed"
  | "already_enrolled"
  | "disabled"
  | "upcoming"
  | "closed"
  | "full"
  | "not_found";

export type ParticipantActivityEnrollment = {
  activityId: number;
  type: "Taller" | "Concurso";
  title: string;
  status: "Confirmado";
  createdAt: string;
  closesAt?: string;
  canCancel: boolean;
  teamName?: string;
  teamMembers?: string[];
  isTeamCaptain?: boolean;
};

export type CancellationOutcome =
  | "cancelled"
  | "already_cancelled"
  | "cancellation_closed"
  | "captain_required"
  | "not_found";

type ActivityConfig = {
  id: number;
  type: "Taller" | "Concurso";
  title: string;
  capacity: number;
  registrationEnabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  capacityUnit: "personas" | "equipos";
  minMembers: number;
  maxMembers: number;
};

function parseLocalDateTime(value: string | undefined): string | null {
  const input = value?.trim();

  if (!input) return null;

  const localMatch = input.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  const candidate = localMatch
    ? `${localMatch[1]}-${localMatch[2]}-${localMatch[3]}T${localMatch[4]}:${localMatch[5]}:${localMatch[6] ?? "00"}-06:00`
    : input;
  const date = new Date(candidate);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getActivityConfig(item: ProgramItem): ActivityConfig | null {
  if (item.type !== "Taller" && item.type !== "Concurso") return null;
  if (!item.registrationCapacity || item.registrationCapacity < 1) return null;

  const opensAt = parseLocalDateTime(item.registrationOpenAt);
  const closesAt = parseLocalDateTime(item.registrationCloseAt);
  const datesAreValid =
    (!item.registrationOpenAt || opensAt) &&
    (!item.registrationCloseAt || closesAt) &&
    (!opensAt || !closesAt || new Date(closesAt) > new Date(opensAt));

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    capacity: item.registrationCapacity,
    registrationEnabled: item.registrationEnabled === true && Boolean(datesAreValid),
    opensAt,
    closesAt,
    capacityUnit: item.capacityUnit === "equipos" ? "equipos" : "personas",
    minMembers: item.minMembers ?? 1,
    maxMembers: item.maxMembers ?? 1,
  };
}

async function syncActivity(config: ActivityConfig) {
  const sql = getSql();
  const rows = await sql.query(
    `
      WITH upsert AS (
      INSERT INTO activities (
        id, type, title, capacity, registration_enabled, opens_at, closes_at,
        capacity_unit, min_members, max_members
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        title = EXCLUDED.title,
        capacity = GREATEST(EXCLUDED.capacity, activities.reserved_count),
        registration_enabled = EXCLUDED.registration_enabled,
        opens_at = EXCLUDED.opens_at,
        closes_at = EXCLUDED.closes_at,
        capacity_unit = EXCLUDED.capacity_unit,
        min_members = EXCLUDED.min_members,
        max_members = EXCLUDED.max_members,
        updated_at = NOW()
      RETURNING id
      )
      UPDATE activities
      SET reserved_count = CASE
            WHEN capacity_unit = 'personas' THEN (
              SELECT COUNT(*)::INTEGER
              FROM activity_enrollments
              WHERE activity_id = activities.id AND status = 'Confirmado'
            )
            ELSE (
              SELECT COUNT(DISTINCT COALESCE(team_id, -activity_enrollments.id))::INTEGER
              FROM activity_enrollments
              WHERE activity_id = activities.id AND status = 'Confirmado'
            )
          END,
          updated_at = NOW()
      WHERE id = (SELECT id FROM upsert)
      RETURNING
        id,
        capacity,
        reserved_count,
        registration_enabled,
        opens_at,
        closes_at,
        capacity_unit,
        min_members,
        max_members,
        CASE
          WHEN NOT registration_enabled THEN 'disabled'
          WHEN opens_at IS NOT NULL AND NOW() < opens_at THEN 'upcoming'
          WHEN closes_at IS NOT NULL AND NOW() >= closes_at THEN 'closed'
          WHEN reserved_count >= capacity THEN 'full'
          ELSE 'open'
        END AS status
    `,
    [
      config.id,
      config.type,
      config.title,
      config.capacity,
      config.registrationEnabled,
      config.opensAt,
      config.closesAt,
      config.capacityUnit,
      config.minMembers,
      config.maxMembers,
    ],
  );

  return rows[0] as {
    id: number;
    capacity: number;
    reserved_count: number;
    registration_enabled: boolean;
    opens_at: string | null;
    closes_at: string | null;
    capacity_unit: "personas" | "equipos";
    min_members: number;
    max_members: number;
    status: Exclude<ActivityRegistrationStatus, "unavailable">;
  };
}

export async function syncProgramActivities(
  items: ProgramItem[],
): Promise<ActivityAvailabilityMap> {
  const registrableItems = items.filter(
    (item) => item.type === "Taller" || item.type === "Concurso",
  );
  const unavailable = Object.fromEntries(
    registrableItems.map((item) => [
      item.id,
      { activityId: item.id, status: "unavailable" as const },
    ]),
  );

  if (!hasDatabaseConfiguration()) return unavailable;

  try {
    const synced = await Promise.all(
      registrableItems.map(async (item) => {
        const config = getActivityConfig(item);
        if (!config) return null;
        return syncActivity(config);
      }),
    );

    return synced.reduce<ActivityAvailabilityMap>((result, activity) => {
      if (!activity) return result;

      result[activity.id] = {
        activityId: activity.id,
        status: activity.status,
        capacity: activity.capacity,
        reservedCount: activity.reserved_count,
        remainingCapacity: activity.capacity - activity.reserved_count,
        ...(activity.opens_at ? { opensAt: activity.opens_at } : {}),
        ...(activity.closes_at ? { closesAt: activity.closes_at } : {}),
        capacityUnit: activity.capacity_unit,
        minMembers: activity.min_members,
        maxMembers: activity.max_members,
      };
      return result;
    }, unavailable);
  } catch (error) {
    console.error("No fue posible sincronizar las actividades con Neon:", error);
    return unavailable;
  }
}

export async function enrollParticipant(input: {
  activity: ProgramItem;
  participantId: string;
  email: string;
  name: string;
}) {
  const config = getActivityConfig(input.activity);

  if (!config) {
    return { outcome: "not_found" as const, remainingCapacity: null };
  }

  await syncActivity(config);

  const sql = getSql();
  const rows = await sql.query(
    "SELECT * FROM enroll_in_activity($1, $2, $3, $4)",
    [config.id, input.participantId, input.email, input.name],
  );
  const result = rows[0] as {
    outcome: EnrollmentOutcome;
    remaining_capacity: number | null;
  };

  return {
    outcome: result.outcome,
    remainingCapacity: result.remaining_capacity,
  };
}

export async function enrollTeam(input: {
  activity: ProgramItem;
  teamName: string;
  members: Array<{ id: string; email: string; name: string }>;
}) {
  const config = getActivityConfig(input.activity);

  if (
    !config ||
    config.type !== "Concurso" ||
    (config.minMembers <= 1 && config.maxMembers <= 1)
  ) {
    return { outcome: "not_found" as const, remainingCapacity: null };
  }

  await syncActivity(config);
  const sql = getSql();
  const rows = await sql.query(
    "SELECT * FROM enroll_team_in_activity($1, $2, $3::TEXT[], $4::TEXT[], $5::TEXT[])",
    [
      config.id,
      input.teamName,
      input.members.map((member) => member.id),
      input.members.map((member) => member.email),
      input.members.map((member) => member.name),
    ],
  );
  const result = rows[0] as {
    outcome: EnrollmentOutcome | "invalid_team" | "member_already_enrolled";
    remaining_capacity: number | null;
  };

  return {
    outcome: result.outcome,
    remainingCapacity: result.remaining_capacity,
  };
}

export async function getParticipantActivityEnrollments(
  email: string,
): Promise<ParticipantActivityEnrollment[]> {
  if (!hasDatabaseConfiguration()) return [];

  const sql = getSql();
  const rows = await sql.query(
    `
      SELECT
        enrollment.activity_id,
        activity.type,
        activity.title,
        enrollment.status,
        enrollment.created_at,
        activity.closes_at,
        team.name AS team_name,
        team.captain_email,
        CASE WHEN enrollment.team_id IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY(
          SELECT member.participant_name
          FROM activity_enrollments AS member
          WHERE member.team_id = enrollment.team_id
            AND member.status = 'Confirmado'
          ORDER BY member.id
        ) END AS team_members,
        (activity.closes_at IS NULL OR NOW() < activity.closes_at) AS can_cancel
      FROM activity_enrollments AS enrollment
      INNER JOIN activities AS activity ON activity.id = enrollment.activity_id
      LEFT JOIN activity_teams AS team ON team.id = enrollment.team_id
      WHERE LOWER(enrollment.participant_email) = LOWER($1)
        AND enrollment.status = 'Confirmado'
      ORDER BY enrollment.created_at
    `,
    [email],
  );

  return rows.map((row) => ({
    activityId: row.activity_id as number,
    type: row.type as "Taller" | "Concurso",
    title: row.title as string,
    status: "Confirmado" as const,
    createdAt: row.created_at as string,
    ...(row.closes_at ? { closesAt: row.closes_at as string } : {}),
    canCancel: row.can_cancel as boolean,
    ...(row.team_name ? { teamName: row.team_name as string } : {}),
    ...(Array.isArray(row.team_members) && row.team_members.length
      ? { teamMembers: row.team_members as string[] }
      : {}),
    isTeamCaptain:
      !row.team_name ||
      String(row.captain_email).toLowerCase() === email.toLowerCase(),
  }));
}

export async function getParticipantEnrollmentActivityIds(
  email: string | null | undefined,
): Promise<number[]> {
  if (!email) return [];

  try {
    const enrollments = await getParticipantActivityEnrollments(email);
    return enrollments.map((enrollment) => enrollment.activityId);
  } catch (error) {
    console.error("No fue posible consultar las inscripciones del participante:", error);
    return [];
  }
}

export async function cancelParticipantEnrollment(input: {
  activityId: number;
  participantId: string;
  email: string;
}) {
  const sql = getSql();
  const rows = await sql.query(
    "SELECT * FROM cancel_activity_enrollment($1, $2, $3, $4, $5)",
    [
      input.activityId,
      input.participantId,
      input.email,
      input.email,
      "Cancelación solicitada por el participante desde Mi cuenta",
    ],
  );
  const result = rows[0] as {
    outcome: CancellationOutcome;
    remaining_capacity: number | null;
  };

  return {
    outcome: result.outcome,
    remainingCapacity: result.remaining_capacity,
  };
}
