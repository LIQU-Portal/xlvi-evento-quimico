# Estancias por auditorio: regla y evidencia alternativa

Preparación del 19 de octubre de 2026. Solo rama `feature/control-asistencia-qr` y Neon aislado.
No es una autorización de merge ni de despliegue de producción.

## Regla acordada

Cada día/auditorio tiene un lector compartido por las conferencias de esa sede. Se escanea al
entrar y al salir, no entre conferencias. Puede haber reingresos; cada estancia debe cerrarse.
Por conferencia se unen los intervalos cerrados, se recortan a su horario y se excluyen huecos y
descansos. Se reconocen todos los minutos efectivos, sin porcentaje mínimo: 31/60 reconoce 31;
60/60 reconoce 60; 30/60 reconoce 30; 1/60 reconoce 1. Una entrada sin
salida aporta cero por ese intervalo, pero no invalida otras estancias cerradas correctamente.
La comparación usa segundos exactos. Los minutos se truncan a dos decimales, sin redondear arriba.

Talleres y concursos mantienen una entrada por sesión/día y su inscripción obligatoria.
Los registros individuales antiguos se conservan separados y no se convierten en estancias ficticias.
No se generan constancias automáticamente.

## Cambios de operación

- Coordinación asigna el bloque de auditorio/día a sus operadores, no cada conferencia por separado.
- Solo se ofrecen auditorios asignados del día actual. No se cambia el modo Entrada/Salida automáticamente.
- Una entrada abierta en otro auditorio del mismo día debe cerrarse allí antes de abrir otra. Se separan
  simulaciones y programa real. Una entrada pendiente del día anterior no impide registrar un día nuevo.
- Una entrada repetida no abre otra estancia. La misma salida no cierra dos estancias mediante reintento.
- El navegador conserva en memoria el UUID de una solicitud sin confirmación. Su reintento usa el mismo
  UUID; el servidor lo coteja con persona, operador, bloque, modo, fuente y motivo, sin guardar el token QR.
- No hay cola offline ni garantía de conservar ese UUID después de recargar/cerrar el navegador.
- Los contadores son lecturas conocidas por ese panel, no aforo ni conteo global en vivo.
- Una sede por confirmar o dos conferencias traslapadas en la misma sede bloquean la importación: no se
  adivinan sedes. Para agrupar se normalizan acentos, mayúsculas y espacios, no nombres distintos.
- Los horarios y miembros de un bloque con estancias no se reescriben al sincronizar: exige revisión
  de coordinación. La validación se hace bajo bloqueos dentro de la transacción de sincronización.

## Cuatro pendientes: evidencia alternativa ejecutada

| Pendiente | Prueba realizada | Resultado |
| --- | --- | --- |
| Dos operadores, mismo QR | Dos sesiones autenticadas de operadores ficticios contra la API local real y Neon aislado | Una registrada y una duplicada |
| Revocar con pantalla abierta | Se deshabilitó solo el operador ficticio y se capturó desde su lector ya abierto | Rechazo visible y cero estancias nuevas |
| Sin conexión | Navegador sin red; luego reconexión y reintento | Sin éxito falso ni incremento anticipado; una escritura al recuperar |
| Respuesta perdida después de guardar | Se dejó confirmar la API/Neon y se abortó la respuesta al navegador | Estado incierto; mismo UUID al reintentar; duplicado sin reingreso fantasma |
| CSV | Se descargaron las dos rutas reales: resumen por conferencia y detalle de estancias | UTF-8/BOM, 31 minutos reconocidos, estancia abierta sin sumar, IDs y operadores cotejados con DB; participante sin acceso |

La prueba del navegador usó tokens de sesión locales firmados para fixtures ficticios; NO probó el
flujo Google OAuth. Ninguna cuenta real se modificó ni se usaron credenciales de producción.
Se comprobó el lector a 375, 768 y 1280 px, sin desbordamiento horizontal ni errores JavaScript.
Todos los fixtures del navegador se eliminaron después. No sustituye ensayar con cámaras físicas,
la red del auditorio y el escáner Shawty, cuyo teclado debe producir exactamente la firma del QR.

## Concurrencia real y límite de capacidad

Escenario operativo: cinco lotes de 150 solicitudes, con ocho operaciones concurrentes (750 totales).
Una entrada nueva y 149 duplicadas; una salida nueva y 149 duplicadas; un reingreso nuevo y 149
duplicados; 150 personas distintas registradas; 150 rechazos de taller sin inscripción. Sin errores
ni reintentos transitorios en esa ejecución. Percentiles 95 por lote: 185, 83, 83, 85 y 84 ms,
medidos desde la máquina local al driver HTTPS de Neon, no como latencia completa de Vercel.

La comprobación final encontró 153 lecturas efectivas (152 entradas y una salida) y cero grupos
duplicados. Se probó además revocación y replay de una salida antigua tras un reingreso: la nueva
estancia permaneció abierta. Fixtures eliminados y limpieza verificada.

**Límite descubierto:** un primer estrés de 150 operaciones en vuelo simultáneamente devolvió
30 errores SQLSTATE 53200 en un lote. PostgreSQL define ese código como `out_of_memory`:
[códigos oficiales](https://www.postgresql.org/docs/16/errcodes-appendix.html).
Se añadieron hasta tres reintentos acotados para errores transitorios específicos, manteniendo el
UUID. Una repetición del estrés terminó las 750 solicitudes de lectura (68 reintentos transitorios),
pero falló la consulta/limpieza posterior de esa ejecución; se recuperaron y eliminaron sus 159
participantes y cuatro sesiones ficticias mediante marcador exacto y se confirmó cero remanentes.
No se da por aprobada la capacidad sostenida de 150 lecturas simultáneas.

La prueba final de ocho operaciones concurrentes sí terminó comprobaciones y limpieza sin fallos.
No se cambió el plan, tamaño ni presupuesto de Neon. Revisar recursos/monitorización si se pretende
aumentar el número de operadores: [relación entre cómputo y conexiones](https://neon.com/docs/manage/endpoints/).

## Pruebas locales reproducibles

```powershell
pnpm test:attendance
pnpm test:attendance-auditorium
pnpm test:staff-function
pnpm test:attendance-release
pnpm lint
pnpm build
git diff --check
```

Solo con la base aislada ya verificada:

```powershell
node --env-file=.env.local scripts/test-attendance-neon.mjs --run-isolated-neon --workers=8
```

La prueba de auditorios en PGlite ejecuta SQL real y cubre agrupación, ausencia de porcentaje mínimo, minutos efectivos,
entradas abiertas, reingresos, huecos, cruce entre conferencias, intervalos traslapados sin doble
cómputo, manual/QR inválidos, permisos, revocación, UUID reutilizado con otra persona, inmutabilidad
del programa con lecturas y las mismas consultas de ambos reportes. También conserva las pruebas
del comportamiento individual de talleres/concursos.

## Antes de pensar en merge

1. Publicar esta versión en Preview; los cambios actuales no están publicados automáticamente por
   editar archivos locales. El callback Google del alias estable no cambia.
2. Migración explícita ya aplicada solo a la rama de pruebas. El build no migra nada.
3. En el Preview nuevo, actualizar sesiones del programa y recrear las simulaciones v2 de hoy.
   Revisar asignaciones de los bloques y volver a abrir el lector. Las asignaciones previas de las
   conferencias se incorporan a su bloque; confirmar que no quede ninguno sin operador.
4. El programa importado actual tiene 12 conferencias agrupables en cinco auditorios/día, sin
   traslapes detectados. Esta revisión fue de solo lectura; no se importaron automáticamente nuevos
   bloques del programa. Los demás eventos no cambian en el programa público.
5. Recomendación de cierre humano: una entrada y salida usando cámara real, comprobar el auditorio
   correcto y descargar una estancia. Es una revisión corta, no repetir toda la carga de 750 solicitudes.
6. Respaldo y migraciones de producción, variables Production, habilitación/asignación de los ocho
   operadores y aprobación explícita del merge siguen pendientes. Consultar PUBLICACION-ASISTENCIA.md.
7. Al cerrar esta preparación, dos intentos de actualizar la referencia remota de GitHub fallaron
   por conexión al puerto 443. La rama contiene el main que ya se había descargado, pero no se
   certifica que siga siendo el último: repetir `git fetch origin main` antes de revisar el merge.
