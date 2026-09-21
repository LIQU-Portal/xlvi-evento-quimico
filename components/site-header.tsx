"use client";

import { LogOut, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { signOutToHome } from "@/app/auth-actions";
import { GoogleLoginButton } from "@/components/google-login-button";
import { ProfileAvatar } from "@/components/profile-avatar";

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

export function SiteHeader({ user }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);

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
            <div className="account-session-actions">
              <Link className="account-link account-link-user" href="/mi-cuenta" onClick={() => setOpen(false)}>
                <ProfileAvatar name={user.name} image={user.image} />
                <span>Mi cuenta</span>
              </Link>
              <form action={signOutToHome}>
                <button className="header-sign-out" type="submit" aria-label="Cerrar sesión" title="Cerrar sesión">
                  <LogOut size={17} />
                </button>
              </form>
            </div>
          ) : (
            <div className="header-login-form" onClick={() => setOpen(false)}>
              <GoogleLoginButton />
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
