"use client";

import { Mail } from "lucide-react";
import { useActionState } from "react";

import {
  sendConfirmationEmail,
  type ConfirmationEmailActionState,
} from "@/app/mi-cuenta/actions";
import { QuantitoLoader } from "@/components/quantito-loader";

const initialState: ConfirmationEmailActionState = {
  status: "idle",
  message: "",
};

export function ConfirmationEmailButton() {
  const [state, action, pending] = useActionState(
    sendConfirmationEmail,
    initialState,
  );

  return (
    <form action={action} className="confirmation-email-action">
      <button type="submit" disabled={pending}>
        <Mail size={17} />
        {pending ? "Enviando…" : "Enviar correo con mi QR"}
      </button>
      {pending ? (
        <QuantitoLoader
          variant="inline"
          message="Enviando tu QR…"
          detail="Esto puede tomar unos segundos."
        />
      ) : null}
      {state.message && (
        <p
          className={
            state.status === "error"
              ? "registration-error"
              : "registration-notice"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
