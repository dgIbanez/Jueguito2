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

Los descubrimientos se guardan automáticamente; los santuarios fijan el punto de regreso y curan. Continuar restaura salud y conserva las bajas de enemigos, las mejoras y la victoria del jefe. Los enemigos comunes reaparecen al descansar en un santuario o al regresar al checkpoint tras morir. El guardado pertenece al navegador y al origen. Con almacenamiento bloqueado se puede jugar sin persistencia.

## Publicación

En GitHub: Settings → Pages → Source → GitHub Actions. El workflow .github/workflows/pages.yml publica cada push a main. Dirección prevista: https://dgIbanez.github.io/Jueguito2/ . Si Pages no estaba habilitado, elegir esa opción y volver a ejecutar el workflow.

Los gráficos se dibujan en el juego; no requieren sprites externos. Las fuentes web tienen alternativas locales. Esta V1 es un prototipo jugable del primer capítulo. Los siguientes niveles, más movilidad y los cifrados base64 y hexadecimal quedan para futuras versiones.

## Verificación

Abrir tests/smoke.html desde un servidor estático local para ejecutar pruebas sobre colisiones, salto, combate, mejoras, investigación obligatoria, jefe, guardado, muerte y conexiones verticales. Las pruebas reemplazan el guardado del origen utilizado: usar un perfil de pruebas.

## Presentación V1.1

El juego ocupa toda la ventana manteniendo la proporción 16:9, con bandas cuando la pantalla tiene otra proporción. La portada y el menú de pausa contienen ayuda, sonido y pantalla completa. Los menús se recorren con flechas o Tab y se confirman con Enter. Se retiraron los controles táctiles y el contenido exterior al juego.

## Combate y exploración V1.2

El diario muestra únicamente salas visitadas y hallazgos obtenidos. Una página sin investigar no revela su hechizo. Las bajas normales se conservan entre salas y al recargar; descansar en un santuario o volver tras morir reinicia los enemigos comunes. El jefe derrotado no reaparece.

Las muertes producen sangre, manchas por sala y una breve animación de caída. Las manchas duran hasta reiniciar los encuentros o recargar la partida. Las animaciones siguen dibujadas mediante Canvas, sin hojas de sprites: balanceo corporal, pasos, bufanda, postura de impulso y movimiento de armas durante preparación, ataque y recuperación. Las poses visuales no alteran las colisiones.

## Arqueros e investigación V1.3

Goblins arqueros en el sendero, las copas y el campamento. Anticipan el disparo tensando el arco y fijando la dirección antes de soltar la flecha; después quedan en recuperación. El suelo sólido detiene los proyectiles; las plataformas flotantes dejan pasar las flechas. El dash protege del impacto. Sus bajas siguen las mismas reglas de checkpoint que el resto de enemigos.

La página incorpora una firma cifrada y un comentario del personaje sobre Iulin Saerh, escriba de la Torre Gris. El texto y la firma se traducen juntos con la rueda; ni la pista ni los intentos fallidos revelan el desplazamiento correcto.

## Gestos y refuerzos V1.4

Se eliminaron exclamaciones y nombres flotantes de ataques. El jefe anticipa el tajo levantando el arma y girando el cuerpo, el salto agachándose y la embestida inclinándose hacia delante. Las animaciones de los enemigos comunes se conservan.

Al alcanzar el 50 % de salud, el jefe completa su aterrizaje si estaba en el aire y levanta el arma para llamar refuerzos: dos hobgoblins y dos arqueros, una sola vez por intento. Los refuerzos tienen una breve pausa inicial antes de atacar. Al derrotar al jefe se retiran los refuerzos y sus proyectiles; al reintentar se reinicia la invocación.

## Presión de combate V1.5

Las flechas atraviesan todas las plataformas flotantes, incluidas las del jefe, pero chocan con el suelo sólido. Goblins y hobgoblins detectan al jugador a 620 píxeles, frente a los 330 anteriores. La persecución sube de 70 a 205 píxeles/segundo para goblins y de 48 a 155 para hobgoblins (el jugador corre a 190).

La preparación del ataque baja a 0,32 / 0,48 segundos y la recuperación a 0,42 / 0,70 segundos, respectivamente. Ambos avanzan durante el golpe, manteniendo la dirección que eligieron al prepararlo: esquivar sigue siendo posible, pero alejarse caminando ya no basta contra los goblins.

## Persecución ajustada V1.6

Goblins a 180 px/s y hobgoblins a 165 px/s, por debajo de los 190 del jugador; el avance al golpear usa esas mismas velocidades. Conservan el alcance de detección y las pausas de ataque de V1.5. Antes de moverse comprueban que haya suelo delante: se detienen en los bordes de plataformas y pozos, incluso durante el ataque, y retoman la persecución cuando el jugador vuelve al lado seguro.
