"use client";

import { Mail } from "lucide-react";
import { useActionState } from "react";

import {
  sendConfirmationEmail,
  type ConfirmationEmailActionState,
} from "@/app/mi-cuenta/actions";

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
