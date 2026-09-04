"use client";

import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const links = [
  ["Programa", "#programa"],
  ["Conferencias", "#conferencias"],
  ["Talleres", "#talleres"],
  ["Concursos", "#concursos"],
  ["Información", "#informacion"],
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="#inicio" className="brand" aria-label="Ir al inicio">
          <Image src="/branding/isotipo.svg" alt="" width={42} height={42} priority />
          <span><b>XLVI</b> Evento del Químico</span>
        </a>
        <button className="menu-button" aria-expanded={open} aria-controls="main-menu" aria-label={open ? "Cerrar menú" : "Abrir menú"} onClick={() => setOpen(!open)}>
          {open ? <X /> : <Menu />}
        </button>
        <nav id="main-menu" className={open ? "nav-links open" : "nav-links"} aria-label="Navegación principal">
          {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
        </nav>
      </div>
    </header>
  );
}
