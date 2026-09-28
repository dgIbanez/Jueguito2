# Runas Rotas

Metroidvania de salas y jefes con un grimorio de páginas cifradas. El personaje empieza con movimiento básico, gana mejoras (impulso, garras para saltar en paredes, doble salto) y aprende magia descifrando páginas perdidas. Solo teclado. Se publica como sitio estático en GitHub Pages.

## Controles (reasignables en Pausa → Reasignar teclas)

| Acción | Teclas |
|---|---|
| Moverse | A / D o ← / → |
| Saltar (mantener para más altura) | Espacio, W o ↑ |
| Espada · golpe descendente en el aire | J · S/↓ + J |
| Bajar de una plataforma | S/↓ + saltar |
| Impulso | Shift |
| Hechizos | K · L |
| Interactuar | E |
| Grimorio · Mapa · Pausa · Pantalla completa | Tab · M · Esc · F |

## Desarrollo

Requiere Node 24.

```sh
npm install
npm run dev          # servidor local con recarga en caliente
npm run check        # tipos + validación del mundo + pruebas unitarias
npm run test:e2e     # pruebas en navegador (Playwright); la primera vez: npx playwright install chromium
npm run build        # genera dist/, lo que se publica
```

Con `?debug` en la URL (o en `npm run dev`) queda disponible `window.runas` con el estado del juego para depurar.

## Estructura

```
data/                 contenido: lo que se edita para crear el juego
  world.ldtk            salas, terreno y entidades (editor LDtk)
  enemies.json          estadísticas de cada enemigo
  bosses.json           jefes: vida, patrón de ataques, refuerzos, texto de victoria
  abilities.json        mejoras de movimiento
  items.json            mapa y grimorio
  spells.json           hechizos que enseñan las páginas
  pages.json            páginas cifradas (texto cifrado + hash de la solución)
  clues.json            murales que revelan signos de la escritura rúnica
  scripts.json          alfabetos rúnicos
src/
  core/                 entrada, sonido, guardado versionado, preferencias
  world/                lectura de LDtk, colisiones por casillas, validador
  entities/             personaje, enemigos, jefe
  magic/                motor de cifrados y hash de soluciones
  game/                 simulación (sin DOM: se prueba con Vitest)
  render/               dibujo en Canvas: fondos, casillas, sprites, objetos
  ui/                   menús, grimorio, herramientas de descifrado, mapa, HUD
scripts/
  validate-world.ts     revisa referencias, aberturas y progresión
  encode-page.ts        cifra una página nueva y calcula su hash
  seed-world.mjs        generó el world.ldtk inicial (no volver a usar)
tests/unit/             Vitest: física, cifrados, guardado, combate, recorridos
tests/e2e/              Playwright: menús, teclado, grimorio, mapa, capturas
```

La simulación (`src/game`) no toca el DOM: emite eventos (`toast`, `openPage`, `victory`…) y la interfaz los escucha. Por eso casi todo se prueba sin navegador.

## Cómo agregar contenido

**Una sala.** Abrí `data/world.ldtk` con [LDtk](https://ldtk.io). La capa `Collision` tiene tres valores: `solid` (pared), `oneway` (plataforma que se atraviesa desde abajo) y `spikes` (zarzas que dañan). Las salas se conectan solas por su posición en el mundo: una abertura en el borde lleva a la sala vecina. Cada sala tiene los campos `name`, `biome` (`forest`, `canopy`, `ruins`, `boss`) y `requires`.

**Entidades** (capa `Entities`): `PlayerStart`, `Shrine`, `Item` (`item`), `Ability` (`ability`), `Page` (`page`), `Clue` (`clue`), `Enemy` (`kind`), `Boss` (`boss`, `trigger`) y `Gate` (`gateId`, `opensWith`, redimensionable).

**Requisitos.** Los campos `requires`, `opensWith` y `trigger` usan fichas `tipo:id`: `ability:dash`, `spell:ascua`, `item:grimoire`, `gate:thorns_throne`, `boss:groth`. El validador simula la progresión con esas fichas y avisa si algo queda inalcanzable.

**Una página del grimorio.**

```sh
npm run encode-page -- page_nueva caesar "EL TEXTO SECRETO" 5
npm run encode-page -- page_nueva atbash "EL TEXTO SECRETO"
npm run encode-page -- page_nueva vigenere "EL TEXTO SECRETO" CLAVE
npm run encode-page -- page_nueva runes "EL TEXTO SECRETO" iulin
```

Copiá `cipher`, `ciphertext` y `solutionHash` a `data/pages.json` y agregá el hechizo en `spells.json`. El texto original no se guarda: el juego compara el hash de la traducción del jugador. Para las páginas rúnicas, los murales (`clues.json`) enseñan palabras completas; `maxUnknown` fija cuántos signos puede tener que deducir el jugador.

**Un enemigo o un jefe.** Los valores van en `enemies.json` o `bosses.json`. Los comportamientos (`melee`, `archer`) y los movimientos del jefe (`slash`, `leap`, `charge`) están en `src/entities/`; un comportamiento nuevo se agrega ahí y se referencia desde los datos.

Después de cualquier cambio, `npm run check` confirma que todo sigue siendo alcanzable.

## Guardado

El guardado vive en el `localStorage` del navegador (clave `runas-rotas-save`) e incluye un número de versión. Las partidas de la versión 1 se migran automáticamente. Con almacenamiento bloqueado se puede jugar sin guardar.

## Publicación

En GitHub: Settings → Pages → Source → GitHub Actions. El workflow `.github/workflows/pages.yml` verifica tipos, datos, pruebas unitarias y de navegador en cada push o PR, y publica `dist/` solo desde `main`. Dirección: https://dgibanez.github.io/Jueguito2/
