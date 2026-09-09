# Asistente local de nex.b para macOS

Este asistente permite que nex.b abra accesos `file://` locales **solo después de un clic del usuario**:

- una carpeta se abre en Finder;
- un archivo aparece seleccionado en Finder;
- un archivo `.html` o `.htm` se abre en Google Chrome.

## Instalar

1. Descarga el proyecto desde <https://github.com/Kilexmommm/Nex-b-Chrome-extension> con **Code → Download ZIP**, descomprímelo y carga esa misma carpeta en `chrome://extensions`.
2. En `chrome://extensions`, activa **Modo de desarrollador** y copia el ID de `nex.b`.
3. Abre Terminal y ejecuta, sustituyendo la ruta y el ID:

```sh
cd "/ruta/Nex-b-Chrome-extension/native-host"
./install-macos.sh ID_DE_NEX_B
```

4. Recarga nex.b en `chrome://extensions`.

No ejecutes este instalador desde una copia no confiable. El script instala un manifiesto local para un único ID de extensión; no descarga software ni envía tus rutas a Internet.
