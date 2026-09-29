# Runas Rotas

Metroidvania de salas y jefes con un grimorio de páginas cifradas. Solo teclado. Se publica como sitio estático en GitHub Pages.

Fuiste invocado desde nuestro mundo por Iulin Saerh, el escriba de la Torre Gris. El ritual para volver está repartido en las páginas arrancadas de su grimorio, y cada jefe guarda un sello del círculo. Empezás con movimiento básico, ganás mejoras (impulso, garras para saltar en paredes, doble salto) y aprendés magia descifrando páginas.

- **Capítulo I · El bosque olvidado:** Groth, el Rey Goblin.
- **Capítulo II · Las Cavernas del Eco:** bajo el trono de Groth. Vharn, el Centinela de Cuarzo.

## Magia

- Cada página descifrada enseña una magia. Cifrados: César, runas (con murales), Atbash y Vigenère (la clave está grabada en el mundo).
- **Ranuras:** solo se lanzan las magias equipadas. Empezás con 2 y cada sello de jefe suma una. Se cambian descansando en un santuario.
- **Niveles:** los enemigos sueltan esquirlas de maná (✦). En el santuario se gastan para subir cada magia hasta nivel 3.
- **Fusiones:** dos magias en nivel 2 se funden en una nueva: Ascua + Céfiro = Torbellino ígneo, Ascua + Égida = Égida ígnea, Céfiro + Escarcha = Ventisca.

## Controles (reasignables en Pausa → Reasignar teclas)

| Acción | Teclas |
|---|---|
| Moverse | A / D o ← / → |
| Saltar (mantener para más altura) | Espacio, W o ↑ |
| Espada · golpe descendente en el aire | J · S/↓ + J |
| Bajar de una plataforma | S/↓ + saltar |
| Impulso | Shift |
| Magias equipadas (ranuras 1–4) | K · L · I · O |
| Interactuar / descansar | E |
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
  story.json            prólogo
  enemies.json          estadísticas de cada enemigo (y esquirlas que sueltan)
  bosses.json           jefes: vida, patrón de ataques, refuerzos, sello, texto de victoria
  abilities.json        mejoras de movimiento
  items.json            mapa, grimorio y sellos (cada sello suma una ranura)
  spells.json           magias: niveles, costos de mejora y fusiones
  pages.json            páginas cifradas (texto cifrado + hash de la solución)
  clues.json            murales rúnicos e inscripciones con claves
  scripts.json          alfabetos rúnicos
src/
  core/                 entrada, sonido, guardado versionado, preferencias
  world/                lectura de LDtk, colisiones por casillas, validador
  entities/             personaje, enemigos (a pie, arqueros, voladores), jefes
  magic/                cifrados, ranuras/niveles/fusiones, efectos de cada magia
  game/                 simulación (sin DOM: se prueba con Vitest)
  render/               dibujo en Canvas: fondos, casillas, sprites, objetos
  ui/                   menús, grimorio, descifrado, santuario, mapa, HUD
scripts/
  validate-world.ts     revisa referencias, aberturas y progresión
  encode-page.ts        cifra una página nueva y calcula su hash
  seed-world.mjs        generador del mundo (ver abajo)
tests/unit/             Vitest: física, cifrados, magias, guardado, combate, recorridos
tests/e2e/              Playwright: menús, teclado, grimorio, santuario, capturas
```

La simulación (`src/game`) no toca el DOM: emite eventos (`toast`, `openPage`, `shrine`, `victory`…) y la interfaz los escucha. Por eso casi todo se prueba sin navegador.

## Cómo agregar contenido

**Una sala.** Hasta ahora el mundo se genera con `npm run seed-world -- --force`, que sobrescribe `data/world.ldtk`. Si empezás a editar el mundo con [LDtk](https://ldtk.io), ese archivo pasa a ser la fuente de verdad y el generador no se vuelve a usar. La capa `Collision` tiene `solid` (pared), `oneway` (plataforma que se atraviesa desde abajo) y `spikes` (púas). Las salas se conectan solas por su posición: una abertura en el borde lleva a la sala vecina. Cada sala tiene `name`, `biome` (`forest`, `canopy`, `ruins`, `boss`, `caves`) y `requires`.

**Entidades** (capa `Entities`): `PlayerStart`, `Shrine`, `Item` (`item`), `Ability` (`ability`), `Page` (`page`), `Clue` (`clue`), `Enemy` (`kind`), `Boss` (`boss`, `trigger`) y `Gate` (`gateId`, `opensWith`, `style`: `thorns`, `stone` o `crystal`; redimensionable).

**Requisitos.** `requires`, `opensWith` y `trigger` usan fichas `tipo:id`: `ability:dash`, `spell:ascua`, `item:grimoire`, `gate:thorns_throne`, `boss:groth`. Una compuerta con `spell:x` se abre al golpearla con esa magia (o con una fusión que la contenga); con cualquier otra ficha se abre sola al conseguirla. El validador simula la progresión y avisa si algo queda inalcanzable.

**Una página del grimorio.**

```sh
npm run encode-page -- page_nueva caesar "EL TEXTO SECRETO" 5
npm run encode-page -- page_nueva atbash "EL TEXTO SECRETO"
npm run encode-page -- page_nueva vigenere "EL TEXTO SECRETO" CLAVE
npm run encode-page -- page_nueva runes "EL TEXTO SECRETO" iulin
```

Copiá `cipher`, `ciphertext` y `solutionHash` a `data/pages.json`. El texto original no se guarda: el juego compara el hash de la traducción. En las páginas rúnicas, `maxUnknown` fija cuántos signos debe deducir el jugador; en las Vigenère, `keyClue` apunta a la inscripción con la clave.

**Una magia.** En `spells.json`: `effect` (`fire`, `frost`, `vortex`, `shield`, `gust`), `cost`, un objeto por nivel en `levels` (daño, velocidad, duración, alcance, congelamiento…) y `upgrade` con el costo de cada mejora. Una fusión lleva `fusion: [a, b]` y `fuseCost`, y no la enseña ninguna página. Un efecto nuevo se programa en `src/magic/effects.ts`.

**Un enemigo o un jefe.** Los valores van en `enemies.json` o `bosses.json`. Los comportamientos (`melee`, `archer`, `flyer`) y los movimientos de jefe (`slash`, `leap`, `charge`, `rain`) están en `src/entities/`; uno nuevo se agrega ahí y se referencia desde los datos.

Después de cualquier cambio, `npm run check` confirma que todo sigue siendo alcanzable.

## Guardado

El guardado vive en el `localStorage` del navegador (clave `runas-rotas-save`) e incluye un número de versión. Las partidas anteriores se migran solas: conservan sus magias equipadas y reciben el sello de los jefes ya vencidos. Con almacenamiento bloqueado se puede jugar sin guardar.

## Publicación

En GitHub: Settings → Pages → Source → GitHub Actions. El workflow `.github/workflows/pages.yml` verifica tipos, datos, pruebas unitarias y de navegador en cada push o PR, y publica `dist/` solo desde `main`. Dirección: https://dgibanez.github.io/Jueguito2/
