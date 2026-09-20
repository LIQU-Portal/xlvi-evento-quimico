"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { signInWithGoogle } from "@/app/auth-actions";

const links = [
  ["Programa", "/#programa"],
  ["Conferencias", "/?tipo=conferencia#programa"],
  ["Talleres", "/?tipo=taller#programa"],
  ["Concursos", "/?tipo=concurso#programa"],
  ["Información", "/#informacion"],
];

type SiteHeaderProps = {
  user?: {
    name?: string | null;
    image?: string | null;
  } | null;
};

function getInitials(name: string | null | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return "U";
  return `${parts[0][0]}${parts.length > 1 ? parts.at(-1)?.[0] : ""}`.toUpperCase();
}

function getGoogleProfileImage(image: string | null | undefined) {
  if (!image) return null;
  try {
    const url = new URL(image);
    return url.protocol === "https:" && url.hostname === "lh3.googleusercontent.com"
      ? image
      : null;
  } catch {
    return null;
  }
}

export function SiteHeader({ user }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const profileImage = getGoogleProfileImage(user?.image);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/#inicio" className="brand" aria-label="Ir al inicio">
          <Image src="/branding/isotipo.svg" alt="" width={42} height={42} priority />
          <span><b>XLVI</b> Evento del Químico</span>
        </Link>
        <button
          className="menu-button"
          aria-expanded={open}
          aria-controls="main-menu"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav id="main-menu" className={open ? "nav-links open" : "nav-links"} aria-label="Navegación principal">
          {links.map(([label, href]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
          ))}
          {user ? (
            <Link className="account-link account-link-user" href="/mi-cuenta" onClick={() => setOpen(false)}>
              <span className="account-avatar" aria-hidden="true">
                {profileImage && !imageFailed ? (
                  <Image
                    src={profileImage}
                    alt=""
                    width={30}
                    height={30}
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                  />
                ) : getInitials(user.name)}
              </span>
              Mi cuenta
            </Link>
          ) : (
            <form action={signInWithGoogle} className="header-login-form">
              <button className="account-link" type="submit" onClick={() => setOpen(false)}>Log in</button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
