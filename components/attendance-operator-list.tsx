"use client";

import { useState } from "react";
import { AttendanceAdminForm } from "@/components/attendance-admin-form";
import { operatorCanScan, type AttendanceOperatorOption } from "@/lib/attendance-operator-list";
import type { AttendanceSession } from "@/lib/attendance-rules";

export function AttendanceOperatorList({ operators, sessions }: {
  operators: AttendanceOperatorOption[]; sessions: AttendanceSession[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const query = search.trim().toLocaleLowerCase("es");
  const visible = operators.filter((o) => {
    const enabled = operatorCanScan(o);
    return `${o.name ?? ""} ${o.email}`.toLocaleLowerCase("es").includes(query)
      && (filter === "all" || (filter === "enabled" ? enabled : !enabled));
  });
  return <>
    <div className="attendance-filters">
      <label>Buscar staff<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre o correo" /></label>
      <label>Acceso al lector<select aria-label="Acceso al lector" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">Todo el staff disponible</option><option value="enabled">Habilitados</option><option value="disabled">Sin acceso</option>
      </select></label>
    </div>
    <p className="attendance-muted" role="status">{visible.length} de {operators.length} cuentas</p>
    {!operators.length && <p className="attendance-empty">No hay staff confirmado en esta base. Revisa la hoja Staff y sincroniza los participantes.</p>}
    {!!operators.length && !visible.length && <p>No hay coincidencias. Prueba otro nombre o filtro.</p>}
    <div className="attendance-operator-grid">{visible.map((o) => {
      const eligible = o.role === "Staff" && o.status === "Confirmado";
      const enabled = operatorCanScan(o);
      const assigned = sessions.filter((s) => s.active && s.operators?.includes(o.email));
      const status = !eligible ? "No cumple requisitos" : enabled ? "Habilitado" : o.configured ? "Desactivado" : "Sin habilitar";
      return <article key={o.email} className="attendance-operator-card">
        <div className="attendance-card-heading"><strong>{o.name || o.email}</strong><span className="attendance-badge" data-tone={enabled ? "success" : "neutral"}>{status}</span></div>
        <p className="attendance-operator-email">{o.email}</p>
        <p className="attendance-muted">{o.staffType ? `Staff ${o.staffType.toLocaleLowerCase("es")}` : eligible ? "Staff" : "Revisar registro o clasificación"}</p>
        <p>{enabled ? `${assigned.length} sesiones asignadas` : "Sin permiso para registrar"}</p>
        {!!assigned.length && <details className="attendance-assigned-details"><summary>Ver sesiones asignadas</summary><ul>{assigned.map((s) => <li key={s.id}>
          {new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" }).format(new Date(s.startsAt))} · {s.title}
        </li>)}</ul></details>}
        {(eligible || o.active) && <AttendanceAdminForm operation="operator" label={enabled || o.active ? "Desactivar lector" : "Habilitar lector"}>
          <input type="hidden" name="email" value={o.email} /><input type="hidden" name="active" value={String(!o.active)} />
        </AttendanceAdminForm>}
      </article>;
    })}</div>
    <p className="attendance-muted">Esta lista usa el espejo de Neon. Si falta alguien, sincroniza participantes después de actualizar la hoja Staff. Estar en esta lista no concede acceso.</p>
  </>;
}
