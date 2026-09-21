"use client";

import Image from "next/image";
import { useState } from "react";

function getInitials(name: string | null | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return "U";
  return `${parts[0][0]}${parts.length > 1 ? parts.at(-1)?.[0] : ""}`.toUpperCase();
}

function getGoogleProfileImage(image: string | null | undefined) {
  if (!image) return null;

  try {
    const url = new URL(image);
    const isGoogleImage =
      url.hostname === "googleusercontent.com" ||
      url.hostname.endsWith(".googleusercontent.com");

    return url.protocol === "https:" && isGoogleImage ? image : null;
  } catch {
    return null;
  }
}

export function ProfileAvatar({
  name,
  image,
  className = "",
}: {
  name?: string | null;
  image?: string | null;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const profileImage = getGoogleProfileImage(image);

  return (
    <span className={`account-avatar ${className}`.trim()} aria-hidden="true">
      {profileImage && !imageFailed ? (
        <Image
          src={profileImage}
          alt=""
          width={72}
          height={72}
          referrerPolicy="no-referrer"
          unoptimized
          onError={() => setImageFailed(true)}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
