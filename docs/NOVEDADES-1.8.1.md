# NEX.B 1.8.1 — Side Panel adaptable y abrir secciones

## Cambios

- **Side Panel con ancho reducido (#23):** se oculta la marca, las pestañas de Workspace se sustituyen por un selector con el Workspace activo, las acciones principales se agrupan en un menú de tres puntos **⋮** (Editar Workspace, + Workspace, Alto de miniaturas, Inventario, Sincronizar, Configurar y Tags) y se puede elegir **1 o 2 miniaturas por fila**. Esa preferencia se guarda por dispositivo en `chrome.storage.local` (`nexb.narrowColumns`) y se conserva al reabrir el panel. Se mantiene el foco de teclado, `aria-expanded` y el cierre con Escape o clic fuera.
- **Abrir toda una sección (#29):** cada sección y subsección incorpora el botón **⧉** «Abrir todas las ventanas de esta sección». Abre en orden todos sus accesos reutilizando la apertura normal: si una ventana ya está abierta la enfoca (pestaña y ventana) en vez de duplicarla, ignora enlaces repetidos dentro de la sección y omite los `file://` sin permiso sin romper el resto. Al terminar muestra cuántas se abrieron y cuántas se enfocaron.

## Verificación

119 pruebas automáticas aprobadas (`npm test`), incluidas las nuevas de `openOrFocusMany` (enfocar existente, crear nueva, deduplicar, omitir `file://` sin permiso) y las de ancho reducido del Side Panel.

Pendiente de comprobar manualmente en Chrome: recargar la extensión, abrir el Side Panel y verificar la cabecera reducida, el menú ⋮ y el selector de miniaturas por fila; abrir una sección completa con enlaces ya abiertos y con enlaces nuevos.

Esta versión no cambia permisos ni el esquema de almacenamiento.
