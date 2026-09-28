# NEX.B 2.0

## Cambios incluidos

- **Sin «Identificador duplicado» al abrir:** la sincronización con Chrome unía los accesos categoría por categoría; un acceso movido de categoría quedaba en la antigua (copia remota) y en la nueva (copia local). Ahora un acceso que la copia remota ya tiene en otra categoría no se vuelve a añadir. Si la copia sincronizada está dañada (por ejemplo, fragmentos de dos equipos mezclados), se reemplaza con la de este equipo y se avisa en Configuración → Sincronizar.
- **Una sola pestaña de nex.b:** al abrir una pestaña nueva de nex.b, las anteriores se cierran solas. No se cierran las que tienen un formulario abierto o un guardado, sincronización, captura o imagen en curso. Abrir el Side Panel no cierra pestañas.
- **Captura masiva robusta:** espera la navegación y el pintado de cada página, respeta el límite de capturas por segundo de Chrome, se puede cancelar y guarda por lotes sin reemplazar miniaturas existentes.
- **Imágenes en Google Drive por hash:** no vuelve a subir una imagen sin cambios, recorre todas las páginas de la carpeta privada, detecta cambios hechos en otro equipo, explica un Client ID de OAuth inválido y ofrece limpiar a mano las imágenes huérfanas.
- **Menos memoria:** la sincronización compara solo los datos sincronizables y la validación mide el tamaño sin serializar todas las miniaturas en cada guardado.
- **Versión en el pie:** el pie muestra `v2.0` junto al enlace de Feedback.

## Verificación

Pruebas automáticas aprobadas con `npm test`.

Pendiente de comprobar manualmente en Chrome: el pie muestra `v2.0`, abrir varias pestañas nuevas deja solo una, mover un acceso de categoría y sincronizar entre dos equipos, captura masiva y sincronización con Drive.

Permisos: igual que 1.9.1.
