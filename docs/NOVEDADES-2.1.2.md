# nex.b 2.1.2 — Side Panel compacto

Ajuste solicitado tras la publicación de 2.1.1. Preparación local; aún no publicada como release.

- Selector de Workspace, lupa y menú ⋮ en una sola fila. El buscador desplegado conserva su propia línea.
- Encabezados de sección a 14px (antes 20px: reducción del 30 %), con menos margen y herramientas agrupadas en ⋮.
- El menú de sección conserva todas las acciones y sus estados desactivados. Se cierra al seleccionar, al pulsar Escape o al hacer clic fuera. Sus opciones tienen nombres completos y foco de teclado.
- Botones + de acceso y categoría a 28px en el panel estrecho.
- Capturar imágenes faltantes oculto en el panel; Cancelar captura permanece disponible si hay una operación en curso.
- Pie del panel con By.kilex; versión, Feedback y Ko-fi ocultos.
- Los cambios compactos se aplican a la vista estrecha existente (hasta 600px), incluyendo el Side Panel. La vista amplia conserva encabezados a 20px, herramientas, captura y pie completo.

## Validación

238 pruebas automáticas aprobadas. Script de comprobación en Chrome 154 con perfil temporal: alineación en una fila a 360px, tamaños calculados de título y botones, controles ocultos, menú de sección dentro del viewport, apertura real de Nuevo acceso, vuelta a escritorio a 1200px y ausencia de excepciones JavaScript. También pasan los recorridos previos de migración, miniaturas, respaldo Worker, preferencias, inventario y agrupación real.

Captura visual revisada con cuatro accesos y modo Solo títulos, reproduciendo la composición enviada por el usuario. No se utilizan datos del perfil personal.

El script de verificación consulta la versión del manifest en vez de fijar 2.1.1. Puede repetirse únicamente contra un perfil de pruebas, porque reemplaza la biblioteca con fixtures.
