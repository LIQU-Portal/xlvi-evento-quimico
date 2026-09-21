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
      <h3 className="sr-only" id="participant-qr-title">Código QR del evento</h3>
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
        <p>Tu QR es personal. Tenlo listo al ingresar.</p>
        <button type="button" onClick={downloadQr}>
          <Download size={17} /> Descargar QR
        </button>
      </div>
    </section>
  );
}
