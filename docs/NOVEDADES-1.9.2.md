# NEX.B 1.9.2 — Sincronización segura y captura masiva robusta

## Cambios incluidos

- **La sincronización no revierte ediciones:** antes, tras cada guardado se leía la copia remota (aún antigua) y sus datos ganaban sobre los locales. Ahora cada equipo guarda la última revisión aplicada y una marca de cambios pendientes:
  - sin cambios en la nube → se suben los locales;
  - cambios solo en la nube → se aplican (los borrados se propagan);
  - cambios en ambos lados → se combinan por identificador y gana el local en conflicto.
- **Primera activación:** si hay datos en la nube y en el equipo, un diálogo permite usar los de este equipo, los de la nube o combinarlos.
- **Cuota y fragmentos:** se comprueban los límites de `chrome.storage.sync` antes de escribir. Los fragmentos llevan la revisión en su clave y una suma de control, así que nunca se mezclan dos versiones. Los restos antiguos se limpian.
- **Ya no se activa sola:** «Sincronizar ahora» y «Sincronizar imágenes con Google Drive» no activan la sincronización de datos sin permiso.
- **Drive:** paginación completa de `appDataFolder`, mensaje claro ante un Client ID de OAuth inválido y botón manual **Limpiar imágenes huérfanas en Drive**, con confirmación (borra imágenes de accesos que no existen en este equipo).
- **Captura masiva:** registra la escucha antes de navegar (no pierde redirecciones), ignora el estado de la página anterior, espera 600 ms de pintado, respeta 2 capturas por segundo, guarda cada 5 miniaturas y se puede cancelar.

## Limitaciones conocidas

- Si dos equipos cambian a la vez y uno borra un acceso que el otro conserva, el acceso puede reaparecer al combinar.
- Una miniatura de Drive modificada en dos equipos se marca como conflicto y no se sobrescribe (comportamiento de 1.9.1).

## Verificación

170 pruebas automáticas aprobadas (`npm test`).

Pendiente de comprobar manualmente en Chrome: activar la sincronización en dos perfiles, editar, borrar y combinar; conectar Google Drive; capturar más de 20 accesos, cancelar a mitad y probar una redirección http→https.

Esta versión no cambia permisos.
