"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { QuantitoLoader } from "@/components/quantito-loader";

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 680;

export function GoogleLoginButton() {
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  const popupMonitor = useRef<number | null>(null);

  useEffect(() => {
    const completeLogin = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data !== "evento-quimico:oauth-complete") {
        return;
      }
      if (popupMonitor.current) window.clearInterval(popupMonitor.current);
      popupMonitor.current = null;
      setWaiting(true);
      router.push("/mi-cuenta");
    };

    window.addEventListener("message", completeLogin);
    return () => {
      window.removeEventListener("message", completeLogin);
      if (popupMonitor.current) window.clearInterval(popupMonitor.current);
    };
  }, [router]);

  const openLogin = () => {
    const left = Math.max(0, window.screenX + (window.outerWidth - POPUP_WIDTH) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2);
    const popup = window.open(
      "/iniciar-sesion",
      "evento-quimico-google-login",
      `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${Math.round(left)},top=${Math.round(top)}`,
    );

    if (!popup) {
      setWaiting(false);
      router.push("/iniciar-sesion");
      return;
    }

    setWaiting(true);
    if (popupMonitor.current) window.clearInterval(popupMonitor.current);
    popupMonitor.current = window.setInterval(() => {
      if (!popup.closed) return;
      if (popupMonitor.current) window.clearInterval(popupMonitor.current);
      popupMonitor.current = null;
      setWaiting(false);
    }, 500);
    popup.focus();
  };

  return (
    <>
      <button className="account-link" type="button" disabled={waiting} onClick={openLogin}>
        {waiting ? "Conectando…" : "Log in"}
      </button>
      {waiting ? (
        <QuantitoLoader
          variant="overlay"
          message="Conectando con Google…"
          detail="Quantito está preparando tu acceso."
        />
      ) : null}
    </>
  );
}
