# Video tour de nex.b 2.2.1 (Remotion)

Dos MP4 de 42,2 s, 1920×1080, 30 fps: `out/nexb-tour-en.mp4` (textos EN) y `out/nexb-tour-es.mp4` (textos ES).

## Re-renderizar
```bash
cd landing/video
npm install
npm run render      # ambos; o render:en / render:es
npm run studio      # vista previa
```
Textos, tiempos y encuadres: `src/Tour.tsx` (lista `SCENES`). Capturas en `public/` (copia de `landing/img/`).
`node_modules/` y `out/` están en `landing/video/.gitignore`; los MP4 existen en disco pero no se versionan.

## Audio
Sin música ni efectos: el MP4 lleva una pista AAC en silencio (Remotion la añade). No se usó audio con derechos dudosos.

## Real vs. placeholder
**Real:** las 9 capturas de `landing/img` (datos de demostración, sin datos personales), el icono, los nombres de funciones y los textos, tomados de README.md, landing/index.html y VIDEO-GUION.md. «Chrome 123+ · Manifest V3 · By.kilex» sale del README.

**Placeholder / limitaciones:**
- Las animaciones son zooms y paneos sobre capturas estáticas; no hay grabación de la extensión en uso.
- «Enfoca la pestaña que ya tienes» usa la captura del Workspace claro; no hay captura de esa acción.
- Sin audio, sin cifras, sin URL ni botón «Añadir a Chrome» (no hay publicación en Chrome Web Store).
- Pendiente: revisión independiente de un subagente (final-review.md) y sincronizar escenas con música si se añade BGM.
