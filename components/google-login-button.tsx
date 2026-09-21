"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 680;

export function GoogleLoginButton() {
  const router = useRouter();

  useEffect(() => {
    const completeLogin = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data !== "evento-quimico:oauth-complete") {
        return;
      }
      router.push("/mi-cuenta");
    };

    window.addEventListener("message", completeLogin);
    return () => window.removeEventListener("message", completeLogin);
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
      router.push("/iniciar-sesion");
      return;
    }

    popup.focus();
  };

  return (
    <button className="account-link" type="button" onClick={openLogin}>
      Log in
    </button>
  );
}
