# Cuenta visible en móvil — pendiente de aprobación antes de main

## Cambios

- Mi cuenta sale de la navegación desplegable y permanece visible en el encabezado fijo, con avatar/iniciales y texto.
- Sin sesión, el mismo lugar muestra Iniciar sesión. Solo cambia la etiqueta; ruta, popup, retorno y autorización no cambian.
- Una sola instancia del acceso/login; no se duplica por versión móvil y escritorio.
- Logo compacto en móvil/tableta para que quepan cuenta y menú. Menú adaptativo hasta 1050px para evitar desbordamiento en tabletas.
- Cerrar sesión permanece dentro del menú en móvil/tableta y visible junto a la cuenta en escritorio.
- Menú con foco inicial en el primer enlace y Escape para cerrarlo/restaurar foco.
- Objetivos táctiles >=44px, foco visible y fondo contrastante del acceso, incluso sobre contenido claro al desplazarse.
- Mi cuenta es el nombre consistente. La búsqueda de textos públicos no encontró Mi espacio ni Mi perfil. Se elimina Log in.

No se añade barra inferior en esta primera mejora. No hay cambios en OAuth, base de datos, permisos, registros o envío de correos.

## Pruebas

`node scripts/test-header-account.mjs`: render real de los componentes con dependencias de navegación simuladas, una sola instancia, fuera del nav, etiquetas y destino. Sin navegación, autenticación o servicios externos.

Navegador con cuenta ficticia y sin sesión: 320/375/768/1050/1280px, menú cerrado/abierto, vista inicial/scroll, acceso visible y >=44px, sin desbordamiento ni errores no controlados. Menú recibe foco y Escape lo devuelve. Logout disponible según tamaño. Popup interceptado: misma ruta /iniciar-sesion y opciones, cerrado restablece el botón. No se autentican cuentas reales ni se ejecuta logout real.

Cambios acumulados de lector: ver VALIDACION-FILTROS-LECTOR.md. Lint, TypeScript, build, pruebas de filtros/consulta SQL, asistencia y auditorios, y diff --check antes de publicar.

Pendiente de aprobación para Preview/main. La ruta temporal de prueba se retira antes del build final. No se ha modificado producción.
