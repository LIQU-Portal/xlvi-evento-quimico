# Registro del Evento del Químico con Google Sheets

Este script convierte una hoja privada en el almacenamiento del registro general.

## Preparación

1. Crea una hoja de cálculo privada para registros.
2. Abre **Extensiones → Apps Script**.
3. Sustituye el contenido de `Code.gs` con el archivo de esta carpeta.
4. Ejecuta manualmente `setupSheets` y autoriza el acceso. Se crearán las pestañas `Registros` y `Staff`.
5. En **Configuración del proyecto → Propiedades del script**, agrega:
   - `REGISTRATION_API_SECRET`: el secreto largo que ya comparte la aplicación.
   - `REGISTRATION_QR_SECRET`: otro valor largo y aleatorio para firmar los QR.
   - `EVENT_BASE_URL`: `https://xlvi-evento-quimico.vercel.app` (sin `/` final).
6. En **Implementar → Nueva implementación**, elige **Aplicación web**:
   - Ejecutar como: tú.
   - Quién tiene acceso: cualquier usuario.
7. Copia la URL terminada en `/exec`.

## Correo y QR

- Ejecuta nuevamente `setupSheets` después de actualizar el script. Esto agrega la columna `confirmationEmailSentAt` sin eliminar registros existentes.
- Ejecuta `checkEmailQuota` una vez y autoriza el permiso de envío de correo.
- Crea una **nueva versión** de la implementación web para publicar el código actualizado. La URL `/exec` puede conservarse.
- El QR contiene únicamente el ID de participante y una firma; no incluye nombre, correo ni código institucional.
- El correo se envía una sola vez. El momento del envío queda guardado en `confirmationEmailSentAt`.
- La imagen del QR se genera dentro de la aplicación y se entrega directamente a Apps Script; no se utiliza un generador de QR externo.

## Variables de la aplicación

Agrega a `.env.local` y posteriormente a Vercel:

```env
REGISTRATION_API_URL=https://script.google.com/macros/s/.../exec
REGISTRATION_API_SECRET=el-mismo-secreto-de-apps-script
```

Nunca publiques el secreto ni agregues `.env.local` a Git.

## Copia rápida en Neon

La aplicación conserva Google Sheets como respaldo del registro general y usa
una copia privada en Neon para cargar `Mi cuenta` sin esperar a Apps Script.

Después de publicar una nueva versión de `Code.gs`, ejecuta una vez:

```powershell
pnpm db:migrate
pnpm db:sync-participants
```

`listRegistrations` solo responde a solicitudes que incluyan
`REGISTRATION_API_SECRET`. El comando no imprime nombres, correos ni códigos;
únicamente informa cuántos registros fueron sincronizados. Los registros nuevos
se copian automáticamente en Neon, por lo que no es necesario ejecutar el
comando diariamente.

## Lista de staff

En la pestaña `Staff` utiliza estas columnas:

| email | name | active | staffType |
| --- | --- | --- | --- |
| persona@alumnos.udg.mx | Nombre de la persona | Sí | Alumno |

La columna `active` acepta `Sí`, `true`, `1` o `activo`. `staffType` acepta
únicamente `Alumno` o `Académico`. La clasificación es explícita y no se deduce
del dominio del correo.

Después de modificar la lista, ejecuta manualmente `setupSheets` y después
`syncStaffClassifications` para actualizar `role` y `staffType` en los registros
existentes. Publica una nueva versión de la aplicación web y sincroniza Neon con
`pnpm db:migrate` y `pnpm db:sync-participants`.
