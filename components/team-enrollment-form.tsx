"use client";

import { CheckCircle2, Plus, Trash2, UsersRound, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { enrollTeamInActivity, validateTeamMembers } from "@/app/activity-registration-actions";

export function TeamEnrollmentForm({ activityId, minMembers, maxMembers }: { activityId: number; minMembers: number; maxMembers: number }) {
  const router = useRouter();
  const [emails, setEmails] = useState<string[]>(Array.from({ length: Math.max(minMembers - 1, 0) }, () => ""));
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<Array<{ email: string; valid: boolean; name: string }>>([]);
  const [feedback, setFeedback] = useState("");
  const [validated, setValidated] = useState(false);
  const [pending, startTransition] = useTransition();

  const changeEmail = (index: number, value: string) => {
    setEmails((current) => current.map((email, position) => position === index ? value : email));
    setValidated(false); setMembers([]); setFeedback("");
  };
  const validate = () => startTransition(async () => {
    const result = await validateTeamMembers(activityId, emails);
    setMembers(result.members); setValidated(result.status === "success"); setFeedback(result.message);
  });
  const submit = () => startTransition(async () => {
    const result = await enrollTeamInActivity(activityId, teamName, emails);
    setFeedback(result.message);
    if (result.status === "success") router.refresh();
  });

  return (
    <div className="team-enrollment-form">
      <div className="team-form-heading"><UsersRound /><div><strong>Inscribe a tu equipo</strong><span>Tú ya cuentas como integrante 1.</span></div></div>
      {maxMembers > 1 && <label>Nombre del equipo<input value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={80} placeholder="Ej. Los Catalizadores" /></label>}
      <div className="team-email-list">
        {emails.map((email, index) => (
          <label key={index}>Integrante {index + 2}<div><input type="email" value={email} onChange={(event) => changeEmail(index, event.target.value)} placeholder="correo@alumnos.udg.mx" required /><button type="button" aria-label={`Quitar integrante ${index + 2}`} disabled={emails.length <= Math.max(minMembers - 1, 0)} onClick={() => { setEmails((current) => current.filter((_, position) => position !== index)); setValidated(false); }}><Trash2 /></button></div></label>
        ))}
      </div>
      {emails.length < maxMembers - 1 && <button className="team-add-member" type="button" onClick={() => { setEmails((current) => [...current, ""]); setValidated(false); }}><Plus /> Agregar integrante</button>}
      <p className="team-size-note">{minMembers === maxMembers ? `${minMembers} integrantes obligatorios` : `De ${minMembers} a ${maxMembers} integrantes`}</p>
      <button className="activity-registration-button" type="button" disabled={pending || emails.some((email) => !email.trim())} onClick={validated ? submit : validate}>{pending ? "Revisando…" : validated ? "Confirmar inscripción" : "Validar equipo"}</button>
      {members.length > 0 && <ul className="team-validation-list">{members.map((member) => <li key={member.email} className={member.valid ? "valid" : "invalid"}>{member.valid ? <CheckCircle2 /> : <XCircle />}<span>{member.valid ? member.name : member.email}</span></li>)}</ul>}
      {feedback && <p className="team-feedback" role="status">{feedback}</p>}
    </div>
  );
}
