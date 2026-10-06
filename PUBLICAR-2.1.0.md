# Publicar nex.b 2.1.0

GitHub bloqueó las escrituras desde esta sesión porque requieren aprobación y la política es `never`. No se ha publicado ni fusionado en GitHub.

Bundle local: `nex-b-2.1.0.bundle`. Commit de versión: `bfa6dc9953af70ed7216bd66b6ea9be17d08c22b`. Merge local: `de9c4a3a0298fc335996446726638a62cf0c52f7`. Base: `0fcf5b9cb2cc77df69b45f41d594e6f78cab5307`.

Desde una terminal con acceso de escritura al repositorio original:

```sh
cd '/Users/botkdk/Documents/Codex/2026-09-07/referenced-chatgpt-conversation-this-is-an/workspace-launcher-mvp'
git fetch '/Users/botkdk/orca/workspaces/workspace-launcher-mvp/product-manager/nex-b-2.1.0.bundle' main
git switch main
git merge --ff-only FETCH_HEAD
git push origin main
gh release create v2.1.0 '/Users/botkdk/orca/workspaces/workspace-launcher-mvp/product-manager/nex-b-2.1.0.zip' --repo Kilexmommm/Nex-b-Chrome-extension --target de9c4a3a0298fc335996446726638a62cf0c52f7 --title 'nex.b 2.1.0' --notes-file '/Users/botkdk/orca/workspaces/workspace-launcher-mvp/product-manager/docs/NOVEDADES-2.1.0.md' --latest
```

Si el push se rechaza porque main avanzó, integra primero los cambios remotos y vuelve a comprobar la versión antes de publicar. No uses force-push.
