# NEX.B 1.8.0 — Encabezado, Configuración, Side Panel y home compacto

## Cambios

- **Encabezado reorganizado (#13):** marca, Workspaces y Tags a la izquierda; acciones a la derecha en orden Alto de miniaturas, Inventario, + Workspace, Editar Workspace y Configurar. El Inventario usa un icono SVG de ventanas con tres líneas, ya no `☰`.
- **Configuración con navegación lateral (#14):** el diálogo es más ancho en escritorio y organiza General, Diseño, Sincronizar y Datos/Respaldo en una columna fija, con botón X de cierre, `aria-selected`, foco de teclado y adaptación a fila en móvil.
- **Side Panel de Chrome (#15):** nex.b se abre en el panel lateral derecho desde el menú de la extensión, reutilizando la misma interfaz y sin duplicar la lógica de datos. El clic normal del icono sigue abriendo el home.
- **Home más compacto (#20):** la zona de miniaturas usa el 90% del ancho en escritorio (100% en móvil); el título de cada acceso pasa a 11 px y color `#b6b3b3`; se quita el texto visible «Sin miniatura» (queda señal accesible) y «Capturar imagen» del home (la captura sigue en el menú de clic derecho).
- **Nuevo ajuste (#20):** mostrar u ocultar las pestañas de Workspace.

## Correcciones

- **Títulos de miniaturas (#11):** peso normal, sin negrita.
- **Abrir Side panel:** el menú de la acción ya no se descarta cuando `tab` es indefinido y se llama `chrome.sidePanel.open` antes de cualquier `await` para no perder el gesto de usuario. Se declara `side_panel.default_path`.

## Verificación

110 pruebas automáticas aprobadas (`npm test`), incluidas regresiones de orden del encabezado, paneles de Configuración, permisos/manifest del Side Panel, ancho de la zona de miniaturas, título del acceso y el ajuste `showWorkspaceTabs`. Las pruebas del worker y del manifest usan mocks: no sustituyen la comprobación visual en Chrome.

Pendiente de comprobar manualmente en Chrome: recargar la extensión, revisar el 90% de las secciones, abrir el Side Panel desde el menú del icono, y probar Configuración en escritorio y móvil en temas claro y oscuro.

Esta versión no cambia el esquema de almacenamiento.
