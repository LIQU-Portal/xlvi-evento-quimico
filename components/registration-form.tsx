"use client";

import { useActionState, useState } from "react";

import {
  registerForEvent,
  type RegistrationActionState,
} from "@/app/mi-cuenta/actions";
import { ParticipantQr } from "@/components/participant-qr";
import type { AccountType } from "@/lib/registration";

const initialRegistrationState: RegistrationActionState = {
  status: "idle",
  message: "",
};

const CUCEI_CAREERS = [
  "Licenciatura en Física",
  "Licenciatura en Matemáticas",
  "Licenciatura en Química",
  "Químico Farmacéutico Biólogo",
  "Ingeniería en Ciencia de Materiales",
  "Ingeniería Civil",
  "Ingeniería en Alimentos y Biotecnología",
  "Ingeniería en Topografía Geomática",
  "Ingeniería Industrial",
  "Ingeniería Mecánica Eléctrica",
  "Ingeniería Química",
  "Ingeniería en Logística y Transporte",
  "Ingeniería Informática",
  "Ingeniería Biomédica",
  "Ingeniería en Computación",
  "Ingeniería en Electromovilidad y Autotrónica",
  "Ingeniería en Electrónica y Sistemas Inteligentes",
  "Ingeniería Fotónica",
  "Ingeniería en Mecatrónica Inteligente",
  "Ingeniería Robótica",
  "Licenciatura en Desarrollo de Sistemas Web (Virtual)",
  "Licenciatura en Tecnologías e Información (Virtual)",
] as const;

const OTHER_CAREER = "Otra carrera de la UdeG";

type RegistrationFormProps = {
  name: string;
  email: string;
  accountType: AccountType;
  serviceAvailable: boolean;
  serviceMessage?: string;
};

export function RegistrationForm({
  name,
  email,
  accountType,
  serviceAvailable,
  serviceMessage,
}: RegistrationFormProps) {
  const [careerSelection, setCareerSelection] = useState("");
  const [otherCareer, setOtherCareer] = useState("");
  const [state, formAction, pending] = useActionState(
    registerForEvent,
    initialRegistrationState,
  );

  if (state.status === "success" && state.registration) {
    return (
      <div className="registration-confirmation" role="status">
        <span className="registration-status">Registro confirmado</span>
        <h2>Ya formas parte del evento</h2>
        <p>{state.message}</p>
        <dl className="registration-summary">
          <div>
            <dt>ID de participante</dt>
            <dd>{state.registration.id}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{state.registration.status}</dd>
          </div>
        </dl>
        <ParticipantQr
          participantId={state.registration.id}
          token={state.registration.qrToken}
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="registration-form">
      <div className="registration-heading">
        <span className="registration-status">Registro general</span>
        <h2>Confirma tus datos</h2>
        <p>
          Tu nombre y correo provienen de Google. Completa la información
          institucional para obtener tu ID de participante.
        </p>
      </div>

      <div className="registration-fields">
        <label>
          Nombre
          <input value={name} readOnly aria-readonly="true" />
        </label>

        <label>
          Correo institucional
          <input value={email} readOnly aria-readonly="true" />
        </label>

        <label>
          Tipo de cuenta
          <input value={accountType} readOnly aria-readonly="true" />
        </label>

        <label>
          Código de Alumno/Profesor
          <input
            name="institutionalCode"
            autoComplete="off"
            inputMode="numeric"
            minLength={3}
            maxLength={20}
            required
          />
        </label>

        <label className="registration-wide-field">
          Carrera
          <select
            value={careerSelection}
            onChange={(event) => setCareerSelection(event.target.value)}
            required
          >
            <option value="" disabled>
              Selecciona tu carrera
            </option>
            {CUCEI_CAREERS.map((career) => (
              <option key={career} value={career}>
                {career}
              </option>
            ))}
            <option value={OTHER_CAREER}>{OTHER_CAREER}</option>
          </select>
          <small>
            Ejemplo: Licenciatura en Química o Ingeniería Química.
          </small>
        </label>

        {careerSelection === OTHER_CAREER && (
          <label className="registration-wide-field">
            Escribe tu carrera
            <input
              value={otherCareer}
              onChange={(event) => setOtherCareer(event.target.value)}
              autoComplete="organization"
              minLength={3}
              maxLength={120}
              placeholder="Ejemplo: Licenciatura en Biología"
              required
            />
          </label>
        )}

        <input
          name="affiliation"
          type="hidden"
          value={careerSelection === OTHER_CAREER ? otherCareer : careerSelection}
        />
      </div>

      <label className="registration-consent">
        <input
          name="acceptedPrivacy"
          type="checkbox"
          required
          onInvalid={(event) =>
            event.currentTarget.setCustomValidity(
              "Marca la casilla para continuar.",
            )
          }
          onChange={(event) => event.currentTarget.setCustomValidity("")}
        />
        <span>
          Confirmo que los datos son correctos y acepto que se utilicen para
          la organización, asistencia y constancia del evento.
        </span>
      </label>

      {!serviceAvailable && (
        <p className="registration-notice" role="status">
          {serviceMessage ??
            "El registro se mostrará aquí cuando se conecte Google Sheets."}
        </p>
      )}

      {state.status === "error" && (
        <p className="registration-error" role="alert">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending || !serviceAvailable}>
        {pending ? "Guardando…" : "Confirmar mi registro"}
      </button>
    </form>
  );
}
