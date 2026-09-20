"use client";

import { Download } from "lucide-react";
import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";

type ParticipantQrProps = {
  participantId: string;
  token?: string;
};

export function ParticipantQr({ participantId, token }: ParticipantQrProps) {
  const qrContainerRef = useRef<HTMLDivElement>(null);

  if (!token) {
    return (
      <p className="registration-notice" role="status">
        El QR aparecerá cuando se publique la actualización del servicio de
        registro.
      </p>
    );
  }

  function downloadQr() {
    const canvas = qrContainerRef.current?.querySelector("canvas");
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `QR-${participantId}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <section className="participant-qr" aria-labelledby="participant-qr-title">
      <div ref={qrContainerRef} className="participant-qr-image">
        <QRCodeCanvas
          value={token}
          size={260}
          level="H"
          marginSize={3}
          title={`Código QR del participante ${participantId}`}
        />
      </div>

      <div className="participant-qr-copy">
        <span>Acceso personal</span>
        <h3 id="participant-qr-title">Tu código QR</h3>
        <p>
          Preséntalo para registrar tu acceso y asistencia. Es único,
          personal e intransferible.
        </p>
        <button type="button" onClick={downloadQr}>
          <Download size={17} /> Descargar QR
        </button>
      </div>
    </section>
  );
}
