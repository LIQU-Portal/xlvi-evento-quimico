# XLVI Evento del Químico — V0 visual

Sitio público preliminar construido con Next.js, TypeScript y pnpm. La identidad, el contenido y los recursos provisionales están separados para facilitar la revisión antes de conectar GitHub y Vercel.

## Abrirlo en Windows con VS Code

1. Descomprime la carpeta y ábrela en VS Code: **Archivo → Abrir carpeta**.
2. Abre **Terminal → Nueva terminal**.
3. Ejecuta:

```powershell
pnpm install
pnpm dev
```

4. Abre `http://localhost:3000`.
5. Para comprobar la versión final:

```powershell
pnpm build
pnpm start
```

Requisito recomendado: Node.js 20.9 o posterior y pnpm 10.

## Dónde cambiar cada cosa

- Contenido, fechas, programa, aliados y datos: `config/content.ts`
- Colores, tipografías, espacios y apariencia: `app/globals.css` (variables al inicio)
- Logo provisional: `public/branding/`
- Punto futuro de Google Sheets: `lib/sheets.ts`
- Estructura de la página: `app/page.tsx`

Los logotipos incluidos son provisionales y editables; no son logos oficiales. Para sustituirlos, conserva los nombres `isotipo.svg` y `logo-horizontal.svg`.

## Flujo posterior: GitHub → Vercel

Cuando el diseño y el contenido estén aprobados:

```powershell
git init
git add .
git commit -m "V0 - sitio público e identidad visual provisional"
git branch -M main
git remote add origin URL_DEL_REPOSITORIO
git push -u origin main
```

Después, en el proyecto existente de Vercel, conecta ese repositorio y selecciona `main` como rama de producción. Cada `push` generará una nueva compilación; usa las vistas previas de Vercel para revisar cambios antes de llevarlos a producción.

## Alcance de esta entrega

Incluye Header, Hero, modelo mixto, programa filtrable, conferencias, talleres, concursos, aliados, información general y Footer. No incluye login, roles, registro seguro, QR, constancias, formularios persistentes ni backend dinámico.
