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

| email | name | active | staffType | staffFunction |
| --- | --- | --- | --- | --- |
| persona@alumnos.udg.mx | Nombre de la persona | Sí | Alumno | Apoyo operativo |

La columna `active` acepta `Sí`, `true`, `1` o `activo`. `staffType` acepta
únicamente `Alumno` o `Académico`. La clasificación es explícita y no se deduce
del dominio del correo.

`staffFunction` acepta `Apoyo operativo` o `Registro de asistencia`. Puede quedar vacío para
staff ya existente sin clasificar. No se deduce del correo ni del tipo Alumno/Académico.
Sirve como dato para futuras constancias; no crea un rol nuevo, no calcula horas ni concede acceso al lector.
Quien sea apoyo operativo no debe habilitarse como operador. Si ya tenía permiso, desactivarlo
en el panel de coordinación: cambiar esta clasificación por sí solo no revoca permisos explícitos.

### Incorporar la función de staff sin perder registros

1. En el Apps Script de la hoja **de registros**, actualizar `Code.gs`, conservando sus propiedades
   y secretos. Ejecutar `setupSheets`: agrega `staffFunction` al final de Staff (E) y Registros (M),
   sin mover las columnas anteriores. No usar la hoja pública de contenido.
2. Completar Staff!E con los valores anteriores. No cambiar `staffType`.
3. Ejecutar `syncStaffClassifications` para guardar la clasificación de los ya registrados.
   Conserva ID, QR, estado del registro y datos del correo enviado.
4. Publicar una nueva versión de la implementación web existente, conservando `/exec` y el remitente
   `cdquim@cucei.udg.mx`. No crear nuevos secretos ni cambiar la cuenta ejecutora.
5. Antes de desplegar el código web nuevo, aplicar **solo** `database/staff-function.sql` en el
   destino verificado. El script dedicado exige DATABASE_URL y una huella esperada, sin elegir
   las conexiones secundarias heredadas:

```powershell
# Solo Preview/local aislado; NO es un comando de producción.
node --env-file=.env.local scripts/migrate-staff-function.mjs --expected-fingerprint=b619c2fac063
```

Para producción, usar un archivo privado de producción y su huella verificada, con respaldo y
autorización. Esta migración no se ejecuta durante build. No copiar datos de prueba a producción.
6. Actualizar el espejo mediante el flujo de sincronización existente solo después de verificar
   todas sus conexiones: ese script heredado prioriza POSTGRES_URL_NON_POOLING sobre DATABASE_URL.
   No ejecutarlo a ciegas desde el entorno de pruebas. Los nuevos registros también conservan el campo.

Prueba local sin tocar servicios: `pnpm test:staff-function`.

Después de modificar la lista, ejecuta manualmente `setupSheets` y después
`syncStaffClassifications` para actualizar `role`, `staffType` y `staffFunction` en los registros
existentes. Para incorporar `staffFunction`, sigue el procedimiento específico anterior;
no hace falta ejecutar la migración general de la base para añadir esta única columna.
