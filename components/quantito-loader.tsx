import Image from "next/image";

import quantito from "@/public/branding/quantito-transparent.png";

type QuantitoLoaderProps = {
  message?: string;
  detail?: string;
  variant?: "page" | "overlay" | "inline";
};

export function QuantitoLoader({
  message = "Preparando tu espacio…",
  detail = "Estamos verificando tu registro e inscripciones.",
  variant = "page",
}: QuantitoLoaderProps) {
  return (
    <div
      className={`quantito-loader quantito-loader-${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="quantito-loader-card">
        <div className="quantito-loader-mascot" aria-hidden="true">
          <span className="quantito-bubble quantito-bubble-one" />
          <span className="quantito-bubble quantito-bubble-two" />
          <span className="quantito-bubble quantito-bubble-three" />
          <Image
            src={quantito}
            alt=""
            priority={variant !== "inline"}
            placeholder="blur"
            sizes={variant === "inline" ? "72px" : "140px"}
          />
        </div>
        <div className="quantito-loader-copy">
          <strong>{message}</strong>
          {detail ? <span>{detail}</span> : null}
        </div>
        <div className="quantito-loader-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
