# Auditoría de NEX.B — 1.0.0 → 1.1.0

Fecha: 7 de septiembre de 2026.
Alcance: revisión de los archivos locales de workspace-launcher-mvp y refactorización solicitada. No se inspeccionaron los datos privados del perfil de Chrome, ni se desinstaló la extensión.

## Dictamen

La versión revisada tenía riesgos relevantes de pérdida de datos y varios problemas de rendimiento y mantenimiento. No encontré en estos archivos código de analítica, envío de enlaces a un servidor, scripts remotos ni una vulnerabilidad XSS crítica demostrada. Eso no constituye una certificación de ausencia de vulnerabilidades.

Implementé una versión refactorizada con 28 pruebas aprobadas. El código y las pruebas están entregados; la aceptación visual y las pruebas con APIs reales en Chrome quedan pendientes porque el navegador aislado no arrancó en este entorno. No recomiendo presentarla como “producción verificada” hasta completar esas comprobaciones.

## 1. Diagnóstico y control de calidad

Severidad contextual, sin puntuación CVSS: “alta” describe pérdida importante de configuración; no implica ejecución remota de código.

| Prioridad | Hallazgo en 1.0.0 | Efecto | Corrección implementada |
| --- | --- | --- | --- |
| Alta | save() escribía el estado completo sin esperar resultado ni comprobar revisiones | Dos paneles podían sobrescribirse; un fallo de disco parecía éxito | storage.js coordina escritores mediante Web Locks, compara revisiones y espera el guardado; el editor conserva el formulario ante error |
| Alta | workspaceDataBackup recibía exactamente los mismos datos que workspaceData | No existía una versión previa útil | Se conserva el estado válido anterior; se puede restaurar desde Configurar |
| Alta | El importador ZIP leía encabezados locales sin CRC, límites completos ni validación de esquema | Archivos dañados/incompatibles podían reemplazar la biblioteca; imágenes faltantes se borraban silenciosamente | Validación del directorio central, encabezados, tamaños, duplicados, rutas, CRC y esquema; confirmación antes de sustituir |
| Media | Un único pendingAccess persistente para todas las altas | Altas concurrentes se pisaban; capturas privadas podían quedar persistentes | Borradores con UUID en sesión, máximo ocho, caducidad lógica y limpieza; los enlaces no capturan una página ajena |
| Media | Detección de documento eliminaba query/hash y convertía la ruta a minúsculas | Podía enfocar otro recurso o documento | IDs específicos de Docs/Drive/Figma/Miro; mayúsculas preservadas; para sitios desconocidos se conserva la URL completa |
| Media | Apertura basada en caché y sin coordinación | Doble clic podía crear duplicados o usar una pestaña cerrada | Consulta actual al abrir y bloqueo entre paneles; solo se crea reemplazo si la pestaña dejó de existir |
| Media | Datos importados podían determinar URLs de recursos y CSS de fondo arbitrario | Solicitudes externas inesperadas, estilos alterados, datos inválidos | Esquema cerrado, URLs HTTP/HTTPS sin credenciales para accesos, imágenes HTTPS/raster base64 y fondos CSS predefinidos |
| Media | Listeners de pestañas reconstruían todo el panel incluso al cambiar de pestaña activa | Trabajo DOM, cómputo y decodificaciones repetidas | Eventos filtrados, agrupación de 150 ms y actualización solo de indicadores |
| Media | PNG de pantalla a resolución original y miniaturas sin límites | Memoria, disco y exportaciones desproporcionados | Captura JPEG, reducción WebP a 1280 px; límite de entrada de 8 MiB y cierre del bitmap |
| Baja | Tres bases CSS concatenadas y reglas de display que anulaban hidden | Espacios grises, vista previa visible indebidamente, mantenimiento difícil | Una base CSS, respeto explícito de hidden, altura de tarjeta ajustada y contraste de etiquetas claras |
| Baja | Render dinámico con innerHTML aunque escapaba los textos | Código más frágil ante futuras modificaciones | Nodos DOM y textContent; eliminación del diálogo antiguo sin uso |
| Baja | Menús reinstalados al evaluar el worker y en varios eventos | Eliminaciones/creaciones redundantes y carreras | Registro en onInstalled; errores de creación comprobados por callback |
| Baja | Revocación inmediata de la URL de descarga, pegado sin control de carrera | Descarga potencialmente interrumpida; imagen del editor anterior podía aparecer tarde | Revocación diferida, estado de procesamiento y descarte de resultados de pegados anteriores |

La importación conserva categorías vacías y reglas eliminadas; no las vuelve a crear por usar un valor por defecto. La cancelación no guarda cambios. Editar un acceso desde Tags no cambia silenciosamente el Workspace activo.

La versión previa escapaba títulos/tags antes de usar innerHTML: por eso no se afirma que cualquier nombre de acceso ejecutara JavaScript. Tampoco había extracción de archivos ZIP al disco: las rutas peligrosas no constituían una escritura arbitraria ya demostrada. La nueva validación refuerza la integridad y reduce superficie de ataque. El uso de DOM seguro y permisos mínimos sigue la [guía de seguridad de Chrome](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure).

## 2. Permisos, seguridad e integridad

| Permiso | Uso concreto | Decisión y riesgo residual |
| --- | --- | --- |
| tabs | Consultar URL de pestañas abiertas para mostrar estado y reutilizarlas | Mantener. Da visibilidad de URLs/títulos de pestañas; activeTab no sustituye la consulta global |
| storage | Guardar biblioteca y borradores | Mantener. Datos locales sensibles, no cifrados por esta aplicación |
| contextMenus | Agregar página/enlace desde clic derecho | Mantener; se filtran identificadores y URLs esperados |
| activeTab | Captura de la pestaña tras la acción explícita del usuario | Mantener; permite una captura temporal, no una monitorización continua |
| unlimitedStorage | Biblioteca con miniaturas y versión anterior que puede superar la cuota local ordinaria | Mantener por compatibilidad. No es un permiso de lectura web; se añaden límites internos para evitar crecimiento ilimitado |

La extensión declara host_permissions para `http://*/*`, `https://*/*` y `https://www.googleapis.com/` para la captura masiva y Drive; no declara <all_urls>, scripting, downloads, content_scripts ni recursos web públicos. También declara `identity` y `clipboardRead`. Para retirar tabs habría que perder la detección global; para retirar unlimitedStorage habría que imponer una cuota total menor o cambiar la estrategia de almacenamiento.

La API de pestañas exige autoridad apropiada para capturas y datos sensibles de pestañas; la implementación usa tabs y activeTab para las capturas individuales, y host permissions para la captura masiva iniciada por el usuario. [Referencia oficial de tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs).

El manifest ahora declara una CSP explícita: scripts locales, sin eval, objetos/frames/conexiones fetch bloqueados e imágenes locales/data/HTTPS. Se permiten estilos inline para colores y fondos dinámicos, no scripts inline. La política predeterminada de MV3 ya existía antes: la ausencia de una CSP explícita no significaba ausencia total de protección. [CSP de extensiones Chrome](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).

El almacenamiento se limita a TRUSTED_CONTEXTS. Los borradores van a session y no a local. Chrome elimina storage.local al desinstalar; storage.session también se vacía al reiniciar/recargar. Sync no sirve como almacén de capturas por sus cuotas pequeñas. Por eso el ZIP externo es la recuperación portable. [Almacenamiento oficial](https://developer.chrome.com/docs/extensions/reference/api/storage).

### Límites que permanecen

- CRC detecta corrupción accidental, no autenticidad. Un atacante puede generar otro ZIP válido. Importa respaldos de confianza; no hay cifrado ni firma.
- Imágenes HTTPS remotas pueden comunicar tu IP y el recurso solicitado al servidor. Se omite Referer, pero eso no evita todo rastreo. El respaldo conserva esas URLs, no sus bytes.
- Las capturas pueden contener información privada. Se añadió un interruptor y revisión previa; no existe detección/redacción automática de secretos.
- La comprobación de pestaña activa antes y después reduce capturas equivocadas, pero no vuelve atómica la captura frente a cambios rápidos del usuario.
- Los límites de archivo y el control de bitmap no son una defensa completa contra imágenes patológicas: la decodificación nativa ocurre antes de comprobar los 40 millones de píxeles. Los recursos remotos tampoco tienen un límite de bytes controlado por la extensión. Hace falta prueba de carga/fuzzing de imágenes para ampliar garantías.
- Web Locks y revisiones protegen escritores de esta versión que usan storage.js. No protegen contra el editor manual de almacenamiento, una versión antigua abierta o una extensión comprometida.
- Guardar las dos versiones en una llamada no es una garantía de transacción ACID ante un fallo del navegador/sistema. Si ambas copias son inválidas, se bloquea el guardado y no se reinicia silenciosamente la biblioteca.

## 3. Rendimiento y service worker

Los principales cuellos de botella previos estaban en la página del panel, no en un worker en bucle continuo.

Antes, para A accesos y T pestañas, cada evento relevante podía repetir comparaciones O(A×T) y reconstruir las tarjetas. Ahora se indexan pestañas por URL/origen/documento y se actualizan indicadores en aproximadamente O(A+T), aparte del coste de procesar cada URL. Cambiar de pestaña activa ya no reconstruye el panel.

Se incorporaron imágenes lazy con decodificación asíncrona. La vista global carga 20 grupos de tags y hasta 40 tarjetas por grupo inicialmente; permite ampliar. Se cachean tags durante un render. Abrir configuración ya no inserta todas las imágenes base64 en un textarea.

El worker registra listeners de forma síncrona, no usa timers de keep-alive y no recibe ni guarda toda la biblioteca al agregar un acceso. Serializa solo los gestos de captura/alta, conserva borradores pequeños en sesión y no reinstala menús en cada reactivación. Este diseño respeta que Chrome puede terminar el worker tras inactividad. [Ciclo de vida oficial](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

El mínimo declarado es Chrome 123 por el uso de promesas en contextMenus.removeAll. La creación de menús conserva callback porque esa API devuelve el ID y comunica errores mediante runtime.lastError. [API de menús](https://developer.chrome.com/docs/extensions/reference/api/contextMenus).

Persisten costes medibles pendientes: validación/serialización del conjunto en cada edición, una versión anterior completa, base64 dentro de storage.local y construcción del ZIP en memoria. Para bibliotecas mayores, la siguiente mejora sería guardar blobs por identificador en IndexedDB y procesar ZIP fuera del hilo de interfaz. No se implementó esa migración invasiva durante esta auditoría.

No se reportan porcentajes inventados de CPU/RAM ni tiempos de carga en Chrome: no se pudo ejecutar un perfilador de navegador. Las mejoras anteriores se justifican por los caminos de ejecución y las pruebas de comportamiento, no por un benchmark visual.

## 4. Código entregado y verificación

La versión 1.1.0 contiene módulos separados de modelo, persistencia, pestañas, imágenes, ZIP, worker e interfaz; no añade dependencias de ejecución. Se mantiene la carpeta de trabajo original.

**28 pruebas automáticas aprobadas**, ejecutadas con `npm test`:

- 8 de modelo/seguridad/coincidencia.
- 7 de ZIP e integridad.
- 5 de persistencia, conflictos, recuperación y errores de disco simulados.
- 4 de apertura y enfoque con APIs simuladas.
- 1 del worker con varias comprobaciones de eventos, menús, borradores, privacidad y fallos.
- 3 de estructura, manifest y regresiones CSS.

También se comprobó sintaxis de todos los módulos. Las pruebas del worker usan mocks: no equivalen a una concesión real de activeTab ni a una captura real. El control de contraste CSS es estático, no una certificación de accesibilidad.

Se intentó iniciar Playwright/Chromium aislado. El binario esperado por la versión de Playwright no estaba instalado; el Chromium de pruebas disponible terminó con SIGABRT bajo las restricciones del entorno. No se usó como alternativa el perfil personal del usuario.

### Comprobaciones pendientes en Chrome antes de aceptar la versión

1. Descargar respaldo con la versión instalada, recargar la misma extensión y cerrar todos los paneles viejos. No desinstalar.
2. Confirmar carga del manifest, CSP, módulos y ausencia de errores de worker.
3. Crear/cancelar/guardar Workspace, categoría, subcategoría y acceso. Comprobar lápiz, menú derecho y navegación por teclado.
4. Probar los cinco estilos, etiquetas claras, ancho de escritorio, móvil, miniatura y borde de diálogo.
5. Pegar PNG/JPEG/WebP/GIF, reemplazar una URL por una captura y cancelar durante el procesamiento. Verificar compresión y liberación de memoria.
6. Desde una página normal, probar menú, botón de extensión y captura; desde un enlace, confirmar que no se captura la página de origen.
7. Abrir dos paneles con el mismo acceso en edición: guardar en uno y comprobar que el otro avisa sin sobrescribir.
8. Exportar/importar y restaurar versión anterior; comprobar títulos, tags, estilos y todas las imágenes locales. Probar ZIP truncado.
9. Cerrar/reabrir Chrome, recuperar paneles y probar múltiples ventanas. Probar incognito solo en un perfil de prueba si se pretende soportarlo.
10. Medir tiempo y memoria con una biblioteca cercana al límite y capturas grandes. Revisar especialmente ZIP y decodificación de imágenes.

## Archivos de entrega

- nex-b-1.1.0-auditado.zip: código refactorizado, pruebas y este informe.
- nex-b-antes-auditoria.zip: copia del código local anterior, no una copia de los datos guardados dentro de Chrome.
- pruebas-nex-b.txt: salida de la suite automatizada.

El resultado es una mejora verificable del código, no una certificación de seguridad ni una promesa de persistencia tras desinstalación.
