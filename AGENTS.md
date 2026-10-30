# Reglas de flujo de trabajo tras completar cambios

`main` está protegida: no se hace push directo. Cada cambio entra por una rama corta y un pull request.
El sitio se publica solo (GitHub Pages) al fusionar en `main`; las versiones se marcan con tags `v*`.

Siempre que se terminen de implementar cambios en el proyecto, seguir rigurosamente este ciclo completo:

1. **Rama**:
   - Trabajar en una rama corta creada desde `main` actualizada: `git switch -c <tipo>/<descripcion>` (`feat/`, `fix/`, `ci/`, `docs/`...).
2. **Preformateo**:
   - Ejecutar el formateador y linter con arreglos seguros: `devenv shell -- fix` (Biome: `biome check --write .`).
   - Comprobar que queda limpio: `devenv shell -- lint`.
3. **Generar tests**:
   - Ejecutar lint, tipos y la suite con la compuerta de cobertura (100 % de líneas): `devenv test`.
   - Si cambia el analizador de Nix (`src/lib/nix/`): `devenv shell -- corpus` (necesita Nix): todos los `.nix` de nixpkgs y Home Manager son válidos y deben parsearse sin problemas; la CI también lo ejecuta.
  - Si cambia el analizador de Nix (`src/lib/nix/`): `devenv shell -- differential` (necesita Nix): nuestro analizador y `nix-instantiate --parse` deben coincidir sobre copias dañadas de esos archivos; la CI también lo ejecuta.
  - Si cambia el validador o el catálogo: `devenv shell -- oracle` (necesita Nix): módulos reales de NixOS, Home Manager y disko (escritos y generados desde el catálogo) evaluados con Nix y con nuestro validador deben coincidir en opciones desconocidas y tipos erróneos (salvo lo documentado en `tools/oracle/run.ts`); la CI también lo ejecuta.
  - Si cambia el generador de catálogos o su overlay: `devenv shell -- catalog` (necesita Nix) y revisar la diferencia en `public/catalog/`; la CI comprueba que lo versionado coincide con lo que generan las versiones fijadas.
   - Si cambia la interfaz: `devenv shell -- site-build && devenv shell -- e2e` (necesita Chrome).
   - Si cambia la salida generada **a propósito**, aceptar las instantáneas con `bun test --update-snapshots` y revisar la diferencia.
4. **Commit**:
   - Crear el commit con mensaje convencional (`feat:`, `fix:`, `perf:`, `ci:`, `docs:`, etc.).
   - Si Claude ha colaborado en el cambio, el mensaje termina con la atribución (línea en blanco antes):
     `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
5. **Push y pull request**:
   - Subir la rama: `git push -u origin <rama>`.
   - La descripción del PR termina con `🤖 Generated with [Claude Code](https://claude.com/claude-code)` si Claude ha colaborado.
   - Abrir el PR hacia `main` (`gh pr create`) y esperar a que pasen los checks requeridos (`CI passed`, `CodeQL`, `Secret scan`).
   - Fusionar con *squash* y borrar la rama. Al fusionar, `deploy.yml` publica en GitHub Pages.
6. **Tag versión n+** (solo cuando haya que marcar una versión):
   - Actualizar `main` y obtener la última versión (`git tag -l "v*" --sort=-v:refname | head -n 1`).
   - Crear el tag siguiente `v0.0.<n+1>` y subirlo a origin: `git tag v0.0.<n+1> && git push origin v0.0.<n+1>`. Los tags `v*` no se pueden mover ni borrar.
   - El tag lanza el workflow *Release*, que ejecuta la CI y crea la GitHub Release con el sitio empaquetado y notas automáticas.
   - Para probar el empaquetado sin publicar, lanzar a mano el workflow *Release* (Run workflow) sobre `main`.

## Convenciones del proyecto

- **Todo pasa por devenv**: la CI ejecuta los mismos scripts que en local (`devenv shell -- <script>`). Scripts: `dev`, `check` (tsc), `lint`, `fix`, `unit`, `e2e`, `site-build`, `start`, `catalog`, `corpus`, `differential`, `oracle`, `evaluate`, `secrets`, `sonar`. Se definen en `devenv.nix`.
- **Bun para todo** (instalar, ejecutar, tests); no usar `npm`.
- **Idiomas**: la interfaz y lo que se genera existen en español (texto fuente, `src/lib/i18n/es.ts`) e inglés (`src/lib/i18n/en.ts`). Cada texto nuevo lleva su traducción; el compilador y un test fallan si falta. La documentación del repositorio (`README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CREDITS.md`) **y los comentarios del código** están en inglés americano; este archivo está en español.
- **Salida de herramientas en inglés**: lo que imprimen los scripts, `devenv test`, la CI y los títulos de los tests (`describe`/`test`) va en inglés, igual que los mensajes de `devenv.nix`.
- **Archivos cortos**, con una sola responsabilidad: ninguno supera 250 líneas (`src`, `tools` y `e2e`; `lint` lo comprueba con `tools/lint/max-lines.ts`). Si un archivo crece, se parte por responsabilidad, no se sube el límite. Sin duplicar datos entre catálogos.
- **Cobertura**: 100 % de líneas en `src/lib` (la compuerta está en `bunfig.toml`). Un test nuevo por cada rama nueva.
- **Proyecto no oficial y hecho con ayuda de IA**: mantener esos avisos (pie de la web, `README.md`, `CREDITS.md`). Licencia GPL v3.0 o posterior.
- **Secretos**: nunca en el repositorio. Las credenciales locales van en `.env` (ignorado) y en CI como secretos o variables del repositorio. `sonar-project.properties` está ignorado: la configuración de Sonar vive en `devenv.nix`.
- **Despliegue**: producción en GitHub Pages (`deploy.yml`, al fusionar en `main`) con el dominio `nixchecker.sincorchetes.tech` (`public/CNAME`). `astro.config.mjs` lee `SITE` y `BASE` (por defecto, el dominio y `/`; las variables del repositorio `PAGES_SITE` y `PAGES_BASE` los cambian). Las rutas deben usar la base (`withBase(import.meta.env.BASE_URL, ...)`), nunca `/` a pelo. Pages no deja configurar cabeceras: la política de contenido va en una `<meta>` de `Base.astro`.
- **Stack**: Astro + Bun + TypeScript (TypeScript 6: `astro check` aún no admite la 7). La validación corre en el navegador (`src/lib/validate.ts`); los catálogos (`public/catalog/<destino>[-<versión>]/`, uno por versión de NixOS y de Home Manager —`src/lib/catalog/versions.ts`—, cada uno con un índice y trozos por rama que se descargan bajo demanda) se generan con `devenv shell -- catalog` (`tools/catalog/`, versiones fijadas en su `flake.lock`); la parte de disko anidada y los renombrados que no se pueden leer de los fuentes están en `tools/catalog/overlay.ts`.
