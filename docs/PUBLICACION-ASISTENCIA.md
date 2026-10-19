# Publicación controlada del módulo de asistencia

Estado: preparado para revisión, NO aprobado para producción. Este documento no ejecuta operaciones.
Rama: `feature/control-asistencia-qr`. Main y la base estable no se modifican al preparar esta entrega.

## 1. Bloqueo de aprobación: cuatro pruebas manuales pendientes

Realizar en Preview, con las simulaciones de la fecha actual de Ciudad de México. Si es otro día,
crear las cinco simulaciones de hoy y asignarlas; no cambiar el reloj ni fechas del programa real.
Usar un participante y una sesión sin lectura previa para cada prueba de nueva entrada.
Un coordinador que haga de segundo operador debe estar confirmado como Staff, habilitado como
operador y asignado a la misma sesión. El permiso de coordinador no lo habilita automáticamente.

Preview: https://xlvi-evento-quimico-web-git-36b223-ernesto-lopezarces-projects.vercel.app

- [ ] **Dos operadores.** Abrir `/registro-asistencia` en dos dispositivos/cuentas asignadas a
  la misma conferencia de simulación. Seleccionar Entrada en ambos y leer el mismo QR casi a la vez.
  Esperado: un verde de registro nuevo y un amarillo de duplicado. En el reporte debe existir
  una sola entrada para esa persona y sesión. Los contadores de dos pantallas no se suman ni
  son globales en tiempo real; volver a abrir el panel consulta los totales guardados.
- [ ] **Revocación.** Con el lector del operador abierto, deshabilitarlo en el paso 1 del panel
  coordinador. Intentar otra lectura en el lector sin recargar. Debe rechazarse y no añadir registros.
  No retirar solo la fila de Sheets: para esta prueba usar «Desactivar» en el panel.
  Al terminar, reactivar y verificar las asignaciones para continuar las demás pruebas.
- [ ] **Sin red.** Con el lector cargado, apagar Wi-Fi y datos, leer un QR y esperar la respuesta
  de error/tiempo de espera (aproximadamente 12 segundos). Nunca debe mostrar verde ni incrementar
  el contador sin confirmación. Restaurar conexión y volver a leer: puede registrar una entrada
  nueva o indicar duplicado si una solicitud previa llegó al servidor; el reporte debe tener solo una.
  No hay cola offline: las lecturas no confirmadas deben reintentarse.
- [ ] **CSV.** En coordinación filtrar una sesión y descargar su CSV. Comparar nombre, ID, título,
  fecha/hora, operador y entrada/salida con las capturas. Si se usó captura manual, comprobar el motivo.
  Confirmar acentos, archivo legible y ausencia de entradas/salidas duplicadas.

Anotar fecha, cuenta usada sin contraseña, dispositivo, resultado y evidencia. Si una falla, NO hacer merge.
La pistola Shawty S0122 necesita además una lectura exacta del QR; revisar su distribución de teclado.
Si solo se aprueban cámaras, preparar la operación con cámaras y respaldo manual, sin dar por validada la pistola.

## 2. Evidencia técnica disponible

- PostgreSQL local: permisos, asignaciones, QR, estados, inscripción, manual, fechas, multidía y CSV.
- Neon aislado: 600 solicitudes en cuatro lotes de 150 concurrentes. Mismo QR: 1 entrada nueva/149
  duplicadas y 1 salida nueva/149 duplicadas. 150 personas distintas: 150 lecturas. Sin inscripción:
  150 rechazos. Cero grupos duplicados en la consulta final; datos sintéticos eliminados.
- Esta carga fue contra la función SQL por HTTPS; no representa 150 usuarios completos autenticados en Vercel.
- El usuario confirmó «41 sesiones actualizadas desde el programa» sin advertencias tras corregir Sheets.
  Es la cantidad del programa actual, no una constante: futuras ediciones legítimas pueden cambiarla.
- En la preparación se ejecutaron satisfactoriamente `pnpm test:attendance`,
  `pnpm test:attendance-release`, `pnpm lint` y `pnpm build`.
- El preflight de solo lectura del Preview confirmó esquema y función completos, 41 sesiones reales,
  dos operadores habilitados y simulaciones existentes. Las asignaciones de pruebas no constituyen
  las asignaciones del staff para producción.
- Un intento anterior de sincronización mostró un fallo de red con Google Sheets. La posterior
  actualización fue satisfactoria. El lector utiliza Neon y no descarga Sheets por cada QR.

Revisión final de código antes de aprobar:

```powershell
pnpm test:attendance
pnpm test:attendance-release
pnpm lint
pnpm build
git diff --check
git status --short
```

`pnpm test:attendance-neon` modifica SOLO fixtures de la base aislada verificada y luego los limpia.
Nunca ejecutarlo con credenciales de producción. No es parte del build ni del despliegue automático.

## 3. Preparación de producción, solo tras aprobación explícita

El merge por sí solo NO prepara las tablas ni los operadores. No copiar la base de pruebas,
participantes, lecturas, operadores o asignaciones del Preview a producción.

1. Confirmar proyecto Vercel `xlvi-evento-quimico-web`, rama de producción `main` y base estable.
2. Crear en Neon un respaldo/branch de recuperación de la base de producción y anotar hora, origen
   y punto de restauración. Confirmar que se puede recuperar antes de migrar. No se ha creado durante
   esta preparación. La retención y opciones dependen del plan; comprobarlas en el panel de Neon.
3. En Vercel **Production**, sin filtro de rama, verificar:
   - `DATABASE_URL`: conexión de la base estable; nunca la rama `pruebas-asistencia`.
   - `ATTENDANCE_ADMIN_EMAILS`: `cdquim@cucei.udg.mx,jorge.lopezarce@academicos.udg.mx`.
   - `ATTENDANCE_SIMULATION_ENABLED`: `false` explícito.
   - Mantener OAuth, secretos de registro y fuente del programa existentes. No rotarlos por este merge.
   - Conservar el override aislado de DATABASE_URL del Preview; no desconectar la integración Neon.

   La inspección de metadatos durante esta preparación encontró las dos variables de asistencia
   (`ATTENDANCE_ADMIN_EMAILS` y `ATTENDANCE_SIMULATION_ENABLED`) únicamente en Preview:
   todavía hay que añadir sus versiones Production. No se consultaron valores secretos ni se
   modificaron variables. `DATABASE_URL` ya tiene una definición general que incluye Production;
   no reemplazarla con la conexión aislada.
4. Preparar un archivo local privado `.env.attendance-production.local` para la operación explícita,
   con DATABASE_URL y las dos variables de asistencia anteriores. No copiar `.env.local` del Preview
   ni imprimir credenciales. No subir el archivo a Git. Los Secrets de Production pueden no salir en
   `vercel env pull`; no asumir que un archivo descargado contiene las credenciales.
5. Ejecutar el preflight de solo lectura con una huella revisada independientemente. La base estable
   observada anteriormente tiene huella `187d4e41ad84`; reconfirmar que sigue siendo el destino correcto.

```powershell
node --env-file=.env.attendance-production.local scripts/check-attendance-release.mjs --environment=production --phase=before-migration --expected-fingerprint=187d4e41ad84
```

Este control no escribe ni crea tablas. Puede indicar tablas de asistencia faltantes antes de migrar.
Si la huella no coincide, se detiene sin conectarse: no cambiar la huella solo para silenciar el error.

6. Solo con respaldo y destino aprobados, aplicar la migración de esta rama:

   Si se publica también la clasificación `staffFunction`, primero actualizar Code.gs según
   `google-apps-script/README.md` y aplicar su migración adicional con la misma conexión verificada:

```powershell
node --env-file=.env.attendance-production.local scripts/migrate-staff-function.mjs --expected-fingerprint=187d4e41ad84
```

   Es una columna opcional para constancias; no concede permisos. Requiere migración antes
   de publicar esta versión de la web. No ejecutar la migración general heredada para añadirla.

```powershell
node --env-file=.env.attendance-production.local scripts/migrate-attendance.mjs
node --env-file=.env.attendance-production.local scripts/check-attendance-release.mjs --environment=production --phase=after-migration --expected-fingerprint=187d4e41ad84
```

La migración añade tablas, índices y función de asistencia en una transacción; no inserta simulaciones
ni modifica las filas de participantes e inscripciones. No ejecutar otras migraciones ni scripts de
limpieza/sincronización de participantes como parte de este procedimiento.

**Aviso:** los scripts heredados de sincronización y concurrencia de inscripciones pueden elegir
POSTGRES_URL/POSTGRES_URL_NON_POOLING antes que DATABASE_URL. No ejecutarlos para preparar asistencia.
Las variables secundarias del entorno local pueden seguir apuntando a la base estable.

## 4. Merge y despliegue

Solo cuando las cuatro pruebas estén aprobadas, el respaldo exista, el preflight posterior pase
y las variables Production estén listas, aprobar el PR de esta rama hacia `main`.
El merge a main dispara el despliegue de producción del proyecto conectado; no promover el Preview
aislado como si fuese producción. Registrar commit final, URL y estado READY y revisar logs.
No hay migraciones automáticas en `next build`.

Mantener la revisión pendiente o como borrador hasta superar todos los bloqueos. Si main cambió
desde la preparación, revisar diferencias y repetir las comprobaciones antes del merge.

## 5. Activación operativa después del despliegue

1. Entrar como coordinador en `/administracion/asistencia` de producción.
2. Pulsar «Actualizar sesiones del programa». Confirmar que no se omiten actividades conocidas
   por fecha/horario inválido. No crear simulaciones ni trasladar lecturas del Preview.
3. Habilitar únicamente al staff de registro final (ocho personas previstas), previamente registrado
   y reconocido como Staff. El alumno normal no debe tener enlaces ni acceso al lector.
4. Asignar cada sesión a sus operadores; puede haber varios operadores y eventos simultáneos.
5. Comprobar que no haya sesiones reales sin operador. El preflight informa el número, pero no
   considera completada la configuración operativa automáticamente.
6. Probar inicio de sesión con coordinador, operador y participante normal; comprobar los permisos.
   El lector solo muestra sesiones de hoy. Si no hay una sesión real hoy, no modificar fechas para
   probar: verificar el primer día real con un participante autorizado, conservando esa evidencia real.
7. Revisar el primer CSV y los logs durante la primera operación. No dar por calculadas horas o constancias.

## 6. Contingencia

- Si falla antes del merge: detener la publicación; el sitio actual sigue en producción.
- Si falla solo un operador: deshabilitarlo o corregir su asignación; no borrar sus lecturas.
- Si falla el módulo tras desplegar: deshabilitar operadores para detener capturas y volver al
  despliegue de producción anterior mediante Vercel, con autorización. Registrar qué versión quedó activa.
- No borrar tablas, no restaurar toda la base y no ejecutar DROP como rollback automático: hacerlo
  podría perder registros reales recibidos desde el respaldo. Conservar lecturas para diagnóstico.
- La restauración de datos requiere una decisión independiente y una estrategia que preserve las altas recientes.

## Acta de aprobación

- [ ] Dos operadores: aprobado.
- [ ] Revocación: aprobada.
- [ ] Sin red y reintento: aprobado.
- [ ] CSV: aprobado.
- [ ] Código final: pruebas, lint, build y diff aprobados.
- [ ] Respaldo de producción creado y destino verificado.
- [ ] Variables Production configuradas; simulaciones deshabilitadas.
- [ ] Migración explícita y preflight posterior aprobados.
- [ ] Usuario autoriza merge y despliegue del commit final.

Pendientes al preparar este documento: cuatro pruebas manuales, respaldo, configuración y migración
de producción, y autorización de publicación. No confundir «rama preparada» con «producción activada».
