# Contribuir

Guía técnica para cambios en nex.b. No describe procesos legales ni de publicación.

## Requisitos

- Node.js 20 o posterior (`engines` en `package.json`).
- Google Chrome 123 o posterior solo para cargar la extensión de forma manual.

No hay paso de compilación ni dependencias externas: `package.json` no declara `dependencies` ni `devDependencies`, y la extensión se carga descomprimida.

## Ejecutar las pruebas

```sh
npm test
```

El script ejecuta `node --test tests/*.test.js`. Son pruebas de lógica, APIs simuladas y estructura; no equivalen a una prueba visual en Chrome.

## Estructura

La estructura del proyecto está descrita en la sección **Estructura del proyecto** de `README.md`. Las pruebas están en `tests/` y no acceden a datos reales del navegador.

## Alcance de los cambios

- Mantén la extensión sin compilación: archivos JS/CSS/HTML y `manifest.json` cargables directamente.
- Añade o ajusta pruebas en `tests/` cuando cambie la lógica cubierta por `npm test`.
- La verificación manual en Chrome no está automatizada en este repositorio.
