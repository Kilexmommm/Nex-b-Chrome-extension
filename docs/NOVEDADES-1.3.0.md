# NEX.B 1.3.0 — Tarjetas, secciones y recaptura

## Cambios

Nombre e indicador de pestaña abierta se muestran debajo de la miniatura, con contraste para los estilos claros y oscuros. El texto se ajusta a varias líneas y los tags permanecen sobre la imagen.

Las secciones incorporan mover a Workspace (⇥), subir (↑) y bajar (↓). El movimiento preserva IDs, accesos, tags, miniaturas y relaciones de las subcategorías. No combina secciones de igual nombre. El orden se guarda en el arreglo de categorías, compatible con los respaldos existentes.

## Recaptura sin permisos nuevos

La tarjeta sin imagen o con error de carga ofrece Capturar imagen. También hay una opción en el menú contextual para reemplazar miniaturas existentes. El panel abre/enfoca la página y prepara una solicitud temporal vinculada a la pestaña y al ID del acceso. El usuario pulsa el icono de NEX.B cuando el sitio está listo. La captura se presenta en el editor del acceso original y solo se guarda al confirmar.

Chrome concede activeTab por la invocación del usuario desde la pestaña correspondiente; abrir la página desde el panel no basta para autorizar una captura nueva. Este flujo evita agregar <all_urls>. [Documentación de activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

Las solicitudes caducan a los 30 minutos, no usan almacenamiento persistente y se eliminan al cerrar la pestaña. Se comprueba la coincidencia del sitio y el destino original; si el acceso fue eliminado o cambió su URL, la revisión se bloquea sin crear un duplicado. Las capturas fallidas no reemplazan una miniatura anterior. Se sigue usando el control de revisiones de 1.1.0 al guardar.

## Verificación

48 pruebas automáticas aprobadas, incluyendo siete nuevas de recaptura, movimiento y orden. El test del worker verifica la recaptura manual con captura automática desactivada, su asociación al ID original y la limpieza al cerrar la pestaña. Las APIs y el codec se simulan en esa prueba: no equivale a una captura real o aceptación visual en Chrome.

Pendiente de comprobar manualmente: recargar la extensión, capturar desde una página real, revisar/guardar y cancelar; mover una sección con hijos, ordenar secciones y recargar; verificar textos largos y puntos de estado en los cinco estilos.

Las auditorías y notas anteriores conservan el alcance de sus versiones. Esta versión no cambia permisos ni esquema de almacenamiento.
