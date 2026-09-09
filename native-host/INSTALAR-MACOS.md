# Instalar nex.b y abrir archivos locales en macOS

**Desde nex.b 1.7.3 no necesitas instalar el asistente macOS.** No hace falta Python, Terminal, ejecutar `install-macos.sh` ni copiar el ID de la extensión. Esta página se conserva en su dirección original para que las guías antiguas lleven a las instrucciones actuales.

## 1. Instalar la extensión

1. Abre [el repositorio de nex.b](https://github.com/Kilexmommm/Nex-b-Chrome-extension), pulsa **Code → Download ZIP** y descomprime el archivo.
2. Guarda la carpeta completa en una ubicación permanente.
3. En Google Chrome, escribe `chrome://extensions` en la barra de direcciones y activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** y selecciona la carpeta principal que contiene `manifest.json`, no la subcarpeta `native-host`.
5. Abre una pestaña nueva de Chrome o pulsa el icono de nex.b. La extensión ya permite guardar y abrir enlaces web.

Conserva la carpeta en esa ubicación. No abras `newtab.html` desde Finder para usar nex.b: como archivo local no dispone de las funciones de la extensión.

## 2. Activar archivos locales (opcional)

**No hay ninguna instalación adicional.** Solo necesitas activar esta opción si quieres abrir archivos o carpetas de tu equipo:

1. En **⚙ Configurar nex.b**, pulsa **Configurar archivos locales**. También puedes ir a `chrome://extensions` → nex.b → **Detalles**.
2. Activa **Permitir acceso a URLs de archivo** (**Allow access to file URLs** si Chrome está en inglés).
3. Abre una pestaña nueva de nex.b para continuar. Este permiso se activa manualmente para tu instalación de la extensión.

Los accesos web funcionan aunque dejes esta opción desactivada.

## 3. Crear el acceso

Crea o edita un acceso, pega su URL local en el campo **URL**, guarda y pulsa la tarjeta.

| Tipo | Ejemplo | Resultado |
| --- | --- | --- |
| HTML | `file:///Users/tu-usuario/Documents/pagina.html` | Se abre como página en el navegador. |
| Carpeta | `file:///Users/tu-usuario/Documents/mi-carpeta/` | Muestra el listado de archivos en el navegador. |
| Otro archivo | `file:///Users/tu-usuario/Documents/documento.pdf` | Se muestra o descarga según lo que soporte Chrome. |

Reemplaza `tu-usuario` y el resto de la ruta por la ubicación real en tu Mac. Para convertir `/Users/tu-usuario/Documents/pagina.html` en URL, antepón `file://`: el resultado empieza por `file:///Users/`. Puedes copiar la URL de la barra de direcciones si el archivo ya está abierto en Chrome.

Para carpetas, añade `/` al final. Mantén `file:///`; no uses `finder://`. Si ya tienes esa misma ruta abierta, nex.b enfoca su pestaña.

## Actualizar una instalación anterior

1. Guarda un respaldo de tu configuración desde nex.b antes de actualizar.
2. Reemplaza el código dentro de la misma carpeta que Chrome tiene cargada; conserva la instalación existente.
3. Pulsa **Recargar** en `chrome://extensions` y comprueba que la versión sea **1.7.3 o posterior**.
4. Activa el acceso a URLs de archivo si lo necesitas, cierra los paneles antiguos y abre una pestaña nueva de nex.b.

No hace falta reinstalar el asistente si ya lo tenías. Esta versión no lo utiliza. Los archivos del antiguo asistente se conservan en el repositorio como referencia para versiones anteriores.

## Resolver problemas

- **«Specified native messaging host not found» o «Native host has exited»:** una versión o pestaña anterior sigue usando el asistente. Actualiza, recarga y abre un panel nuevo siguiendo los pasos anteriores.
- **Falta permiso de archivos:** revisa **Detalles → Permitir acceso a URLs de archivo**.
- **Archivo no encontrado o acceso denegado:** comprueba la ruta y los permisos de Chrome en macOS. Pega la misma URL en la barra de direcciones de Chrome para comprobar si abre directamente.
- **Archivo o carpeta movidos:** actualiza la URL del acceso.

Si instalas nex.b en otro equipo o perfil de Chrome, comprueba el permiso de archivos otra vez. Un respaldo de nex.b guarda las rutas, no copia sus archivos: deben existir en ese equipo y quizá necesites corregir las URLs. Las restricciones normales de las páginas locales y los permisos de macOS siguen aplicando.

Consulta también la [guía general de instalación y actualización](../README.md).
