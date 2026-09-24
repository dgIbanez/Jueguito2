# Runas Rotas — versión 1

Aventura original pixel art para GitHub Pages. Canvas 2D y JavaScript sin dependencias ni compilación. Abrí index.html para jugar.

Seis salas conectadas horizontal y verticalmente, espada, goblins, hobgoblins, botas con dash, grimorio y una página que requiere resolver un cifrado César con herramientas integradas. Ascua quema zarzas y abre el claro del Rey Goblin, con tres ataques anticipados y una segunda fase más rápida. Santuarios, mapa, guardado local, sonido opcional y controles exclusivamente de teclado.

## Controles

- A / D o flechas: movimiento.
- Espacio / W / arriba: salto.
- J: espada. Acertar recupera magia.
- Shift: impulso, tras encontrar las botas.
- K: Ascua, tras investigar la página.
- E: interactuar y descansar en santuarios.
- Tab: grimorio y mapa. Escape: pausa. F: pantalla completa (F11 como alternativa del navegador).

Los descubrimientos se guardan automáticamente; los santuarios fijan el punto de regreso y curan. Continuar restaura salud y enemigos normales, conservando mejoras y victoria del jefe. El guardado pertenece al navegador y al origen. Con almacenamiento bloqueado se puede jugar sin persistencia.

## Publicación

En GitHub: Settings → Pages → Source → GitHub Actions. El workflow .github/workflows/pages.yml publica cada push a main. Dirección prevista: https://dgIbanez.github.io/Jueguito2/ . Si Pages no estaba habilitado, elegir esa opción y volver a ejecutar el workflow.

Los gráficos se dibujan en el juego; no requieren sprites externos. Las fuentes web tienen alternativas locales. Esta V1 es un prototipo jugable del primer capítulo. Los siguientes niveles, más movilidad y los cifrados base64 y hexadecimal quedan para futuras versiones.

## Verificación

Abrir tests/smoke.html desde un servidor estático local para ejecutar pruebas sobre colisiones, salto, combate, mejoras, investigación obligatoria, jefe, guardado, muerte y conexiones verticales. Las pruebas reemplazan el guardado del origen utilizado: usar un perfil de pruebas.

## Presentación V1.1

El juego ocupa toda la ventana manteniendo la proporción 16:9, con bandas cuando la pantalla tiene otra proporción. La portada y el menú de pausa contienen ayuda, sonido y pantalla completa. Los menús se recorren con flechas o Tab y se confirman con Enter. Se retiraron los controles táctiles y el contenido exterior al juego.
