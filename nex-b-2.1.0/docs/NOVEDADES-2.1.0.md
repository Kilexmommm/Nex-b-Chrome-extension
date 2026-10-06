# nex.b 2.1.0 — memoria, datos y privacidad

Base: 2.0.8 (`0fcf5b9`). Preparación local; no se ha publicado en GitHub ni instalado en el perfil de Chrome del usuario.

## Usar 100 pestañas

En el Inventario, selecciona las pestañas y pulsa **Liberar memoria de seleccionadas**. Se vuelven a consultar justo antes de actuar; si cambió su URL se omiten. También se omiten activas, fijadas, con audio, cargando, ya descargadas, protegidas por Chrome o por los dominios de Configuración → General. No se cierran. Chrome las recarga al seleccionarlas.

Guarda primero formularios, llamadas y editores: la extensión no puede detectar todo el trabajo sin guardar. La acción es manual. “100 pestañas” no equivale a “cero RAM”; tampoco se muestra una cifra de ahorro inventada. La prueba automática de 100 pestañas usa APIs simuladas, no 100 procesos reales de Chrome.

Abrir una sección consulta las pestañas una sola vez, reutiliza un índice y abre únicamente las que faltan, sin activarlas. No despierta las ya descargadas de memoria. Las nuevas páginas sí se cargan en segundo plano; no es una restauración diferida de sesiones.

## Imágenes y guardado

- Imágenes binarias inmutables identificadas por SHA-256 en IndexedDB; biblioteca y respaldo guardan referencias pequeñas.
- La migración convierte ambas copias y persiste primero los blobs. Un fallo deja intactos los metadatos anteriores. No se migran copias inválidas silenciosamente.
- Se conserva la revisión local y el respaldo anterior. Cargar la biblioteca sana no lee el respaldo completo.
- Referencias con blobs ausentes activan la recuperación, no un borrado silencioso de la biblioteca.
- Miniaturas cercanas al viewport adquieren una URL temporal; al salir de la zona o eliminarse su tarjeta se libera. Cada sección empieza con 40 tarjetas y permite ampliar.
- El tamaño rápido de miniaturas se guarda por dispositivo sin reescribir la biblioteca completa.
- ZIP/JSON se procesan en un Worker temporal; al terminar se cierra. Los ZIP exportados incorporan los bytes y pueden trasladarse a otro perfil.
- Tras un guardado, como máximo una vez al día, se recogen imágenes sin referencias de la biblioteca actual ni del respaldo. Se conservan al menos siete días desde su última importación para proteger operaciones pendientes. Un fallo de limpieza no invalida un guardado correcto.

**Actualización:** exportar un ZIP en 2.0.8, cerrar todos los paneles antiguos, reemplazar los archivos de la misma instalación y recargarla. No desinstalar. El contenedor local de 2.1.0 evita que una versión vieja interprete como vacíos los datos migrados. Para volver a 2.0.x se necesita importar un ZIP portable; conserva especialmente el ZIP anterior a la migración.

## Sincronización e integridad

- Panel lateral y pestaña comparten un bloqueo para coordinar las decisiones de sincronización y los guardados.
- El indicador de cambios pendientes se guarda junto con la revisión local; otra sincronización no lo borra mientras hay un escritor activo.
- Se registra la base de sincronización y la revisión padre. Se combinan cambios independientes y se detectan conflictos de edición/borrado; ante historia incompatible se pide una decisión explícita.
- La combinación manual conserva la unión de elementos y prefiere valores locales; puede recuperar elementos borrados. La interfaz explica este efecto.
- Quota y corrupción pausan los reintentos. Otros errores tienen hasta cinco reintentos: 5, 10, 20, 40 y 80 segundos. Un cambio nuevo o una acción manual permite intentarlo de nuevo.
- Una actualización de Chrome Sync necesita espacio para la versión anterior y la siguiente. Si no caben ambas, se mantiene la anterior y se ofrece ZIP/reducir biblioteca. El límite útil es menor que la cuota total de Chrome; no se simula una transacción distribuida entre equipos.
- No se reemplaza automáticamente la copia remota corrupta por una copia local posiblemente desactualizada.
- La edición de accesos conserva `driveImageId` y el hash de la última sincronización. Las operaciones de Drive del mismo perfil se serializan; el guardado comprueba la revisión tomada antes de la operación.
- Las descargas de Drive tienen tiempo límite y un límite de 8 MiB mientras se lee la respuesta.

## Seguridad y privacidad

- **Solo en este dispositivo** excluye el acceso de Chrome Sync y futuras subidas de imágenes a Drive; se conserva al aplicar una copia remota. El nombre de su Workspace/categoría puede seguir sincronizado. ZIP/JSON incluyen el acceso. Si ya estaba en Drive, la imagen anterior no se elimina automáticamente.
- Las imágenes remotas requieren activar una opción. Al activarla, el servidor remoto puede conocer la IP y el recurso solicitado, aunque no se envíe Referer.
- `clipboardRead`, `identity.email` y el acceso amplio para captura masiva son opcionales y se solicitan al usar la función. Las autorizaciones que ya existan en un perfil no se revocan automáticamente.
- Capturas individuales y masivas comprueban pestaña/URL antes y después. Esto reduce carreras; no hace atómica una captura frente a todos los cambios de Chrome.
- El aviso de actualización consulta releases publicadas y ofrece su enlace. La interfaz ya no promueve ejecutar un script de `main` mediante un pipe de shell. El instalador opcional pide un SHA completo, conserva los archivos anteriores y evita actualizar clones Git o enlaces simbólicos.
- Se mantienen CSP, validación de URLs, DOM con texto seguro y almacenamiento de Chrome limitado a contextos de la extensión.

Los respaldos siguen sin cifrado ni firma. Elegir un commit o usar HTTPS no certifica la autoría del software. No se ha realizado un pentest ni fuzzing de decodificadores de imágenes.

## Verificación

Ejecutar `npm test`, `node --check` sobre los módulos y `bash -n install.sh`.

La suite cubre migración y fallo de persistencia, respaldo y falta de imágenes, recuperación, concurrencia entre paneles y ramas de cambios entre equipos, privacidad de accesos locales, cuota sin destruir la revisión anterior, captura de pestaña equivocada, conservación de hashes, reintentos acotados, selección de 100 pestañas y apertura por lote sin despertar las existentes.

En esta preparación se usó Node 22.23.2. Chrome headless se intentó con un perfil temporal independiente y terminó con SIGABRT (-6) al arrancar. Quedan por verificar en Chrome real: IndexedDB/migración, renderizado de miniaturas, Worker de respaldo, concesión de permisos, OAuth/Drive, sincronización real entre dos equipos y medición de RAM/CPU. No se accedió al perfil personal ni se inventaron mediciones.
