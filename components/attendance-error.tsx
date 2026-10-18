"use client";

import Link from "next/link";

export function AttendanceError({ reset }: { reset: () => void }) {
  return <main style={{ padding: 24, maxWidth: 600, margin: "auto", color: "#0d1b3d" }}>
    <h1>No pudimos abrir el control de asistencia</h1>
    <p>Revisa tu conexión y vuelve a intentar. Si continúa, avisa a tu coordinador para revisar la activación del servicio.</p>
    <button onClick={reset} style={{ padding: 16, marginBottom: 20, background: "#6c2bd9", color: "white", border: 0, borderRadius: 10 }}>Intentar de nuevo</button>
    <p><Link href="/mi-cuenta">Volver a Mi cuenta</Link></p>
  </main>;
}
