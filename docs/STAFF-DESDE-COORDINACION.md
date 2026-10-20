# Staff desde Coordinación

## Uso habitual

1. En la pestaña Staff: email institucional único, name, active=si, staffType=Alumno o Académico y staffFunction=Registro de asistencia. Se normalizan mayúsculas y espacios según Code.gs.
2. El coordinador pulsa **Actualizar staff desde Sheets** en `/administracion/asistencia`.
3. Quien está confirmado tanto en Sheets como en Neon y tiene el mismo ID aparece disponible. Quien falta en Neon aparece **Registro general pendiente** sin crear ni reemplazar su identidad.
4. El coordinador pulsa **Habilitar lector** y asigna sesiones. El operador ve las asignadas de hoy.

Solo cdquim@cucei.udg.mx y jorge.lopezarce@academicos.udg.mx pueden sincronizar, habilitar o asignar. Staff académico y alumno tienen las mismas reglas. Apoyo operativo no obtiene lector.

Tras editar o retirar personas en Sheets es necesario volver a pulsar Actualizar staff. No se consulta Google en cada QR. Si Google falla se conserva la última lista válida y no se aplica una lista parcial. La operación usa una consulta por intento (hasta tres), no consulta todos los participantes ni usa el fallback del sincronizador masivo.

Cada sincronización guarda una instantánea de auditoría sin QR, secretos ni códigos institucionales. Actualiza únicamente clasificación de identidades coincidentes, no crea usuarios. Desactiva operadores ausentes/inactivos/de apoyo o cuyo registro no coincide. Mantiene asignaciones y lecturas históricas, pero estas no conceden acceso sin elegibilidad. Reactivar en Sheets exige habilitar de nuevo un lector previamente revocado.

## Publicación inicial (no automática)

Este cambio todavía necesita actualización de Apps Script, migración SQL explícita y despliegue de la aplicación. No basta con hacer build. No aplicar durante capturas sin coordinar una ventana corta.

1. Guardar respaldo reciente de producción. Confirmar que no se pisa trabajo concurrente de main.
2. Con cdquim publicar el Code.gs actualizado en la implementación existente, conservando URL /exec y secreto. La nueva acción requiere `name` y `active` además de la clasificación; versiones anteriores se rechazan sin actualizar la lista.
3. Antes de activar la nueva comprobación SQL, confirmar que los operadores actuales conservan función Registro de asistencia. Puede usarse una sola vez el sincronizador local de Staff con revisión y huella exacta, `--skip-missing`, y después `--apply`. No usar db:sync-participants. Esto no habilita nuevos operadores.
4. Aplicar explícitamente `scripts/migrate-attendance.mjs --expected-fingerprint=HUELLA_VERIFICADA` con DATABASE_URL del destino verificado. Actualiza funciones SQL e índice, sin borrar participantes, sesiones, asignaciones ni lecturas. La migración requiere staff_function existente. Nunca se ejecuta durante build.
5. Ejecutar preflight de release para el entorno/destino. Publicar Preview primero con base aislada y probar el flujo. Solo desplegar producción con aprobación.
6. En producción, Actualizar staff desde Sheets y revisar pendientes, lectores habilitados y sesiones. Probar un QR con operador habilitado/asignado y confirmar rechazo a apoyo operativo.

Los ocho registros coincidentes se actualizan sin que una novena cuenta pendiente bloquee el lote. Diferencias de ID o estado quedan sin modificar y sin autorización; requieren revisión independiente, no recreación automática.

## Pruebas aisladas

`node scripts/test-staff-panel.mjs` cubre respuesta de Apps Script, autorización de los dos coordinadores, rechazo de participante, reintentos limitados, fallo de Google sin escrituras, pendientes, soporte, inactividad, retirada, diferencias de ID y preservación de ID/QR. PostgreSQL en memoria, sin servicios externos.

Además: test-sync-staff, test-attendance, test-attendance-auditorium, test-staff-function, lint, TypeScript, build y diff --check. Las pruebas de cámara y la prueba autenticada en Preview siguen siendo una validación posterior; no se simulan como hechas.
