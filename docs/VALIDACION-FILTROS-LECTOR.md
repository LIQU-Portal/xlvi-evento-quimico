# Día y hora en lector y Coordinación — revisión antes de main

## Alcance

La selección del lector usa día (hoy por defecto), hora exacta de inicio y búsqueda por actividad/sede. Se consultan solo sesiones activas asignadas al operador, incluidas otras fechas para planificación. Esto amplía la consulta de fechas, no las asignaciones ni la autorización de captura: cámara, captura física y servidor siguen limitados al día de cada sesión en Ciudad de México. No cambia SQL de captura, QR, permisos de Staff, minutos o constancias. Sin migraciones ni variables nuevas.

- Se elimina Mañana/Tarde.
- Talleres y concursos se agrupan por hora de inicio. La hora figura en el encabezado y el fondo es compartido por actividades simultáneas. Colores estables al buscar, filtrar o cambiar de día; las 13:00 y 15:00 tienen fondos diferentes. El texto siempre distingue la hora: el color no es el único indicador.
- Conferencias separadas en bloque neutro de auditorio.
- Coordinación agrupa por día y hora, con filtros de día/hora/tipo/programa. Se asigna CADA sesión por separado, sin acciones masivas.
- Fechas no actuales: aviso Solo consulta y lector cerrado.
- Conteo de resultados, limpiar filtros y mensajes de lista vacía/sin coincidencias.
- Mientras se registra, no se muestran filtros y se bloquea cambiar de sesión. Al volver se conservan filtros y contadores.
- Hora inicial enviada por el servidor para evitar cambios de orden durante hidratación.
- Se conserva el comportamiento por defecto de listAttendanceSessions: hoy si no se pide explícitamente consultar otras fechas. Solo el lector solicita esa consulta ampliada de sus asignaciones.

## Evidencia local

`node scripts/test-attendance-session-picker.mjs`: fecha de CDMX, búsquedas sin acentos, selección de día y hora, grupos/colores estables, bloque neutro de conferencias y no mutación de props. Ejecuta la consulta REAL de listAttendanceSessions contra PostgreSQL en memoria: por defecto hoy, consulta ampliada solo incluye futuras asignadas y excluye sesiones de otros operadores.

Navegador automatizado sobre lector y Coordinación reales con sesiones ficticias/API interceptada: 375/768/1280 px, navegador en Tokio, filtros combinados y limpieza, grupos de 13h y 15h diferentes, conferencias neutras, pendientes/capturas exitosas/duplicadas/fallidas, contadores persistentes, consulta futura con entrada/cámara deshabilitadas, asignaciones individuales marcadas conservadas y cambio de día que limpia la hora. Sin desbordamiento ni errores no controlados. Capturas guardadas fuera del repositorio, en outputs. No prueba cámara o escáner físico reales.

Regresión aislada: test-attendance y test-attendance-auditorium. Lint, TypeScript, build y diff --check.

## Revisión manual antes de publicar

1. Lector: comprobar que hoy está seleccionado. Elegir una hora y buscar por actividad o sede. Verificar que las actividades simultáneas comparten fondo y las conferencias no usan ese color.
2. Consultar otro día asignado y abrir sesión: debe indicar Solo consulta/Lector cerrado y no permitir lecturas.
3. Coordinación: elegir un día, abrir una sesión, revisar sus operadores. Guardar solo esa sesión; no se asignan automáticamente otras del bloque o del día.
4. En un entorno acordado, verificar cámara o escáner físico, captura y contador; volver a selección y reabrir sin perder contexto.

No se ha publicado este cambio en main ni se han alterado datos productivos. La pantalla temporal de QA se retira antes del build final.
