import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Image src="/branding/isotipo.svg" alt="" width={52} height={52} />
          <div><strong>XLVI Evento del Químico</strong><span>Universidad de Guadalajara · CUCEI</span></div>
        </div>
        <p>Sitio oficial del XLVI Evento del Químico · 2026</p>
        <a href="#inicio">Volver arriba ↑</a>
      </div>
    </footer>
  );
}
