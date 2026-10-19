# Control de asistencia por QR

Rama: `feature/control-asistencia-qr`. Se reutilizan el inicio de sesión Google,
los participantes y los QR existentes. No requiere emitir nuevos QR ni modificar Code.gs.

## Reglas de esta entrega

- Conferencias: registro continuo por auditorio y día, con varias entradas y salidas. No se escanea
  al cambiar de conferencia dentro del mismo auditorio. Una estancia sin salida no aporta minutos.
  Para cada conferencia se unen los intervalos cerrados y se recortan a su horario; solo si cubren
  estrictamente más del 50% se reconocen esos minutos reales, nunca la duración completa por defecto.
  El tiempo fuera, descansos y solapes no se cuentan dos veces. Cálculo en segundos, salida en minutos
  truncados a dos decimales (sin redondear hacia arriba). Las constancias no se emiten en esta entrega.
- Talleres y concursos: una entrada por participante y sesión/día. Exige inscripción confirmada (cada miembro del equipo presenta su QR).
- Las fechas explícitas de Sheets determinan los días; incluye talleres previos a la inauguración.
  Si un taller tiene dos bloques horarios en el mismo día, conserva una sola entrada diaria.
  Los horarios ambiguos o pendientes se omiten y coordinación recibe el listado para corregirlos.
- Actividades generales del programa: una entrada, sin exigir inscripción a taller/concurso.
- Ventana para ambos tipos de lectura: todo el día de la sesión (00:00 a 23:59:59),
  usando `America/Mexico_City` y el reloj del servidor.
- El lector muestra solo sesiones asignadas del día actual. Coordinación puede asignar todos los días.
- Una entrada repetida mientras hay estancia abierta es duplicada; una salida sin estancia abierta
  no crea otra salida. Después de salir se puede volver a entrar. No se alternan modos automáticamente.
- Los registros individuales antiguos se conservan como evidencia histórica, sin inventar estancias
  ni convertirlos automáticamente al cálculo nuevo. El reporte los distingue como registros sin cálculo.
- Internet obligatorio. Si una petición pierde respuesta, repetir es seguro por la unicidad de los registros.
- Captura manual por ID exige motivo; se conserva operador, hora y motivo.

## Cuentas y asignaciones

No se crean cuentas ni perfiles públicos nuevos. Los dos coordinadores usan sus cuentas Google existentes.
Sus correos se configuran en `ATTENDANCE_ADMIN_EMAILS`, separados por comas. Este permiso
no otorga automáticamente permiso de escaneo: un coordinador que también escanee debe habilitarse como operador.
Solo se admiten los coordinadores autorizados: `cdquim@cucei.udg.mx` y `jorge.lopezarce@academicos.udg.mx`.
Una dirección adicional en la variable no obtiene acceso.

En `/administracion/asistencia`, el coordinador habilita únicamente a los ocho integrantes de staff de registro
y marca sus sesiones asignadas. El paso 1 lista el staff confirmado del espejo de Neon, permite buscar
por nombre/correo y habilitar o desactivar cada cuenta sin escribir direcciones. Aparecer en la lista no
otorga permisos. Las cuentas revocadas con acceso previo se conservan visibles para desactivarlas.
El paso 3 permite filtrar por día, tipo y programa/simulación; abrir cada tarjeta muestra sus operadores.
La misma sesión admite varios operadores; una persona puede tener varias sesiones.
Cada operador debe estar registrado, confirmado y clasificado `Staff` en el espejo de Neon.
Se admite staff alumno y académico con el mismo permiso. Una cuenta participante no muestra el lector
y tampoco puede invocar directamente la API ni abrir las rutas administrativas.

Cambiar una asignación surte efecto en la siguiente lectura del servidor, aunque el operador conserve abierta la pantalla.
El operador vuelve a abrir el panel para refrescar sus tarjetas. Para revocación inmediata, desactivar
el acceso en coordinación; cambiar solo la hoja de staff requiere ejecutar la sincronización existente
`pnpm db:sync-participants` para actualizar el espejo de Neon.

El contador del lector refleja las lecturas conocidas por ese panel; volver a abrirlo consulta el total.
Cada lectura muestra un título grande (entrada/salida registrada, duplicado o rechazo), nombre e ID
cuando el servidor los confirma. Con cámara, el resultado también aparece sobre el visor durante
un segundo después de la respuesta del servidor; la tarjeta superior permanece hasta la siguiente lectura.
El contador del modo actual (entradas o salidas) se muestra sobre el visor y en la tarjeta; solo una
lectura nueva confirmada muestra +1. Al retirarse la confirmación, el contador sigue visible sobre la cámara.
Es el conteo conocido por ese panel, no un contador global en tiempo real ni una medida del aforo actual.
El mismo QR sostenido ante la cámara no genera peticiones repetidas: retirarlo
aproximadamente un segundo permite volver a comprobarlo; un QR distinto se atiende sin botón adicional.
La confirmación no necesita sonido; la vibración es un complemento que depende del dispositivo.
Para el escáner físico, la distribución de teclado configurada en el dispositivo debe coincidir con
la de la computadora. Si cambia letras (por ejemplo Y/Z), configurar su "Keyboard Country" según
el manual del modelo y volver a probar en un editor de texto. Nunca corregir automáticamente la firma
del QR ni aceptar tokens parecidos; el servidor exige coincidencia exacta.
Los últimos tres registros nuevos quedan visibles en memoria del dispositivo, sin duplicados ni rechazos.
Una respuesta perdida muestra "Sin confirmación", nunca un éxito ni una afirmación de que no se guardó.
La tabla administrativa y el CSV consultan los registros guardados. Entrada y salida muestran
explícitamente el modo activo; al cambiarlo se pausa la cámara para evitar registrar accidentalmente otra dirección.

## Preparar Preview

1. Usar una rama/base de Neon de pruebas para este Preview y comprobar sus variables de conexión.
   No reutilizar por accidente el destino de producción para la validación.
2. Tener el esquema actual y el espejo de los participantes de prueba disponibles en esa base.
3. Configurar `ATTENDANCE_ADMIN_EMAILS` y `ATTENDANCE_SIMULATION_ENABLED=true` solo en local / Preview.
   En producción las simulaciones se bloquean incluso si la variable queda en true.
4. Ejecutar explícitamente `pnpm db:migrate-attendance --expected-fingerprint=b619c2fac063`
   únicamente con `.env.local` apuntando a la rama aislada verificada de esta entrega.
   Añade tablas y función de asistencia; no borra ni cambia participantes o inscripciones.
   No hay migraciones en `next build`.
5. Publicar el Preview y autorizar su callback Google:
   `https://<alias-estable-de-la-rama>/api/auth/callback/google`.
   El build de `feature/control-asistencia-qr` en Preview verifica primero que
   `DATABASE_URL` tenga la huella de destino `b619c2fac063` (la rama de Neon de
   pruebas comprobada al configurar esta entrega). Consulta tablas y función sin
   modificar datos. Si el destino es otro, detiene el build antes de conectarse.
   Si se reemplaza la rama/base de pruebas, revisar su destino y actualizar
   explícitamente la huella en `scripts/check-attendance-preview.mjs`.
   Esta comprobación no se ejecuta en Production ni en otras ramas.
6. Iniciar sesión como coordinador. Habilitar a la cuenta staff en la sección 1.
7. En “Pruebas internas”, crear las simulaciones de hoy. A y C comparten Aula azul y son
   consecutivas; B es simultánea en Aula morada. El lector muestra dos auditorios, un taller y un concurso.
   Se usan IDs de simulación v2; se conserva la evidencia de las pruebas antiguas, sin mezclarla.
   No se insertan en Sheets ni en el catálogo público.
8. Asignar las simulaciones al staff. El operador cierra y abre `/registro-asistencia`.

Las simulaciones conservan los horarios de su primera creación de ese día; pulsar el botón otra vez
no mueve sesiones con lecturas. Crear al comenzar las pruebas. Si se retoman al día siguiente,
crear las de ese nuevo día. No hay reloj ficticio ni bypass del horario real.

## Prueba guiada de 30–40 minutos

Para la versión de auditorios, usar como guía principal [VALIDACION-AUDITORIOS.md](VALIDACION-AUDITORIOS.md).
Las conferencias A/C corresponden al bloque Aula azul y B al bloque Aula morada; ya no se seleccionan
como lectores individuales. La tabla siguiente conserva los escenarios generales adaptados al bloque.

Usar dos teléfonos o un teléfono para escanear y otra pantalla para mostrar el QR.
Cuenta S: staff de registro. Cuenta P: participante confirmado. Cuenta C opcional: segundo operador.
El coordinador puede ser S para las pruebas, añadiendo su correo al permiso correspondiente.

| Prueba | Instrucciones | Resultado esperado |
| --- | --- | --- |
| Permisos | P abre Mi cuenta y luego intenta `/registro-asistencia` y `/administracion/asistencia` | No ve enlaces de registro/coordinación y vuelve a Mi cuenta al abrirlos directamente |
| Selección | S abre Registrar asistencia | Solo ve sus sesiones, identifica fecha, horario y lugar |
| Cámara | S abre el bloque Aula azul y pulsa Abrir cámara; acepta permiso | Vista trasera y modo ENTRADAS visible |
| Entrada | S lee el QR de P | Verde, nombre, ID, hora; una entrada |
| Duplicado | Retirar el QR, esperar 3 segundos y mostrarlo otra vez | Amarillo; el conteo no sube |
| Salida | S elige Salida y vuelve a abrir cámara; lee el QR de P | Una salida guardada; repetir devuelve duplicado |
| Salida sin entrada | S elige Salida en Aula morada y lee a P | Solicita entrada previa; no guarda salida |
| Simultáneas | Después de cerrar la estancia azul, registrar entrada de P en Aula morada | Registro independiente. Una estancia abierta en otro auditorio del día exige cerrarse primero |
| Inscripción | Sin autorizar aún el roster de prueba, S lee P en el taller y concurso | “No tiene inscripción activa” |
| Inscripción de prueba | Coordinador introduce el ID de P en “Guardar inscripción de simulación”; S vuelve a leerlo | Entrada permitida en taller y concurso; sin botón Salida |
| QR ajeno | S lee un QR de una web cualquiera | Se rechaza y el lector sigue utilizable |
| Escáner físico | Conectar el lector USB/Bluetooth, enfocar el campo y leer el QR (configurar sufijo Enter) | Mismo resultado que cámara; duplicado si ya había entrada |
| Respaldo | Con la estancia anterior cerrada, S abre Aula azul, selecciona Capturar ID, escribe ID de P y motivo | Se registra un reingreso con source manual y motivo en CSV; motivo vacío no se admite |
| Conexión | Desactivar internet, leer otro QR y volver a activar internet | No anuncia éxito sin confirmación; repetir no duplica |
| Dos lectores | Asignar también C al mismo bloque; S y C leen P a la vez sin estancia abierta | Solo una estancia; el otro lector indica duplicado |
| Revocación | El coordinador desactiva S; S intenta otra lectura con el panel abierto | Acceso rechazado inmediatamente |
| Exportación | Coordinador filtra por sesión y descarga CSV | Coinciden nombre, ID, sesión, entradas/salidas, operadores y motivos |

También se prueban automáticamente el día incorrecto, los límites de la ventana y las actividades multidía.
No es necesario cambiar fechas de actividades públicas para estas pruebas.

## Comprobaciones de desarrollo

`pnpm test:attendance`: usa PostgreSQL en memoria (PGlite), sin `.env` ni Neon.
Verifica permisos, asignaciones, sesiones simultáneas, roster de simulación, entradas/salidas,
duplicados, captura manual, fechas, ventanas, multidía y CSV.
Envía 150 solicitudes al motor local: una entrada y 149 duplicados. PGlite tiene una sola conexión;
esta prueba no sustituye la prueba entre conexiones reales y cámaras físicas en Preview.

Ejecutar además `pnpm lint`, `pnpm build` y `git diff --check`.

## Paso a producción

Procedimiento completo y bloqueos de aprobación: [PUBLICACION-ASISTENCIA.md](PUBLICACION-ASISTENCIA.md).
Incluye las cuatro pruebas manuales pendientes, respaldo, revisión de destino, migración explícita,
variables de producción, asignación del staff y contingencia. Preparar la rama no publica el módulo.

Tras aprobar Preview, aplicar `database/attendance.sql` explícitamente al destino de producción,
configurar los dos coordinadores y dejar `ATTENDANCE_SIMULATION_ENABLED=false`.
Sincronizar las sesiones reales desde el panel, revisar sus fechas/horarios y asignar los ocho operadores.
El módulo falla cerrado mientras no se configuren coordinadores ni operadores.
Conservar la evidencia de las pruebas y realizar una lectura de comprobación antes del acceso masivo.
