# Registro diario y horas de Apoyo operativo

## Alcance

Una sola lista interna por fecha. Sin horarios de trabajo predefinidos, selector Matutino/Vespertino o corte al mediodía. El operador solo elige Entrada o Salida. No es actividad pública, no consume cupos, no genera constancias automáticamente ni acredita horas retroactivas.

En Staff: active = Sí, staffType = Alumno o Académico, staffFunction = Apoyo operativo. Debe existir registro general confirmado y QR personal. Actualizar Staff desde Coordinación; si falla, resolverlo antes de validar elegibilidad. Esta función no otorga permiso de lector.

## Preparación y publicación segura (pendiente)

1. Ensayar en base aislada, no en producción. Verificar huella de DATABASE_URL.
2. Aplicar explícitamente `pnpm db:migrate-attendance --expected-fingerprint=<huella-verificada>` en pruebas. Incluye attendance-support.sql en la transacción. Build nunca migra. No elimina participantes, inscripciones ni lecturas. Agrega evidencia separada y función v3 que delega las actividades existentes a v2.
3. Ejecutar pruebas, build y validación con Coordinación, operador asignado y apoyo operativo. No habilitar simulaciones en producción.
4. Antes de publicar: respaldo vigente y destino de producción verificado. Aplicar migración revisada antes del código nuevo. pnpm dev no sustituye la migración.
5. Publicar solo tras aprobación. Verificar actividades existentes y apoyo. No crear listas de apoyo hasta tener código nuevo. El código antiguo desconoce apoyo y podría desactivarlo al importar agenda: no usar estas listas si se revierte código. No revertir ni borrar registros para volver a una versión anterior.

## Preparar y asignar

Coordinación → 2. Prepara las sesiones → Registro diario de Apoyo operativo.

Solo fecha y punto de registro. Preparar otra vez la misma fecha no duplica la lista. La sede queda protegida después de lecturas. No hay edición manual de horas ni eliminación del historial.

Asignar operadores en el paso 3. El lector muestra «Apoyo operativo · Registro del día», en un bloque «Todo el día». No muestra hora de trabajo ni solicita turno. Otros días quedan en consulta. Se captura el día correspondiente en Ciudad de México. Esta versión no contempla jornadas que crucen medianoche: entrada y salida deben capturarse el mismo día.

## Prueba manual

1. Preparar HOY en pruebas y asignar operador. Repetir preparación: una sola lista y mismas asignaciones.
2. Cuenta de apoyo: sin acceso al lector. Operador: abrir apoyo y comprobar Entrada/Salida, sin turno ni rango horario de trabajo.
3. QR de participante normal o staff Registro de asistencia: rechazo, sin incrementar contador.
4. QR de apoyo: entrada confirmada; repetir entrada: duplicado, sin incremento.
5. Antes de salida: cero horas y una entrada sin salida. Después: intervalo cerrado y tiempo real en resumen/CSV.
6. Reingresar y salir: suma estancias, no pausas. Estancia abierta: cero por esa estancia, aunque anteriores cerradas sí suman.
7. Reporte 11:00–15:00: cuatro horas completas, sin recorte ni selección de mañana/tarde. 07:00–14:00: siete horas. 08:00–08:31: 31 minutos = 0.5166 horas.
8. Dos operadores intentan misma entrada: solo una nueva. Sin conexión/respuesta incierta: no éxito falso; reintento conserva identificador y no duplica. Pruebas locales usan PostgreSQL en memoria, no demuestran concurrencia real de Neon: completar en Preview.
9. Deshabilitar operador: rechazar siguiente lectura. Retirar apoyo en Staff y sincronizar: rechazar siguiente lectura. Entrada abierta de persona retirada queda pendiente, sin salida inventada.
10. CSV resumen: una fila por persona/día con minutos, horas y pendientes. CSV detalle: todas las entradas y salidas exactas, operadores y fuentes. Los totales por persona pueden sumarse en Sheets.
11. Actualizar agenda: listas, asignaciones e historial de apoyo permanecen. Revisar captura normal de taller y auditorio.

## Tiempo real y separación posterior

Se suman segundos reales de intervalos con entrada y salida, uniendo traslapes defensivamente y excluyendo pausas/intervalos abiertos. Sin mínimo ni recorte a horario de trabajo. Minutos truncados a dos decimales; horas a cuatro, sin redondear hacia arriba.

Las marcas originales se conservan. La separación matutino/vespertino podrá calcularse después en backend/reporte sin pedir elegir turno ni volver a escanear al cambiar de turno. Falta acordar el corte y cómo distribuir una estancia que lo cruce. No se aplica clasificación arbitraria ahora.

Horas reales no equivalen automáticamente a horas integrales de constancia: falta definir esa equivalencia. No mezclar horas de apoyo y asistencia a conferencias sin política explícita.

No requiere columnas nuevas en Sheets, cambios en Code.gs ni variables adicionales. Reutiliza Staff, QR y permisos actuales. Permutas excluidas.
