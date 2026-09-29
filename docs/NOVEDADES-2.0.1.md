# NEX.B 2.0.1

## Corrección

- **Las ediciones ya no se deshacen al sincronizar.** La 2.0 se construyó sobre la sincronización de 1.9.1, en la que la copia de Chrome Sync siempre ganaba: si borrabas un tag (o editabas cualquier acceso), la siguiente sincronización lo devolvía. Vuelve la sincronización por revisión de 1.9.2: cada equipo recuerda la última revisión sincronizada y marca sus cambios pendientes, que se suben en vez de reemplazarse.
- **Fragmentos con revisión y suma de control.** Cada guardado usa claves propias y una suma de control, de modo que ya no se pueden mezclar fragmentos de dos equipos (la causa del «Identificador duplicado»). Si la copia remota está dañada, se reemplaza con la de este equipo.
- **Accesos movidos de categoría** no se duplican al combinar dos equipos.
- **Migración desde 1.9.1:** los datos sincronizados con el formato anterior se leen y se combinan (no se reemplazan) la primera vez; el siguiente guardado los migra.
- **Primera activación con datos en ambos lados:** nex.b pregunta si usar los de este equipo, los de la nube o combinarlos.
- **Cuota de Chrome Sync:** si la biblioteca no cabe, aparece un aviso claro y no se escribe nada a medias.

## Verificación

181 pruebas automáticas aprobadas (`npm test`), incluida la regresión «un tag borrado no reaparece».

Pendiente en Chrome: borrar un tag, esperar la sincronización y recargar; mover un acceso de categoría con dos equipos.
