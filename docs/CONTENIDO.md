# Edición de contenido

La V0 usa `config/content.ts` como fuente única para fechas, programa, actividades, aliados e información de contacto. Todo texto marcado como provisional debe validarse antes de publicarse.

## Integración futura con Google Sheets

El archivo `lib/sheets.ts` reserva el punto de integración. Cuando se apruebe la hoja y su estructura, conviene:

1. Definir columnas equivalentes al tipo `ProgramItem`.
2. Validar y normalizar los datos al cargarlos.
3. Mantener `config/content.ts` como respaldo local.
4. Guardar las credenciales únicamente en variables de entorno de Vercel.

No hay conexión con Google Sheets, login, registro, QR, constancias ni backend en esta entrega.
