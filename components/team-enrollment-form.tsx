"use client";

import { CheckCircle2, Plus, Trash2, UsersRound, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { enrollTeamInActivity, validateTeamMembers } from "@/app/activity-registration-actions";
import { containsEmailAddress } from "@/lib/team-registration";

export function TeamEnrollmentForm({ activityId, minMembers, maxMembers }: { activityId: number; minMembers: number; maxMembers: number }) {
  const router = useRouter();
  const [emails, setEmails] = useState<string[]>(Array.from({ length: Math.max(minMembers - 1, 0) }, () => ""));
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<Array<{ email: string; valid: boolean; name: string }>>([]);
  const [feedback, setFeedback] = useState("");
  const [validated, setValidated] = useState(false);
  const [pending, startTransition] = useTransition();
  const requiresTeamName = emails.some((email) => email.trim());
  const cleanTeamName = teamName.trim();
  const teamNameError = containsEmailAddress(cleanTeamName)
    ? "Escribe un nombre para tu equipo, no un correo."
    : requiresTeamName && cleanTeamName.length < 2
      ? "Escribe el nombre del equipo."
      : "";

  const changeEmail = (index: number, value: string) => {
    setEmails((current) => current.map((email, position) => position === index ? value : email));
    setValidated(false); setMembers([]); setFeedback("");
  };
  const validate = () => startTransition(async () => {
    try {
      const result = await validateTeamMembers(activityId, emails);
      setMembers(result.members); setValidated(result.status === "success"); setFeedback(result.message);
    } catch (error) {
      console.error("No fue posible validar el equipo:", error);
      setValidated(false); setFeedback("La conexión tardó demasiado. Intenta nuevamente.");
    }
  });
  const submit = () => startTransition(async () => {
    try {
      const result = await enrollTeamInActivity(activityId, teamName, emails);
      setFeedback(result.message);
      if (result.status === "success") router.refresh();
    } catch (error) {
      console.error("No fue posible inscribir el equipo:", error);
      setFeedback("La conexión tardó demasiado. Revisa Mi cuenta antes de volver a intentarlo.");
    }
  });

  return (
    <div className="team-enrollment-form">
      <div className="team-form-heading"><UsersRound /><div><strong>Inscribe a tu equipo</strong><span>Tú ya cuentas como integrante 1.</span></div></div>
      {maxMembers > 1 && (
        <label>
          Nombre del equipo
          <input
            value={teamName}
            onChange={(event) => {
              setTeamName(event.target.value);
              setFeedback("");
            }}
            maxLength={80}
            placeholder="Ej. Los Catalizadores"
            aria-invalid={Boolean(teamNameError)}
            aria-describedby={teamNameError ? `team-name-error-${activityId}` : undefined}
          />
          {teamNameError && (
            <small id={`team-name-error-${activityId}`} className="team-field-error">
              {teamNameError}
            </small>
          )}
        </label>
      )}
      <div className="team-email-list">
        {emails.map((email, index) => (
          <label key={index}>Integrante {index + 2}<div><input type="email" value={email} onChange={(event) => changeEmail(index, event.target.value)} placeholder="correo@alumnos.udg.mx" required /><button type="button" aria-label={`Quitar integrante ${index + 2}`} disabled={emails.length <= Math.max(minMembers - 1, 0)} onClick={() => { setEmails((current) => current.filter((_, position) => position !== index)); setValidated(false); }}><Trash2 /></button></div></label>
        ))}
      </div>
      {emails.length < maxMembers - 1 && <button className="team-add-member" type="button" onClick={() => { setEmails((current) => [...current, ""]); setValidated(false); }}><Plus /> Agregar integrante</button>}
      <p className="team-size-note">{minMembers === maxMembers ? `${minMembers} integrantes obligatorios` : `De ${minMembers} a ${maxMembers} integrantes`}</p>
      <button className="activity-registration-button" type="button" disabled={pending || Boolean(teamNameError) || emails.some((email) => !email.trim())} onClick={validated ? submit : validate}>{pending ? "Revisando…" : validated ? "Confirmar inscripción" : "Validar equipo"}</button>
      {members.length > 0 && <ul className="team-validation-list">{members.map((member) => <li key={member.email} className={member.valid ? "valid" : "invalid"}>{member.valid ? <CheckCircle2 /> : <XCircle />}<span>{member.valid ? member.name : member.email}</span></li>)}</ul>}
      {feedback && <p className="team-feedback" role="status">{feedback}</p>}
    </div>
  );
}
