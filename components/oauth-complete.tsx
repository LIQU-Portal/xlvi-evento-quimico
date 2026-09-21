"use client";

import { useEffect } from "react";

export function OAuthComplete() {
  useEffect(() => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage("evento-quimico:oauth-complete", window.location.origin);
      window.close();
      return;
    }

    window.location.replace("/mi-cuenta");
  }, []);

  return <p>Acceso correcto. Regresando a tu cuenta…</p>;
}
