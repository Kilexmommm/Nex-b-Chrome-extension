# nex.b 2.3.0 — vista compacta

Añade una presentación adicional de accesos, centrada en texto y compatible con escritorio, Side Panel, Workspaces, Tags y Fijados. Preparación local para revisión; todavía no es una release publicada.

- Imagen pequeña de 72 × 58px a la izquierda.
- Título de 13px, hasta dos líneas, a la derecha; conserva el nombre completo en el tooltip.
- Tags automáticos y propios debajo del título, separados de la imagen, con dirección abreviada o ruta local debajo.
- Si no hay imagen, muestra una inicial. La inicial no reemplaza una captura existente ni se guarda como una imagen.
- Botón **Vista de accesos** en escritorio: alterna Miniaturas → Compacta → Solo títulos.
- En el Side Panel, menú ⋮ → **Vista compacta: imagen y tags**. El menú también permite volver a miniaturas o Solo títulos.
- Guarda la elección por dispositivo en `nexb.accessView`. Recupera la preferencia anterior de Solo títulos; no cambia la biblioteca, revisión, sincronización ni ZIP al cambiar de vista. Un error al guardar la preferencia conserva la vista activa.
- La nueva vista conserva abrir/enfocar accesos, editar, fijar/desfijar, etiquetas de archivos locales, arrastre en las secciones normales y carga de imágenes por proximidad. Fijados continúa sin admitir reordenación por arrastre.

La dirección abreviada usa datos ya guardados. No descarga páginas, extrae descripciones ni solicita permisos adicionales.

## Validación

**248 pruebas automáticas aprobadas**: persistencia local y alternancia entre las tres vistas, compatibilidad con la preferencia anterior y conservación de la vista ante un fallo de escritura, además de las regresiones anteriores.

Chrome **158.0.8127.38** con perfil temporal independiente: imagen real desde IndexedDB con tamaño calculado 72 × 58px, título a su derecha, tags y dirección visibles, inicial sin imagen, persistencia tras recarga y revisión de biblioteca intacta al cambiar de vista. Fijados muestra también el resumen compacto. Botón de escritorio alterna las tres vistas y las anteriores ocultan los resúmenes. Capturas visuales revisadas a 360px y 1200px, sin desbordamiento horizontal en el panel y sin excepciones JavaScript.

También pasan los recorridos previos: migración a IndexedDB, ZIP en Worker, diseño persistente, Side Panel compacto, inventario, ventanas y grupos por Workspace, cierre seguro de diálogos y conservación de fijados. Se conserva la distinción entre estas pruebas y OAuth/Drive o sincronización real entre dos equipos.
