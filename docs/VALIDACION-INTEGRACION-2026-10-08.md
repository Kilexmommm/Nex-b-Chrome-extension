# Validación de integración — 8 octubre 2026

Rama: `Kilexmommm/integrar-actualizacion-octubre`. Integración de Diseño, Inventario y Sidebar en `7404cd4`.

## Resultados

- `npm test`: 207 pruebas, 207 aprobadas, 0 fallos.
- Extensión cargada en Chromium for Testing con un perfil temporal separado. Página de extensión real, APIs Chrome reales; sin errores JavaScript observados durante la primera comprobación.
- Colapso: oculta tarjetas y mantiene el estado tras recargar.
- Solo títulos: conserva el estado tras recargar; oculta miniatura y mantiene título visible y operativo. Pulsar título abrió el enlace.
- Diseño: guardar «Sombra en las miniaturas» desactivada produce `box-shadow: none`, persistente al recargar. Plano con «Sin borde» produce `border-top-width: 0px`.
- Apertura agrupada: tres accesos con una URL repetida producen dos pestañas en una ventana nueva; grupo real con título `Compañía · Trabajo 1`; `grouped` y `titled` verdaderos. Ventana de prueba cerrada al terminar.
- Ancho reducido de 411 px: selector de Workspace a 14 px; inventario abierto mediante menú ocupa 363 px y muestra cero URLs visibles.
- Capturas revisadas: `/tmp/nexb-integracion-411.png` y `/tmp/nexb-inventario-411.png`.

## Alcance y límites

Se comprobó la página de extensión con ancho equivalente al panel; no la superficie nativa Side Panel. OAuth, sincronización con cuentas reales, importación de respaldos y permisos file:// no se ejercitaron en estas comprobaciones. La suite existente no garantiza cobertura específica de cada función nueva.

Un primer intento de abrir Inventario con el botón de barra falló porque ese botón se oculta en ancho reducido; se corrigió la automatización usando la opción del menú visible y la comprobación pasó. No se modificó código de producto.

Validación local terminada dentro del alcance descrito. Push, PR, integración a main y publicación quedan pendientes.
