# nex.b 2.2.0 — diálogos, ventanas por Workspace y fijados

Completa los pendientes de los PR antiguos #6, #8 y #10 mediante una implementación adaptada a 2.1.2. Conserva el Side Panel compacto, Ko-fi en escritorio, almacenamiento IndexedDB y respaldo en Worker.

## Cambios

- Todos los diálogos tienen una sola × accesible. También se cierran al hacer clic fuera, pero un arrastre iniciado dentro no los cierra. ×, Cancelar, Escape y clic fuera respetan el guardado y las operaciones del diálogo.
- El cierre del aviso de actualización pospone el aviso. Cerrar la elección de sincronización cancela la elección y libera la operación pendiente.
- **Abrir Workspaces en ventanas** está en la barra de escritorio y el menú ⋮ del Side Panel. Permite seleccionar Workspaces; los vacíos quedan desactivados. Cada elegido abre una ventana nueva con un grupo nativo de su nombre. Deduplica las URLs dentro de cada Workspace y omite archivos sin permiso. Informa los resultados y los fallos parciales, y continúa con los otros Workspaces si uno falla.
- La estrella ☆/★ de cada acceso permite fijarlo/desfijarlo. **★ Fijados** aparece al principio del Workspace; el acceso conserva su ubicación original y no se duplica en los datos. Los fijados respetan búsqueda, Solo títulos y carga por bloques de 40; su representación en Fijados no admite reordenación por arrastre.
- La estrella se conserva al editar o mover el acceso, guardar, sincronizar y exportar/importar un ZIP. Solo se guarda `pinned: true`; una biblioteca anterior sin ese campo funciona igual.

## Validación

**246 pruebas automáticas aprobadas**, cero fallos. Incluyen selección y deduplicación por Workspace, fallos parciales y permisos locales; fijar/desfijar sin modificar el original ni duplicar accesos; conservación en edición, persistencia, sincronización y ZIP; restricciones de cierre y cancelación de la elección de sincronización.

Comprobación real en Chrome **155.0.8059.40** con perfil temporal independiente: una × por diálogo; × y clic real en backdrop; fijar, recargar, editar y restaurar ZIP conservando estrella; Escape y backdrop bloqueados durante un guardado mantenido pendiente mediante Web Locks; selector de Workspaces desde ⋮ del Side Panel, vacíos desactivados, apertura solo del elegido, dos URLs deduplicadas y grupo nativo correcto. Cero excepciones JavaScript.

También pasan los recorridos previos de migración a IndexedDB, miniaturas, ZIP en Worker, persistencia de diseño, vista a 360/1200px, inventario y apertura agrupada de sección. Se comprobó sintaxis de los módulos, shell y diff.

Las comprobaciones de sincronización con cuentas reales entre equipos y OAuth/Drive mantienen los límites documentados en 2.1.1. No se realizó una nueva prueba de cuentas reales ni medición de RAM/CPU.

## Actualizar

Exporta un ZIP y cierra los paneles antiguos antes de recargar la misma instalación. Actualiza los equipos que sincronizan antes de utilizar fijados: versiones anteriores no reconocen ese campo y pueden omitirlo al guardar. La reversión a una versión antigua no conserva estrellas; los accesos siguen en sus categorías originales.

Finder (#3) permanece fuera de alcance hasta decidir sobre una app auxiliar macOS.
