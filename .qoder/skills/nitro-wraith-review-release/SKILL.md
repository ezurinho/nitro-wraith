---
name: nitro-wraith-review-release
description: Auditoría y entrega segura de Nitro Wraith. Usar para revisión técnica, calificación, roadmap hacia 10/10, Pull Requests, CI, release, sincronización del Gist y verificación del userscript publicado.
---

# Nitro Wraith Review & Release

## Cuándo usar esta skill

Actívala cuando el usuario pida revisar el repositorio, calificarlo, priorizar mejoras, crear un PR, fusionar una rama, publicar una versión o comprobar que GitHub Release y el Gist estén sincronizados.

## Fuente de verdad

- Ejecuta `git fetch origin main` y revisa `origin/main`.
- Lee `package.json`, `src/README.md`, `.github/workflows/check.yml` y `.github/workflows/release.yml`.
- No inventes comandos ni resultados; adjunta evidencia `file:line`.
- Distingue hallazgos actuales, deuda preexistente y regresiones recientes.

## Auditoría técnica

Revisa estas categorías:

1. Arquitectura del bundle y del harness.
2. Correctness del pacing, resultados y límites.
3. Concurrencia, Web Locks, leases y múltiples pestañas.
4. Persistencia, sesión, stop-state y aislamiento por cuenta.
5. Seguridad, privacidad y supply chain de actualizaciones.
6. Rendimiento, DOM, timers y memoria.
7. Accesibilidad y responsive.
8. Pruebas, CI, release y compatibilidad real.

Reverifica estos riesgos conocidos antes de darlos por vigentes:

- Lease cross-tab no atómico o fail-open en `src/96-guard.js`.
- Metadata que promete 120 WPM cuando el techo es dinámico.
- Gist estable mutable como canal de actualización sin integridad verificable.
- Harness basado en fixtures sin canary de contrato contra producción.

## Calificación

Usa esta ponderación salvo que el usuario pida otra:

- Correctness y concurrencia: 25%
- Seguridad y supply chain: 20%
- Pruebas y CI: 20%
- UI/UX y accesibilidad: 15%
- Arquitectura y rendimiento: 10%
- Release y mantenimiento: 10%

Entrega:

- Nota global y por categoría.
- Hallazgos `Critical`, `Important`, `Minor` con evidencia y efecto real.
- Quick wins, trabajo estructural y deuda que requiere caracterización.
- Criterios verificables para 10/10.

## Flujo de Pull Request

1. Comprueba `git status`, la rama y el upstream.
2. Ejecuta `npm run check`; ejecuta `npm run visual` si cambió la UI.
3. Crea un commit convencional con fuente, bundle, pruebas y baselines.
4. Haz push de una rama específica; nunca directo a `main`.
5. Crea el PR con `gh pr create --base main --head <rama>`.
6. Espera `gh pr checks <n> --watch` y confirma `MERGEABLE`/`CLEAN`.
7. Fusiona solo con autorización explícita del usuario. Prefiere squash y no borres la rama sin permiso.

## Flujo posterior al merge

1. Verifica el estado `MERGED` y el commit en `origin/main`.
2. Observa los workflows `check` y `windows`.
3. Observa el workflow `release` cuando el userscript cambió.
4. Comprueba:
   - bump de versión y commit de release;
   - tag y GitHub Release públicos;
   - assets `.user.js` y `.meta.js`;
   - versión del Gist igual a la release;
   - `git status` limpio.
5. Si `gh release view latest` falla justo después de publicar, revisa `gh release list` y la API antes de declarar un fallo.

## Seguridad operativa

- No uses `--no-verify`, force push ni edites `main` sin autorización.
- No expongas tokens, emails privados ni secretos en logs o commits.
- No edites el Gist manualmente si el workflow de release puede hacerlo.
- No fusiones ni publiques si los checks fallan.
- Ante un 403 de permiso, no cambies scopes ni configuración sin consentimiento; usa la sesión autorizada o pide al usuario completar la verificación.
