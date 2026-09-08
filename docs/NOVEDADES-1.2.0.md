# NEX.B 1.2.0

Esta iteración amplía 1.1.0 sin cambiar el esquema de almacenamiento ni reemplazar la configuración.

## Implementación

- src/tags.js: catálogo global, filtro mientras se escribe, sustitución del token bajo el cursor y deduplicación al seleccionar.
- src/bookmarks.js: planificación de importación de hijos directos, exclusión de duplicados por URL en el Workspace y movimiento de accesos conservando sus datos.
- src/app.js: selección de destino, explorador manual de carpetas, permiso opcional solicitado por clic y guardado con el control de revisiones existente.
- src/background.js: menú “Agregar sitio a NEX.B” con contexto action (clic derecho en el icono del navegador).
- Cabecera de escritorio en una fila con navegación central desplazable y controles a la derecha. Dos filas en móvil.

## Permisos y fuentes

Se mantiene la lista anterior de permisos obligatorios. Se añade bookmarks a optional_permissions: Chrome lo solicita al usar el importador. El permiso de favoritos no es técnicamente de solo lectura; esta implementación se limita a get y getChildren. [Permisos opcionales de Chrome](https://developer.chrome.com/docs/extensions/reference/api/permissions).

getChildren devuelve los hijos inmediatos de la carpeta elegida. No se usa getTree ni getSubTree, no hay recorrido recursivo automático ni escritura en los favoritos. [API oficial de favoritos](https://developer.chrome.com/docs/extensions/reference/api/bookmarks).

El contexto action permite agregar un comando al menú del icono de la extensión; no depende de que la página deje abrir su menú contextual. La captura sigue siendo opcional y, si Chrome la rechaza, se permite guardar el acceso sin miniatura. [Menús contextuales de Chrome](https://developer.chrome.com/docs/extensions/reference/api/contextMenus).

## Verificación

41 pruebas automáticas aprobadas: las 28 previas ampliadas y 13 nuevas para tags, importación y movimiento. Cubren reimportación sin reemplazo, exclusión de subcarpetas, conservación de tags e imágenes, protocolos no permitidos y destino válido. El test del worker incluye el menú action.

Son pruebas de lógica, estructura y APIs simuladas. No se ha validado visualmente esta versión ni la concesión real del permiso en el perfil personal del usuario. No se han leído sus favoritos reales para las pruebas.

Para la aceptación manual: recargar la misma instalación; probar sugerencia XXX al escribir x; mover un acceso y cancelar otro; importar una carpeta con subcarpetas, repetir, añadir un favorito nuevo y repetir; confirmar que solo aparece el nuevo. Probar también denegar el permiso y el clic derecho sobre el icono desde Google.

La auditoría AUDITORIA.md corresponde a 1.1.0; este documento registra los cambios y el permiso opcional de 1.2.0.
