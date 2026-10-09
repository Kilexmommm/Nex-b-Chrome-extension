# Plan de actualización de nex.b — 6 octubre 2026

## Continuación acordada — 8 octubre 2026

El usuario aprobó preparar una entrega integrada: limpiar la base 2.1.0, incorporar Diseño, Inventario y Side Panel, validar y preparar una única versión, preferiblemente 2.1.1. Este acuerdo sustituye el orden pendiente de la primera ola; su historial se conserva debajo. Publicación y cierre de issues siguen pendientes de evidencia de aceptación.

### Estado comprobado

- `product-manager`: rama `Kilexmommm/modal-actualizacion`, commit `cfed130`, contenido 2.1.0. Conserva `nex-b-2.1.0/` y `nex-b-2.1.0.bundle`, que deben excluirse de la nueva entrega al repositorio, preservando los originales.
- `integrar-actualizacion-octubre`: commit `7404cd4`, integra las tres ramas en el orden Diseño, Inventario y Side Panel, pero conserva la base 2.0.8. No contiene la integración con 2.1.0.
- Suites ejecutadas durante esta revisión: 226 pruebas aprobadas en 2.1.0 y 207 en la integración de octubre; cero fallos. No demuestran cobertura específica de los cambios de la primera ola ni aceptación funcional en Chrome.
- El estado remoto de main, releases, PR e issues debe comprobarse antes de preparar el PR; esta revisión verificó el estado local.

### Bloques de trabajo y aceptación

1. **Preparar una base 2.1.0 limpia.** Partir del main remoto comprobado, conservar el contenido funcional de 2.1.0 y excluir la carpeta de entrega duplicada y el bundle del diff. Revisar que no desaparezcan cambios de 2.0.8. Evidencia: diff revisable y suite aprobada. No borrar los originales ni alterar las ramas existentes.
2. **Integrar las mejoras de octubre.** Incorporar Diseño, Inventario y Side Panel secuencialmente, resolviendo los cambios compartidos según su comportamiento. Conservar almacenamiento de imágenes, respaldo, permisos opcionales, privacidad y sincronización de 2.1.0. Evidencia: pruebas de los comportamientos nuevos y suite completa aprobada.
3. **Validar la actualización en Chrome.** Exportar primero un ZIP de la instalación anterior. Comprobar migración a IndexedDB, miniaturas, exportación/importación, permisos opcionales, Drive y sincronización real entre equipos. Verificar persistencia de diseño tras recarga, sombra desactivable y borde plano; inventario adaptable y títulos/tooltip; Side Panel estrecho, plegado, solo títulos y nueva ventana agrupada. No declarar validación realizada mediante mocks.
4. **Preparar una entrega única.** Versión propuesta 2.1.1, sujeta a comprobar las versiones ya publicadas. Unificar manifest, package, notas y paquete de distribución. Preparar PR y release con evidencia y límites; publicar tras aceptación funcional. El aviso de actualización requiere una release publicada.
5. **Cerrar el seguimiento con evidencia.** Cerrar #46, #36, #28, #27 y #26 solo tras comprobar sus criterios. Revisar después los PR #6, #8 y #10. #3 Finder queda fuera de esta entrega, pendiente de decisión.

### Primer bloque a ejecutar

Actualización del 9 de octubre: el usuario pidió ejecutar la integración y completar las pruebas. Codex preparó `Kilexmommm/release-2.1.1` sobre main remoto comprobado (`0fcf5b9`), incorporando 2.1.0, las tres ramas de octubre y Ko-fi. La entrega limpia está en `entrega-2.1.1`. Consulte `NOVEDADES-2.1.1.md` para evidencia y validaciones pendientes.

Fuente de prioridades: issues abiertas de Kilexmommm/Nex-b-Chrome-extension consultadas el 6 de octubre. Base de implementación: origin/main, 0fcf5b9cb2cc77df69b45f41d594e6f78cab5307. La rama de Product Manager conserva trabajo diferente.

## Trabajo y aceptación

| Prioridad | Issues | Responsable OpenCode | Resultado observable |
| --- | --- | --- | --- |
| Alta | #46 | actualizacion-sidebar | Una sección abre sus enlaces en una nueva ventana y un grupo nombrado con Workspace y sección; secciones colapsables; opción solo títulos; desplegables legibles en Side Panel. |
| Alta | #28, #36 | actualizacion-diseno | Colores y bordes se aplican y persisten; sombra desactivable; estilo plano con borde 0px. |
| Media | #27, #26 | actualizacion-inventario | Inventario con selección junto al título, límite solicitado de 30 caracteres, URL en tooltip, anchura adaptable y cierre arriba derecha; feedback al repositorio correcto. |
| Pendiente de decisión | #3 | Product Manager | Definir necesidad y distribución de integración Finder antes de implementar. |

Cada agente revisa primero lo que ya cumple main; las issues antiguas pueden seguir abiertas aunque exista parte del cambio. Informará evidencia y brechas sin declarar cierre automático.

## Ejecución

Tres ramas y checkouts separados, agentes OpenCode con selección explícita deepseek/deepseek-flash y credenciales existentes. Orca registra Run, Task y Dispatch; el coordinador responde bloqueos y recoge resultados. No modificar la configuración global ni cambiar a un modelo más caro automáticamente.

Cada agente entrega un commit local y un informe con archivos afectados, criterios satisfechos y validación pendiente. Los agentes pueden tocar archivos comunes en sus ramas; la integración será secuencial: Diseño, Inventario, Sidebar, resolviendo diferencias semánticamente. Revisión posterior de persistencia, compatibilidad y comportamiento en panel estrecho antes de preparar publicación. Esta sesión no solicita ejecutar pruebas; la validación funcional en Chrome queda pendiente y debe constar en los informes.

No actualizar versión, publicar releases, hacer push, cerrar issues ni implementar Finder durante esta ola. No sincronizar preferencias solo locales del panel como contenido de biblioteca sin justificarlo. Conservar configuración existente y evitar perder accesos.

## Seguimiento

Run Orca: run_27db6a91dad8. Solo un worker_done válido liquida cada intento. Un silencio o timeout no demuestra que el agente haya terminado. Registrar por tarea resultado, evidencia y bloqueo antes de liberar el agente.

## Entregas de la primera ola

- Diseño: commit local b394b5f en `Kilexmommm/actualizacion-diseno`; control de sombra implementado. #28 muestra solución existente mediante inspección de código e historial, pendiente de confirmación en Chrome.
- Inventario: commit local 3f4efef en `Kilexmommm/actualizacion-inventario`; truncado y tooltip implementados. #26 ya enlaza al repositorio correcto.
- Sidebar: commits locales 750e85a y 163ddd0 en `Kilexmommm/actualizacion-sidebar`; cuatro mejoras implementadas. La corrección adicional distingue enlaces abiertos, grupo creado y título aplicado; informa fallos parciales conservando las pestañas.
- Modelo observado en las tres terminales: DeepSeek V4.1 Flash (`deepseek/deepseek-flash`).
- No se ejecutaron suites de pruebas. Las verificaciones declaradas por los agentes son sintaxis, lectura de código y limpieza del diff. Esta limitación fue definida por el coordinador; el usuario no prohibió expresamente las pruebas.
- Los cambios están en ramas separadas: la integración y la validación funcional en Chrome siguen pendientes.
- Los cuatro Dispatches terminaron con worker_done succeeded. Se solicitó release; Orca conserva las terminales por su propiedad externa (external_terminal, processAction none). No quedan terminales reclaimable.
