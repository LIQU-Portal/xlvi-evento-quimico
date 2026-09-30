import { BadgeCheck, LogOut, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { AccountActivityEnrollments } from "@/components/account-activity-enrollments";
import { ConfirmationEmailButton } from "@/components/confirmation-email-button";
import { ParticipantQr } from "@/components/participant-qr";
import { ProfileAvatar } from "@/components/profile-avatar";
import { RegistrationForm } from "@/components/registration-form";
import {
  getAccountType,
  lookupRegistration,
} from "@/lib/registration";
import { getParticipantActivityEnrollments } from "@/lib/activity-registration";
import { isActivityAdmin } from "@/lib/activity-admin";

export default async function MiCuentaPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/api/auth/signin?callbackUrl=/mi-cuenta");
  }

  const email = session.user.email.trim().toLowerCase();
  const name = session.user.name?.trim() || "Sin nombre registrado";
  const accountType = getAccountType(email);
  const [lookup, activityEnrollments] = await Promise.all([
    lookupRegistration(email),
    getParticipantActivityEnrollments(email),
  ]);
  const canAdministerActivities = isActivityAdmin(email);
  const firstName = name.split(/\s+/)[0];

  return (
    <main className="account-page">
      <div className="account-orb account-orb-one" aria-hidden="true" />
      <div className="account-orb account-orb-two" aria-hidden="true" />

      <div className="account-container">
        <header className="account-header">
          <Link href="/" className="account-brand">
            <Image
              src="/branding/logo-evento-2026.png"
              alt="XLVI Evento del Químico 2026"
              width={1776}
              height={888}
              priority
            />
          </Link>

          <div className="account-header-actions">
            {canAdministerActivities && (
              <Link className="account-admin-link" href="/administracion/inscripciones">
                <ShieldCheck size={16} /> Administración
              </Link>
            )}
            <Link href="/">Volver al sitio</Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit">
                <LogOut size={16} /> Cerrar sesión
              </button>
            </form>
          </div>
        </header>

        <section className="account-intro" aria-labelledby="account-title">
          <div className="account-intro-identity">
            <ProfileAvatar
              name={name}
              image={session.user.image}
              className="account-profile-avatar"
            />
            <div className="account-intro-copy">
              <p>Área personal · Mi cuenta</p>
              <h1 id="account-title">Hola, {firstName}</h1>
              <span>{email}</span>
            </div>
          </div>
        </section>

        <dl className="account-summary-strip">
          <div><dt>Tipo de cuenta</dt><dd>{accountType}</dd></div>
          <div>
            <dt>Registro</dt>
            <dd className={lookup.registration ? "is-confirmed" : "is-pending"}>
              {lookup.registration
                ? "Confirmado"
                : lookup.state === "unavailable"
                  ? "No disponible"
                  : "Pendiente"}
            </dd>
          </div>
          <div><dt>Carrera</dt><dd>{lookup.registration?.affiliation ?? "Por confirmar"}</dd></div>
        </dl>

        {lookup.registration ? (
          <div className="account-dashboard">
            <section className="account-access-card" aria-labelledby="account-access-title">
              <span className="registration-status"><BadgeCheck size={16} /> Registro confirmado</span>
              <h2 id="account-access-title">Tu acceso</h2>
              <div className="account-participant-id">
                <span>ID de participante</span>
                <strong>{lookup.registration.id}</strong>
              </div>
              <ParticipantQr participantId={lookup.registration.id} token={lookup.registration.qrToken} />
              {lookup.registration.confirmationEmailSentAt ? (
                <p className="confirmation-email-sent">Confirmación enviada por correo.</p>
              ) : (
                <ConfirmationEmailButton />
              )}
            </section>

            <AccountActivityEnrollments enrollments={activityEnrollments} />
          </div>
        ) : lookup.state === "unavailable" ? (
          <section className="registration-card account-registration-pending">
            <p className="eyebrow">Consulta temporalmente no disponible</p>
            <h2>No necesitas registrarte otra vez</h2>
            <p>
              No pudimos consultar tu registro en este momento. Recarga la
              página en unos minutos; tus datos y tus inscripciones siguen
              guardados.
            </p>
          </section>
        ) : (
          <section className="registration-card account-registration-pending">
            <RegistrationForm
              name={name}
              email={email}
              accountType={accountType}
              serviceAvailable
            />
          </section>
        )}
      </div>
    </main>
  );
}
