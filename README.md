# nex.b · 1.7.1

![Icono de nex.b](icons/nex-b-128.png)

**Tu nueva pestaña, organizada por proyectos.** Un panel visual para encontrar tus recursos de trabajo, agruparlos por Workspace y volver a las pestañas que ya tienes abiertas.

Chrome 123+ · Manifest V3 · Sin compilación · **By.kilex**

## Beneficios

- **Menos pestañas duplicadas:** busca primero una pestaña coincidente y enfoca su ventana antes de abrir otra.
- **Organización por proyecto:** Workspaces, secciones y subcategorías para separar trabajo, estudio y proyectos personales.
- **Accesos reconocibles:** pega una captura como miniatura; el nombre y el estado quedan debajo, sin tapar la imagen.
- **Tags que conectan tu biblioteca:** etiquetas propias, sugerencias mientras escribes y reglas automáticas por dominio; consulta tags de todos tus Workspaces.
- **Importación sin duplicados:** incorpora los enlaces directos de una carpeta de favoritos e ignora los que ya existen en el Workspace de destino.
- **Tu espacio, a tu gusto:** nueve estilos, fondos, colores y tamaños de miniatura, sin necesitar una cuenta de NEX.B.
- **Datos bajo tu control:** guardado local, respaldo ZIP e importación de configuración e imágenes incorporadas.

## Instalar desde GitHub

1. Pulsa **Code → Download ZIP** en este repositorio y descomprime el archivo en una carpeta permanente.
2. Abre `chrome://extensions` y activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y selecciona la carpeta que contiene `manifest.json`.
4. Abre una nueva pestaña y fija el icono naranja de NEX.B desde el menú de extensiones de Chrome (puzle).

No necesitas instalar dependencias. Esta distribución se carga localmente; no es una publicación en Chrome Web Store. El ZIP de código de GitHub **no contiene tu configuración personal**.

## Últimas actualizaciones

### Ajustes 1.7.1

- La apertura de archivos locales ahora pasa por el service worker antes de comunicarse con el asistente macOS. Corrige el error `chrome.runtime.sendNativeMessage is not a function` desde el panel.

### Ajustes 1.7.0

- Configuración incorpora **Diseño de interfaz**: fuente, estilo y color de borde, separación entre tarjetas y estilo de iconos.
- Las opciones son valores seguros predefinidos y se guardan en tu respaldo ZIP; no se permite CSS libre.
- Los estilos prediseñados siguen al final del formulario y no borran estos ajustes visuales.

### Ajustes 1.6.3

- Todas las miniaturas y la tarjeta de nuevo acceso usan proporción horizontal **5:3**, sin importar el tamaño elegido.
- Se quitaron las flechas de orden de cada tarjeta: ahora se ordenan únicamente arrastrando una miniatura dentro de su sección.

### Ajustes 1.6.2

- Bajo, Mediano y Alto ahora escalan la tarjeta completa de forma proporcional: ancho y alto cambian juntos en −30%, referencia y +30%.
- Las miniaturas se pueden ordenar con las flechas o arrastrándolas dentro de la misma sección.

### Ajustes 1.6.1

- El selector rápido ahora representa el **alto**: Bajo es 30% menor, Mediano es la referencia y Alto es 30% mayor.
- Las tarjetas son 20% más angostas para aprovechar mejor el espacio horizontal.
- Las instalaciones nuevas comienzan en Bajo; tu preferencia guardada no se modifica.

### Ajustes 1.6.0

- La marca visible ahora es **nex.b**, en minúsculas.
- Clic en el icono naranja abre o enfoca el inicio de nex.b; **Agregar sitio a nex.b** sigue disponible con clic derecho.
- La vista Tags muestra a qué Workspace pertenece cada tarjeta.
- Edita y ordena Workspaces con `✎`, `←` y `→`; las miniaturas también se ordenan con sus flechas laterales.
- `▣` permite cambiar las miniaturas entre Pequeño, Mediano y Grande desde el Workspace.
- Se incluye el asistente local opcional para macOS, que abre rutas `file://` mediante Native Messaging. Consulta [instalación macOS](native-host/INSTALAR-MACOS.md).

### Ajustes 1.5.0

- Una sección puede vincularse a una carpeta de Favoritos de Chrome al importarla.
- `↻` sincroniza manualmente esa sección; **Sincronizar Workspace** ejecuta todas las secciones vinculadas del espacio actual.
- La sincronización agrega solo URLs nuevas y conserva nombre, tags, imagen y edición de los accesos existentes.
- Si un favorito se quitó de Chrome, NEX.B no lo borra: aparece con un aviso solo al editar ese acceso. Si vuelve a Favoritos, el aviso desaparece al sincronizar.

### Ajustes 1.4.4

- Las tarjetas sin miniatura usan un color plano por tema, sin degradado. No cambian las imágenes ni los fondos de página.

### Ajustes 1.4.3

- Nuevo estilo Papel: arena, naranja terracota y textura ligera creada con CSS, sin descargas externas.
- Se elige al final de Configuración → Estilos → Papel → Guardar configuración; no reemplaza el estilo actual automáticamente.

### Ajustes 1.4.2

- Contadores solo numéricos en secciones y tags, con descripción para lectores de pantalla.
- Iconos de sección sin bordes; se conserva el indicador de foco del teclado.
- Firma By.kilex al final de la página.

### Ajustes 1.4.1

- Miniaturas sin imagen con degradados marfil/salvia en Minimalista y verdes en Bosque.
- Bordes, tags y controles secundarios coordinados con ambos temas, sin modificar fondos personalizados.
- Editar semitransparente en todos los estilos; se destaca al pasar el puntero o usar el teclado.
- Se conservan los nombres de dos líneas y el pie transparente. No cambian permisos ni datos guardados.

Extensión local Chrome Manifest V3 para Workspaces, categorías, accesos visuales y tags. Requiere Chrome 123 o posterior. No necesita dependencias ni compilación para usarse.

## Actualizar sin perder datos

1. Descarga un ZIP de tu configuración desde ⚙ antes de actualizar. No es el ZIP del código.
2. Conserva esta misma carpeta y la misma instalación. En chrome://extensions pulsa **Recargar**, no **Eliminar**.
3. Cierra los paneles antiguos de NEX.B y abre una nueva pestaña. Los paneles de la versión anterior no tienen la protección nueva contra sobrescrituras.
4. Verifica tus Workspaces. Si aparece una advertencia de datos incompatibles, no desinstales ni borres el almacenamiento; conserva una copia para repararlo.

Para instalar por primera vez: chrome://extensions → Modo de desarrollador → Cargar descomprimida → esta carpeta.

## Uso

### Ajustes 1.4.0

- Nombres a 13 px, máximo dos líneas con puntos suspensivos; el nombre completo sigue disponible al mantener el puntero encima.
- Nombre y punto de estado sobre fondo transparente, fuera del borde que rodea únicamente la miniatura.
- Botón Importar favoritos de Chrome en naranja con texto oscuro y foco visible.
- Dos estilos adicionales: Aurora (nocturno) y Dunas (claro), con imágenes originales generadas e incluidas en assets/backgrounds. No solicitan imágenes a un servidor y funcionan sin conexión.
- Estilos sigue al final del formulario. Elige el estilo y pulsa Guardar configuración.

Los nuevos fondos forman parte del paquete de la extensión. El respaldo de configuración conserva su selección y los utiliza al restaurarlo en NEX.B 1.4.0 o posterior. No se cambia tu estilo guardado automáticamente.

En 1.4.0 se aprobaron 52 pruebas automáticas. Se inspeccionaron los fondos generados; la interfaz todavía requiere comprobación visual en Chrome.

### Ajustes 1.3.1

Estilos queda al final del formulario, antes de Guardar configuración. Alegre usa crema, coral suave y verde claro; se agrega Bosque, verde oscuro. Selecciona el estilo y guarda para aplicar su nueva paleta.

Después de abrir el sitio desde Capturar imagen, usa clic derecho en la página → NEX.B → **Actualizar captura del acceso**, o la misma opción en el clic derecho del icono. Si el icono no aparece, abre Extensiones (puzle) de Chrome y fija NEX.B. El código anterior dependía del clic normal del icono y su marca ↻; no había una opción explícita llamada Actualizar captura. No se ha inspeccionado el perfil real para determinar si el icono estaba oculto.

50 pruebas automáticas aprobadas; la apariencia y los menús reales aún requieren comprobación en Chrome. Recarga la misma extensión sin desinstalarla y abre un panel nuevo para ver estos cambios.

### Novedades 1.3.0

- El nombre completo del acceso aparece debajo de la imagen y puede ocupar varias líneas. El punto verde/gris está al lado del nombre. Los tags siguen sobre la miniatura.
- Cuando falta la imagen o su URL falla, aparece **↻ Capturar imagen**. Para reemplazar una imagen existente, usa clic derecho en la tarjeta → **Volver a capturar imagen**.
- La recaptura se realiza en tres pasos: **Abrir sitio para capturar** → esperar a que cargue y pulsar el icono naranja de NEX.B en Chrome → revisar la imagen y **Guardar acceso**. Se edita el acceso original, conservando sus tags, nombre y categoría. No es una captura silenciosa ni automática desde otra pestaña; no añade permisos generales de sitios. La recaptura manual funciona aunque la captura automática esté desactivada.
- En cada sección, **⇥** la mueve a otro Workspace con sus accesos y subcategorías. Mover solo una subcategoría la convierte en sección principal en el destino. No se fusionan ni reemplazan secciones por tener el mismo nombre.
- **↑ / ↓** suben y bajan las secciones entre las del mismo nivel en su Workspace. Las subcategorías se ordenan dentro de su categoría padre. El orden se guarda y se conserva en el ZIP.

Si una página redirige al inicio de sesión, vuelve al recurso original antes de pulsar NEX.B. La solicitud de recaptura vence en 30 minutos y se elimina al cerrar la pestaña. Si falla la captura, el editor conserva la imagen anterior, si existía. Puedes cancelar la revisión sin sustituirla.

### Novedades 1.2.0

- Al escribir tags, el listado filtra los existentes de todos los Workspaces y los configurados por URL. Por ejemplo, escribir “x” sugiere “XXX”. Seleccionar reemplaza el fragmento escrito; también puedes crear tags nuevos. Usa Tab o flecha abajo para elegir una sugerencia con teclado.
- En Editar, elige **Workspace de destino** y **Categoría**, luego guarda. También puedes usar clic derecho en la tarjeta → **Mover a Workspace…**. Se conservan ID, tags, miniatura y URL; cancelar no mueve nada.
- La cabecera de escritorio coloca NEX.B, etiquetas de Workspaces y Tags en una fila; Configurar y + Workspace quedan a la derecha. Si hay muchas etiquetas, la zona central se desplaza horizontalmente. En móvil se usan dos filas para mantener legibles los controles.
- Haz clic derecho en el **icono de NEX.B en la barra de Chrome** → **Agregar sitio a NEX.B**. No depende del menú contextual del sitio; también funciona el clic normal en el icono. Solo se admiten sitios HTTP/HTTPS, no páginas internas de Chrome.

### Importar una carpeta de favoritos de Chrome

1. ⚙ → **Importar favoritos de Chrome**. Autoriza el permiso opcional cuando Chrome lo solicite. Si lo deniegas, no se lee ni importa nada.
2. Entra a la carpeta deseada con los botones de carpetas; “Carpeta superior” permite volver atrás. El contador muestra los enlaces directos.
3. Elige Workspace y una sección existente, o escribe el nombre de una sección principal. Si ese nombre ya existe en el Workspace, se reutiliza.
4. Pulsa **Importar nuevos**. Se omiten las subcarpetas, URLs no HTTP/HTTPS y URLs repetidas en cualquier sección del Workspace de destino. Repetir la importación no reemplaza nombres, tags ni imágenes editadas. Las URLs con parámetros distintos se consideran diferentes.

NEX.B usa únicamente lecturas de favoritos para esta función. El permiso de Chrome abarca lectura/modificación, pero el código no crea, mueve ni elimina favoritos del navegador. Se solicita bajo demanda, no durante la instalación. No se cargan favicons ni se abren los enlaces importados para capturarlos.

La importación es manual, no una sincronización continua. Solo crea una sección nueva si hay enlaces nuevos para agregar.

- **+ Workspace** crea un espacio. Las etiquetas superiores cambian entre espacios.
- **+** al pie crea categorías/subcategorías; **+** dentro de una categoría agrega accesos.
- Clic en una tarjeta abre o enfoca su pestaña; el lápiz edita. Clic derecho permite editar, copiar URL o remover.
- En el editor, pega una captura con ⌘V / Ctrl+V. Puedes quitarla o reemplazarla. La URL de miniatura admite HTTPS.
- **Tags** agrupa accesos etiquetados de todos los Workspaces. Los grupos grandes se muestran por partes.
- ⚙ ofrece nueve estilos: **Papel, Minimalista, Alegre, Bosque, Aurora, Dunas, Espacio, Oscuro y Claro**. También permite ajustar colores, tamaño, reglas automáticas por dominio y la captura automática. Estilos está al final del formulario; selecciona uno y pulsa Guardar configuración.
- Desde una página HTTP/HTTPS, el menú contextual o el icono de la extensión abre un acceso pendiente. Revisa la captura y selecciona la categoría antes de guardar.
- Al agregar un enlace con clic derecho no se captura la página de origen: no representa necesariamente el enlace guardado.
- Sin categorías se ofrece crear “General” junto con el acceso, solamente al guardar.

## Guardado y privacidad

Los enlaces y miniaturas quedan en chrome.storage.local. El guardado conserva una versión anterior y detecta cambios simultáneos entre paneles nuevos. Ante un conflicto, el formulario permanece abierto: copia lo necesario, cancela y vuelve a editar. ⚙ → Restaurar versión anterior permite recuperar el último estado previo.

Cambiar de Workspace no reescribe toda la biblioteca; la selección se recuerda durante esa pestaña.

Las capturas pendientes usan almacenamiento de sesión, con un máximo de ocho borradores. Se descartan al guardar/cancelar; los vencidos se limpian en la siguiente alta o consulta del borrador. Caducan lógicamente a los 30 minutos y se pierden al recargar la extensión o terminar la sesión de Chrome.

Las imágenes HTTPS se solicitan a sus servidores, sin enviar Referer; esos servidores pueden conocer tu IP y la URL solicitada. Para mayor privacidad y uso sin conexión, pega una imagen local. El código no añade analítica ni envía tus enlaces a un backend.

## Respaldo ZIP

⚙ → **Descargar ZIP** incluye los Workspaces, categorías, enlaces, tags, reglas, estilos y las imágenes incorporadas en base64 (también el fondo). Las imágenes repetidas se guardan una sola vez. Las imágenes remotas conservan su URL: no se descargan ni se convierten en copias offline.

**Importar ZIP** acepta el formato sin compresión generado por NEX.B, incluidos respaldos anteriores compatibles. Comprueba directorio, tamaños, CRC y esquema antes de pedir confirmación para reemplazar los datos. No es un importador de cualquier ZIP.

Límites: ZIP de 64 MiB, imagen local de 8 MiB, biblioteca de 2000 accesos, 500 categorías y 100 Workspaces. El validador limita además el texto JSON serializado a 80 Mi caracteres. Al pegar, se reduce el lado mayor a 1280 px y se convierte a WebP; los GIF pierden animación.

El ZIP **no está cifrado ni firmado**. Puede contener documentos privados, capturas y URLs con tokens. Guárdalo como información sensible. La comprobación CRC detecta corrupción, no garantiza que el autor sea confiable.

Desinstalar borra el almacenamiento local de la extensión. Para reinstalar y recuperar datos necesitas un respaldo externo. NEX.B no puede escribir una copia permanente en cualquier carpeta sin una acción/permisos adicionales del usuario.

## Permisos de Chrome

| Permiso | Uso |
| --- | --- |
| `tabs` | Consultar URLs para detectar y reutilizar pestañas abiertas. |
| `storage` | Guardar biblioteca y configuración localmente. |
| `contextMenus` | Agregar sitios y actualizar capturas desde los menús de Chrome. |
| `activeTab` | Capturar la pestaña tras una acción del usuario. |
| `unlimitedStorage` | Almacenar miniaturas sin la cuota estándar de la extensión. |
| `nativeMessaging` | Comunicación opcional con el asistente macOS incluido para abrir rutas `file://` locales tras un clic. |
| `bookmarks` — opcional | Leer favoritos al solicitar una importación; el código no modifica los favoritos. |

No declara permisos generales para todos los sitios ni inyecta scripts en las páginas. No publiques respaldos personales, credenciales ni capturas privadas en este repositorio.

## Estructura del proyecto

- src/app.js: interfaz, formularios y actualizaciones de indicadores.
- src/model.js: esquema, límites, estilos y coincidencia de URLs.
- src/storage.js: guardado coordinado y control de revisiones.
- src/tabs.js: consulta actual y apertura/enfoque serializados.
- src/images.js: reducción de imágenes y liberación de bitmap.
- src/backup.js: ZIP local, integridad e importación.
- src/background.js: eventos MV3, menús y borradores temporales.
- tests/: pruebas automáticas sin acceso a datos del navegador.
- docs/AUDITORIA.md: hallazgos, decisiones y verificación pendiente.

## Verificar

Con Node.js 20 o posterior ejecuta `npm test` en esta carpeta. Son pruebas de lógica, APIs simuladas y estructura; no equivalen a una prueba visual de Chrome.

**Versión 1.6.0: pruebas automáticas de lógica, respaldo, sincronización, permisos y estructura aprobadas.**

Antes de usar esta versión como definitiva, completa la lista de pruebas manuales del informe. En el entorno de auditoría no fue posible arrancar el navegador de pruebas; no se modificó ni reinstaló la extensión del perfil personal.

---

**By.kilex**
