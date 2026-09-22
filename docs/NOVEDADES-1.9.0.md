# NEX.B 1.9.0 — Enfoque sin duplicados, Diseño persistente, borrado de Workspace y CI

## Cambios

- **Enfoque sin pestaña duplicada (#24):** al abrir un acceso, nex.b busca primero una pestaña que coincida con el documento o dominio y enfoca esa pestaña y su ventana antes de crear otra. El indicador «abierto» y la decisión de reutilizar usan la misma identidad de documento, de modo que una URL con `?consulta`, `#fragmento` o `www.` adicionales ya no abre una copia. La detección exacta (`matchType: exact`) conserva la coincidencia estricta.
- **Diseño persistente y aplicado (#28):** el alto de miniaturas se deriva del tamaño elegido (`thumbnailHeightForSize`) al guardar y al usar el selector rápido; el color de borde elegido por el usuario se aplica y, cuando coincide con el predeterminado, cada tema (Papel, Minimalista, Bosque) conserva su propio borde como reserva. Los ajustes de Diseño se guardan y se recuperan al recargar.
- **Eliminación segura de Workspace (#16):** el diálogo Editar Workspace incorpora **Eliminar Workspace** con un resumen previo de categorías, subcategorías y accesos. La acción exige una confirmación explícita, no permite eliminar el último Workspace, elimina el Workspace junto con sus categorías y accesos, y si era el activo navega a otro existente. La copia anterior queda como respaldo local y puede restaurarse desde Configuración → Datos.
- **Integración continua y guía de contribución:** GitHub Actions ejecuta `npm test` con Node.js 20 en cada `pull_request` y en cada push a `main`. Se añade `CONTRIBUTING.md` con requisitos (Node.js 20 o posterior), ejecución de pruebas y alcance de los cambios.

## Verificación

132 pruebas automáticas aprobadas (`npm test`), incluidas regresiones de reutilización de pestaña con `?consulta`/`#fragmento`/`www.`, persistencia y aplicación de Diseño, eliminación de Workspace con respaldo y comprobaciones de estructura de la interfaz. Las pruebas usan APIs simuladas y lecturas de archivos; no sustituyen la comprobación visual en Chrome.

Pendiente de comprobar manualmente en Chrome: recargar la extensión, confirmar que un acceso abierto enfoca su pestaña en vez de duplicarla, aplicar y recargar los ajustes de Diseño, y eliminar un Workspace de prueba restaurándolo después desde Configuración → Datos.

Esta versión no cambia el esquema de almacenamiento.
