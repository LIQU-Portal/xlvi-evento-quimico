# Fichas de ponentes

El programa público sigue en la pestaña `Programa`. La pestaña `Ponentes` del
mismo archivo contiene una fila por persona. `idActividad` coincide con el `id`
de `Programa`; `orden` controla la secuencia cuando hay varios ponentes.

| Columna | Uso |
| --- | --- |
| `idActividad` | ID numérico de una conferencia en `Programa`. |
| `orden` | Posición de la persona, empezando en 1. |
| `nombre` | Nombre que se muestra en la ficha. |
| `semblanza` | Texto público, máximo 1 200 caracteres. |
| `fotoFileId` | Opcional: ID o enlace de un archivo de imagen en Drive. |
| `visible` | `Sí` publica la ficha si tiene nombre y semblanza; `No` la oculta. |

La actividad 32 está preparada con la ficha de Q. Mayra Vazquez y su semblanza.
No tiene foto, así que la página muestra solo texto. Para agregar una foto,
recomendamos JPG o WebP de 800 × 1000 píxeles (relación 4:5), hasta 2 MB,
con el rostro centrado en la parte superior. En cada foto de Drive configura
**Acceso general → Cualquier persona con el enlace → Lector**: el servidor
necesita descargarla sin iniciar sesión. La página recorta el retrato para
ajustarlo a la ficha y oculta una imagen que no se pueda descargar. Para acelerar
la carga, usa la miniatura pública de 320 píxeles que sirve Google, sin pasar
por la optimización de imágenes de Vercel.

## Publicar la pestaña

La URL CSV publicada para `Programa` no publica automáticamente una pestaña
nueva. En Google Sheets, usa **Archivo → Compartir → Publicar en la Web**,
elige únicamente `Ponentes`, formato **CSV**, y publica esa pestaña. La aplicación
deriva su URL de la URL CSV de `Programa` sustituyendo `gid=1001` por `gid=1007`.
Si se usa otro archivo o enlace, configura explícitamente
`GOOGLE_SHEETS_SPEAKERS_CSV_URL` en `.env.local` y en Vercel. Comprueba que el
enlace CSV devuelve los encabezados y la fila de la actividad 32 sin iniciar
sesión. Si la lectura falla, el sitio sigue mostrando el campo original
`ponente/responsable` del programa y registra el error en el servidor.

El sitio solo muestra fichas en actividades de tipo `Conferencia`. Las hojas de
registro, Neon y las inscripciones no cambian.
