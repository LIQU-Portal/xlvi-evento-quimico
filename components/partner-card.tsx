"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

import type { PartnerItem } from "@/config/content";

function PartnerCardContent({ partner }: { partner: PartnerItem }) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <>
      <span>{partner.role}</span>
      <div className="partner-placeholder">
        {partner.logoFileId && !logoFailed ? (
          <Image
            src={`/api/flyers/${encodeURIComponent(partner.logoFileId)}`}
            alt={`Logo de ${partner.name}`}
            width={220}
            height={110}
            sizes="(max-width: 720px) 70vw, 220px"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          partner.initials
        )}
      </div>
      <strong>{partner.name}</strong>
      {partner.provisional ? <small>Por confirmar</small> : null}
      {partner.href ? <ArrowUpRight className="partner-link-icon" aria-hidden="true" /> : null}
    </>
  );
}

export function PartnerCard({ partner }: { partner: PartnerItem }) {
  return partner.href ? (
    <a
      className="partner-card partner-card-link"
      href={partner.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${partner.name}, abrir sitio web`}
    >
      <PartnerCardContent partner={partner} />
    </a>
  ) : (
    <article className="partner-card">
      <PartnerCardContent partner={partner} />
    </article>
  );
}
