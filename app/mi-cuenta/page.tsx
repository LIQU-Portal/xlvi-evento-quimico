import { BadgeCheck, LogOut, ShieldCheck, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { ConfirmationEmailButton } from "@/components/confirmation-email-button";
import { ParticipantQr } from "@/components/participant-qr";
import { RegistrationForm } from "@/components/registration-form";
import {
  getAccountType,
  lookupRegistration,
  type EventRegistration,
} from "@/lib/registration";

function RegistrationDetails({
  registration,
}: {
  registration: EventRegistration;
}) {
  return (
    <div className="registration-confirmation">
      <span className="registration-status">
        <BadgeCheck size={16} /> Registro confirmado
      </span>
      <h2>Ya formas parte del evento</h2>
      <p>
        Conserva tu ID. Más adelante estará asociado con tus inscripciones,
        asistencias y constancia.
      </p>
      <dl className="registration-summary">
        <div>
          <dt>ID de participante</dt>
          <dd>{registration.id}</dd>
        </div>
        <div>
          <dt>Rol reconocido</dt>
          <dd>{registration.role}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{registration.status}</dd>
        </div>
        <div>
          <dt>Carrera</dt>
          <dd>{registration.affiliation}</dd>
        </div>
      </dl>
      <ParticipantQr
        participantId={registration.id}
        token={registration.qrToken}
      />
      {registration.confirmationEmailSentAt ? (
        <p className="confirmation-email-sent">
          Correo de confirmación enviado correctamente.
        </p>
      ) : (
        <ConfirmationEmailButton />
      )}
    </div>
  );
}

export default async function MiCuentaPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/api/auth/signin?callbackUrl=/mi-cuenta");
  }

  const email = session.user.email.trim().toLowerCase();
  const name = session.user.name?.trim() || "Sin nombre registrado";
  const accountType = getAccountType(email);
  const lookup = await lookupRegistration(email);
  const role = lookup.registration?.role ?? (lookup.isStaff ? "Staff" : accountType);

  return (
    <main className="account-page">
      <div className="account-orb account-orb-one" aria-hidden="true" />
      <div className="account-orb account-orb-two" aria-hidden="true" />

      <div className="account-container">
        <header className="account-header">
          <Link href="/" className="account-brand">
            <span>XLVI</span> Evento del Químico
          </Link>

          <div className="account-header-actions">
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
          <div className="account-intro-copy">
            <p>Área personal</p>
            <h1 id="account-title">Mi cuenta</h1>
            <span>Registro e identidad institucional para el evento 2026.</span>
          </div>

          <div className="account-logo-panel">
            <Image
              src="/branding/logo-evento-2026.png"
              alt="XLVI Evento del Químico 2026. Química que evoluciona, futuro que se construye"
              width={1776}
              height={888}
              sizes="(max-width: 800px) 92vw, 520px"
              priority
            />
          </div>
        </section>

        <div className="account-grid">
          <aside className="profile-card">
            <div className="profile-icon">
              <UserRound />
            </div>
            <span>Cuenta institucional</span>
            <h2>{name}</h2>
            <p>{email}</p>

            <dl>
              <div>
                <dt>Tipo de cuenta</dt>
                <dd>{accountType}</dd>
              </div>
              <div>
                <dt>Rol</dt>
                <dd>{role}</dd>
              </div>
              <div>
                <dt>Registro al evento</dt>
                <dd>
                  {lookup.registration ? "Confirmado" : "Pendiente"}
                </dd>
              </div>
            </dl>

            {role === "Staff" && (
              <p className="staff-recognition">
                <ShieldCheck size={18} /> Cuenta reconocida como integrante del
                staff.
              </p>
            )}
          </aside>

          <section className="registration-card">
            {lookup.registration ? (
              <RegistrationDetails registration={lookup.registration} />
            ) : (
              <RegistrationForm
                name={name}
                email={email}
                accountType={accountType}
                serviceAvailable={lookup.state !== "unavailable"}
                serviceMessage={lookup.message}
              />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
