# nex.b 2.1.1 — integración de octubre

Entrega local integrada el 9 de octubre de 2026. Base limpia: main remoto comprobado, `0fcf5b9cb2cc77df69b45f41d594e6f78cab5307` (2.0.8). Rama: `Kilexmommm/release-2.1.1`. Aún no es una release publicada.

## Cambios incluidos

- Todas las mejoras de [2.1.0](NOVEDADES-2.1.0.md): memoria de pestañas, imágenes en IndexedDB, respaldo en Worker, privacidad y coordinación de sincronización.
- Diseño (#36/#28): sombra desactivable; estilo Plano sin sombra; borde 0px al elegir Sin borde; colores y preferencias persistentes.
- Inventario (#27): título de hasta 30 caracteres sin partir emojis, nombre completo para búsqueda y tooltip, URL en tooltip. Se conservan selección a la izquierda, cierre superior, ancho adaptable e indicador de pestaña en reposo.
- Side Panel (#46): sección plegable y modo Solo títulos guardados por dispositivo; selector y búsqueda legibles en ancho estrecho; apertura en una nueva ventana con grupo nativo «Workspace · sección». Un fallo al agrupar o titular se informa sin cerrar los enlaces abiertos.
- Pie (#26 y petición del usuario): Feedback, versión real y botón «Apóyame en Ko-fi», con destino `https://ko-fi.com/G5A528GFJQ` y color `#72a4f2`. Es un enlace local compatible con Manifest V3, sin scripts remotos.

Los conflictos de app.js se resolvieron conservando las importaciones del almacenamiento de imágenes y Worker, el procesamiento por bloques de 40 tarjetas y el indicador de pestañas en reposo. La clave de extensión y el Client ID OAuth se conservan respecto a main.

## Evidencia de validación

- `npm test`: **238/238 pruebas aprobadas**, cero fallos. Se añadieron 12 pruebas de apertura agrupada y fallos parciales, permisos locales, persistencia de diseño y respaldo, preferencias locales y títulos del inventario.
- `node --check` en todos los módulos de src y el script de validación; `bash -n install.sh`; diff sin errores de espacios.
- Chrome **154.0.8037.98**, headless, con perfil temporal independiente del personal. ID de extensión: `ajpccaeicnejkemfiimpkgpdflengaao`.
- Carga de la extensión real, versión y enlace Ko-fi.
- Migración real de biblioteca y respaldo desde imágenes data URL a IndexedDB; existencia de blobs y miniaturas cargadas desde URLs blob.
- Biblioteca de 45 accesos: primeras 40 tarjetas conservadas por la integración.
- Exportación/importación ZIP con Worker real; restauración de los 45 accesos y sus imágenes.
- Plegado y Solo títulos conservados tras recargar; título sigue disponible como botón para abrir accesos.
- Formulario de Diseño guardado y recargado: sombra desactivada, borde 0px y color personalizado conservado.
- Selector y buscador a 360px con anchura mayor de 200px y sin desbordamiento horizontal. Esta prueba reproduce el ancho del panel, no toda la interacción nativa del Side Panel.
- Inventario con una pestaña web local real: truncado a 30 caracteres, búsqueda con título completo y URL en tooltip.
- Nueva ventana y grupo nativos de Chrome, dos pestañas y título «Prueba · Recursos».
- Instalación limpia sin concesión automática de clipboardRead ni identity.email.
- Cero excepciones JavaScript durante la ejecución satisfactoria del script.

La comprobación real se puede repetir mediante `node --experimental-websocket scripts/verify-chrome.mjs` con Node 20, o `node scripts/verify-chrome.mjs` con Node 22, contra un Chrome iniciado con un perfil **exclusivamente de pruebas**, puerto 9228 y `--enable-unsafe-extension-debugging`. El script reemplaza los datos de esa extensión en dicho perfil con fixtures. No usarlo contra el perfil personal.

## Pendientes de aceptación externa

OAuth y acceso a Drive con una cuenta real, consentimiento interactivo de permisos opcionales y sincronización entre dos equipos. Las pruebas automatizadas cubren lógica y fallos de estas funciones, pero no sustituyen esos recorridos reales. No se reporta medición de RAM/CPU ni se declara probada la apertura nativa del Side Panel mediante gesto del usuario.

Finder (#3) y la revisión de PR antiguos #6/#8/#10 quedan fuera de esta entrega según el plan acordado. No se han cerrado issues ni publicado la release.

## Actualizar sin perder datos

Exporta un ZIP antes de actualizar desde 2.0.x. Cierra paneles antiguos, reemplaza los archivos de **la misma carpeta de instalación** y pulsa Recargar en chrome://extensions. No desinstales. El cambio a IndexedDB de 2.1.x exige un ZIP portable para volver a 2.0.x.

La carpeta de desarrollo limpia se llama `entrega-2.1.1`. También se actualizaron los archivos cargables de `product-manager` y de su antigua copia `nex-b-2.1.0`; esta última conserva su nombre por compatibilidad con la ruta existente, pero su manifest muestra 2.1.1. El ZIP nuevo se llama `nex-b-2.1.1.zip`.
