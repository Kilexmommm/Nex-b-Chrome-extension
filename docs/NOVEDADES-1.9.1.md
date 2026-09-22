# NEX.B 1.9.1 — Versión unificada

Esta versión reúne en una sola línea de `main` dos trabajos que habían avanzado por separado:

- **Línea 1.8.1:** Side Panel adaptable al ancho reducido (#23) y abrir todas las ventanas de una sección (#29).
- **Línea 1.9.0:** enfoque sin pestaña duplicada (#24), Diseño que persiste (#28), eliminación segura de Workspace (#16), integración continua (GitHub Actions) y `CONTRIBUTING.md`.

## Cambios incluidos

- **Enfoque sin pestaña duplicada (#24):** al abrir un acceso se enfoca la pestaña ya abierta (misma identidad de documento) en lugar de crear una copia.
- **Diseño que persiste y se aplica (#28):** el alto de miniaturas se deriva del tamaño elegido y se guarda; el color de borde se aplica con reserva por tema.
- **Eliminación segura de Workspace (#16):** borra con resumen previo, exige confirmación, no permite borrar el último Workspace y conserva un respaldo local restaurable.
- **Side Panel adaptable (#23):** oculta la marca, selector de Workspace, menú **⋮** y 1 o 2 miniaturas por fila guardado por dispositivo.
- **Abrir toda una sección (#29):** botón **⧉** que abre todos los accesos de una sección y enfoca los que ya están abiertos.
- **Integración continua:** `npm test` con Node.js 20 en cada `pull_request` y push a `main`.

## Verificación

138 pruebas automáticas aprobadas (`npm test`).

Pendiente de comprobar manualmente en Chrome: recargar la extensión, abrir el Side Panel (cabecera reducida, menú ⋮, selector por fila), abrir una sección completa, y probar el borrado de Workspace y la persistencia de Diseño.

Esta versión no cambia permisos.
