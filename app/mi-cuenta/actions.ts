"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  createRegistration,
  sendRegistrationConfirmation,
  type EventRegistration,
} from "@/lib/registration";

export type RegistrationActionState = {
  status: "idle" | "error" | "success";
  message: string;
  registration?: EventRegistration;
};

export type ConfirmationEmailActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export async function sendConfirmationEmail(
  _previousState: ConfirmationEmailActionState,
): Promise<ConfirmationEmailActionState> {
  void _previousState;
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return {
      status: "error",
      message: "Tu sesión terminó. Vuelve a iniciar sesión con Google.",
    };
  }

  try {
    const result = await sendRegistrationConfirmation(email);
    revalidatePath("/mi-cuenta");
    return { status: "success", message: result.emailMessage };
  } catch (error) {
    console.error("No fue posible enviar el correo de confirmación:", error);
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "No fue posible enviar el correo de confirmación.",
    };
  }
}

export async function registerForEvent(
  _previousState: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  const sessionName = session?.user?.name?.trim();

  if (!email) {
    return {
      status: "error",
      message: "Tu sesión terminó. Vuelve a iniciar sesión con Google.",
    };
  }

  const institutionalCode = String(
    formData.get("institutionalCode") ?? "",
  ).trim();
  const affiliation = String(formData.get("affiliation") ?? "").trim();
  const acceptedPrivacy = formData.get("acceptedPrivacy") === "on";

  if (!/^[A-Za-z0-9-]{3,20}$/.test(institutionalCode)) {
    return {
      status: "error",
      message:
        "Escribe un código de alumno o profesor válido de entre 3 y 20 caracteres.",
    };
  }

  if (affiliation.length < 3 || affiliation.length > 120) {
    return {
      status: "error",
      message: "Selecciona o escribe tu carrera.",
    };
  }

  if (!acceptedPrivacy) {
    return {
      status: "error",
      message: "Debes aceptar el aviso de privacidad para registrarte.",
    };
  }

  try {
    const result = await createRegistration({
      email,
      name: sessionName || email.split("@")[0],
      institutionalCode,
      affiliation,
    });

    revalidatePath("/mi-cuenta");

    return {
      status: "success",
      message:
        result.emailMessage ??
        (result.alreadyRegistered
          ? "Tu registro ya existía y fue recuperado correctamente."
          : "Tu registro al Evento del Químico quedó confirmado y enviamos tu QR por correo."),
      registration: result.registration,
    };
  } catch (error) {
    console.error("No fue posible registrar a la persona:", error);

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Ocurrió un error al guardar el registro.",
    };
  }
}
