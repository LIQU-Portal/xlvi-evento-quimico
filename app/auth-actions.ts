"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/mi-cuenta" });
}

export async function signInWithGooglePopup() {
  await signIn("google", { redirectTo: "/auth/completado" });
}

export async function signOutToHome() {
  await signOut({ redirectTo: "/" });
}
