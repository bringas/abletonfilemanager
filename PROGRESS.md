# Progreso de ProjectRescue

Última actualización: 1 nov 2026.

## Módulo de optimización — v2, con reorganización (1 nov 2026)

El usuario pidió mejorar la UI/UX de la v1 y adelantar ya la reorganización (antes era "fase 2"): botón destacado **"OPTIMIZAR"** (único color sólido de toda la interfaz) en la barra lateral. Abre un panel con aviso de seguridad arriba ("no se borra ni se modifica nada de tu ordenador"), y dos columnas: a la izquierda los archivos sobrantes (qué son y cuánto ocupan) y qué carpetas se reorganizan o se quedan igual; a la derecha el árbol de carpetas propuesto. Abajo, "Descargar carpeta optimizada…" (en realidad escribe directamente en la carpeta que el usuario elija, no un `.zip` — pero para un principiante "descargar" es la palabra natural, así que así se llama el botón).

Reglas de la reorganización, acordadas con el usuario:
- La unidad que se mueve es siempre una **carpeta de primer nivel** (donde viven uno o varios proyectos). Nunca se toca la estructura de carpetas *dentro* de un proyecto (`Samples/Recorded`, etc.): eso rompería las referencias que Ableton necesita para encontrar sus audios.
- Si algún proyecto de una carpeta de primer nivel referencia (con "..") un archivo de otra carpeta de primer nivel distinta — pasa mucho porque el usuario reutiliza carpetas de sesión entre canciones —, **ambas carpetas se dejan fijas** (se copian donde ya estaban): moverlas por separado dejaría esa referencia rota.
- Las que sí se pueden mover van a: `★ Favoritos` si algún proyecto de dentro es favorito, si no a su primera etiqueta, si no tiene ninguna a "Sin etiqueta".

`src/lib/optimizacion.ts` calcula el plan (función pura, con tests, incluido el caso de dos carpetas que se referencian entre sí). La copia en App.tsx recorre la carpeta raíz y, por cada carpeta de primer nivel, la escribe en el destino que diga el plan. Falta probar en Chrome real.

Pendiente, aparte: hoy toda una carpeta de primer nivel se mueve en bloque aunque tenga varios proyectos con etiquetas distintas (por seguridad, ver regla de arriba); si el usuario quiere reorganización más fina dentro de una carpeta que no comparte nada con otras, habría que revisarlo.

## MVP listo (31 oct 2026)

Confirmado por el usuario tras probar a fondo con su biblioteca real: catalogado, preescucha (individual y mezcla completa), búsqueda, alias/etiquetas/favoritos, reescaneo y el rediseño visual. Pendiente de verdad para más adelante: investigar "Congelación"/Freeze (falta un proyecto de ejemplo) y los samples huérfanos — ambos en [IDEAS.md](../IDEAS.md).

- [x] **T1.** Crear el proyecto (Vite, React, TypeScript, Tailwind), Git, CLAUDE.md, PROGRESS.md e IDEAS.md
- [x] **T2.** Subir a GitHub y publicar la página vacía en Vercel — https://github.com/bringas/abletonfilemanager y https://abletonfilemanager.vercel.app/
- [x] **T3.** Lector: función que recibe los bytes de un `.als` y devuelve versión de Live, BPM y pistas, con tests sobre los cinco fixtures (3 sintéticos + 5 proyectos reales del usuario, 3 de Live 9.7.1 y 2 de Live 11.3.13)
- [x] **T4.** Página mínima: elegir carpeta y listar los `.als` encontrados con su BPM (probado por el usuario en su Chrome real: funciona)
- [x] **T5.** Encontrar la primera grabación de un proyecto y reproducirla con un botón (probado por el usuario en su Chrome real tras el arreglo de rutas con `..`: funciona. El formato viejo de Live 9/10 sigue sin soportarse, es T6)
- [x] **T6.** Extraer clips de audio y rutas en formato Live 11-12 y Live 9-10, con tests
- [x] **T7.** Escaneo de la carpeta completa con barra de progreso, ignorando `Backup` y archivos `._` (probado por el usuario en su Chrome real: funciona)
- [x] **T8.** Guardar el catálogo en IndexedDB con Dexie: al recargar la página, sigue ahí (probado por el usuario, incluido cerrar/reabrir y "Reconectar carpeta": funciona)
- [x] **T9.** Índice de audios, búsqueda por nombre y tamaño, y estados de preescucha (probado por el usuario en su Chrome real: funciona)
- [x] **T10.** Biblioteca: lista con orden por fecha y búsqueda (probado por el usuario en su Chrome real: funciona)
- [x] **T11.** Play con la regla de "qué grabación suena primero" (master/export > grabado > procesado > librería, el más largo de cada grupo), saltando el silencio inicial, con barra de progreso, botón de parar y un solo audio a la vez (probado por el usuario: funciona)
- [x] **T12.** Ficha de proyecto: pistas, clips y estado de cada archivo (probado por el usuario: funciona)
- [x] **T13.** Alias, etiquetas y favoritos en la tabla `userMeta` (probado por el usuario: funciona)
- [x] **T14.** Reconectar carpeta y reescaneo de proyectos nuevos o modificados (probado por el usuario: funciona)
- [x] **T15.** Prueba con tu biblioteca completa; lista de fallos y arreglos. Congelación (probado con la biblioteca completa: sin fallos. Pendiente investigar "Congelación"/Freeze — el usuario no tenía a mano un proyecto con pistas congeladas, queda anotado en IDEAS.md para cuando aparezca uno)

## Pulido antes de publicar (ronda de feedback del usuario)

1. [x] Botón de play por cada clip en la ficha (antes solo se podía oír el clip priorizado) — confirmado por el usuario
2. [x] Arreglado falso positivo "Con audio": la búsqueda de respaldo por nombre (cuando falta la ruta exacta) ahora solo mira dentro de la propia carpeta del proyecto, no toda la carpeta raíz — confirmado por el usuario
3. [x] Detectar master/bounce (export suelto en la carpeta, no referenciado en el `.als`, con palabras clave ampliadas) — confirmado por el usuario
4. [x] Samples repetidos entre proyectos: contador por archivo + interruptor "ignorar grabaciones que se repiten en 3+ proyectos" al elegir qué suena, con el conteo visible en la ficha — confirmado por el usuario
5. [x] **Ruido dentro de una misma pista**: algunas pistas tienen cientos o miles de tomas cortas grabadas. Si una pista tiene más de 5 clips, nos quedamos solo con el más reciente (por fecha del archivo) y el más largo — tanto en la ficha como al elegir qué suena. El umbral (5) es un valor por defecto, se puede ajustar — confirmado por el usuario
6. [x] Ocultar por defecto en la ficha los audios "no encontrados" (con una casilla para mostrarlos si hace falta) — confirmado por el usuario
7. [x] Se descubrió la causa real de los proyectos con "cientos de clips por pista": Ableton guarda las tomas repetidas en "take lanes" (carriles de tomas), que **no suenan por defecto**, solo el carril principal de la pista. El lector de `.als` detecta esto (campo `principal` en cada clip) y, por pista, solo se muestra y se puede reproducir por defecto lo que está en el carril principal. Si una pista no tiene nada ahí (todo quedó en tomas archivadas), esa pista no tiene preview por defecto — no se adivina una "mejor estimación". El resto queda disponible solo tras marcar "Mostrar también las tomas archivadas" — confirmado por el usuario con un proyecto de los pesados (1900+ clips)

## Avanzar y retroceder la reproducción (31 oct 2026)

La barra de progreso del reproductor individual ahora es clicable para saltar a cualquier punto, y hay botones ⏪/⏩ para avanzar o retroceder 5 segundos. Nunca se sale del tramo real del clip (ni antes de su inicio ni después de su fin).

La mezcla completa también lo tiene ahora: como las fuentes de Web Audio no se pueden "mover" una vez arrancadas, saltar para la mezcla reprograma todas las pistas desde el nuevo punto (sin volver a leer ni decodificar los archivos: se quedan ya decodificados en memoria mientras suena la mezcla, ver `reprogramarMezclaDesde` en App.tsx).

## Arreglo: audios que se pisaban en la mezcla completa (31 oct 2026)

El usuario reportó que en "la religiosidad" se oían dos bajos a la vez (y algo parecido en guitarras) donde solo debía sonar uno. Causa: la grabación original no siempre está al mismo tempo que la canción — Ableton la "estira" para que encaje justo en su hueco del arreglo, pero nuestra mezcla reproduce el audio tal cual, sin estirarlo. Si el tramo real del clip (calculado con los marcadores de tempo) dura más que el hueco que le toca en el arreglo, se metía por encima del siguiente clip de la misma pista. Arreglado limitando la duración de cada clip en la mezcla a `durationBeats` (su hueco real en el arreglo), nunca más. El reproductor individual no cambia: ahí sí interesa oír el tramo completo tal cual es.

## Nueva función: mezcla completa del proyecto (31 oct 2026)

A petición del usuario, ahora hay un botón "▶ Mezcla completa" junto a "Reproducir": decodifica el clip principal de cada pista con audio y los reproduce todos a la vez con Web Audio API, cada uno en su posición correcta del arreglo (usando `startBeats` + el tramo real del clip que ya calculábamos para el reproductor normal). Es una maqueta cruda: sin los plugins, volúmenes ni paneo del proyecto real, y sin las pistas MIDI (no hay forma de sintetizarlas desde aquí). Para que sumar varias pistas no sature, el volumen de cada una baja según cuántas pistas sumen (`1/√n`). Confirmado por el usuario (tras el arreglo de solapes de la sección anterior).

## Arreglo importante (2): sonaba el trozo equivocado del archivo (31 oct 2026)

El usuario cambió de idea sobre T11 (ya no quiere saltar el silencio inicial ni cortar a los 15 segundos: quitado `src/lib/silenceSkip.ts`), y de paso reportó que "guitarra 1" seguía sonando mal aunque el archivo encontrado fuera el correcto. Causa: varios clips distintos (de distintas pistas, en distintos momentos de la canción) pueden compartir un mismo archivo de audio largo, cada uno usando solo un trozo. Reproducir siempre desde el segundo 0 del archivo hacía que sonara lo mismo (mal) en varios sitios.

Arreglo: `alsReader.ts` ahora lee, por cada clip, el tramo real dentro del archivo (`HiddenLoopStart`/`HiddenLoopEnd`) y las marcas de tempo del clip (`WarpMarkers`, igual que usa Ableton para "warpear" el audio). `src/lib/warpTiming.ts` convierte esas marcas a segundos reales (interpolando/extrapolando linealmente). El reproductor ahora salta a ese segundo real y para al llegar al final del tramo, en vez de reproducir el archivo entero desde el principio. Si un clip no trae esa información (p. ej. un export suelto detectado en la carpeta), sigue sonando el archivo entero. Confirmado con datos reales del usuario (`la religiosidad.als`, pista "guitarra 1": distintos clips del mismo archivo calculan ahora tramos de inicio distintos). 96 tests en verde.

## Arreglo importante: audio equivocado al reproducir (30 oct 2026)

El usuario reportó que en algunos clips sonaba un instrumento distinto al que se ve en Ableton (ej. sonaba un bajo en una pista de guitarra). Causa encontrada:

1. Cuando varios archivos de la carpeta del proyecto tienen el mismo nombre genérico (pasa porque el usuario reutiliza/copia carpetas de sesión para varias canciones), la búsqueda por nombre se quedaba con el primero que encontraba si no podía confirmar por tamaño.
2. Live a veces guarda `OriginalFileSize Value="0"` en el `.als` (no es un tamaño real), y la app lo trataba como un tamaño válido, así que la comprobación por tamaño no servía de nada en esos casos.

Arreglado en dos sitios: `src/lib/alsReader.ts` (un tamaño 0 se trata como "no lo sabemos", no como un tamaño real) y `src/lib/scanFolder.ts` (`buscarEnIndice`: si hay varios archivos con el mismo nombre y ninguno coincide en tamaño, ya no adivina — dice "no encontrado" en vez de arriesgarse a reproducir el archivo equivocado). Como consecuencia, es normal que ahora veas más clips como "no encontrado" que antes: antes podían estar "encontrados" pero sonando mal. Falta confirmar en Chrome real que ya no se cuela ningún audio equivocado.

## Rediseño visual (brutalista/post-punk, 3 columnas)

- [x] Pantalla nueva de 3 columnas: árbol de carpetas + estadísticas (izquierda), lista de proyectos de la carpeta elegida (centro), ficha del proyecto seleccionado con pestañas PISTAS/INFO (derecha). Tipografía monoespaciada, sin bordes redondeados ni degradados.
- [x] Cambiado a tema claro (fondo blanco roto, tipografía negra) según el segundo mockup del usuario; antes era tema oscuro. Misma estructura, solo cambió la paleta de colores.
- El árbol de carpetas se calcula a partir de las rutas ya escaneadas (`src/lib/folderTree.ts`), no cambia cómo se escanea la carpeta.
- Las formas de onda son decorativas (no es el audio real, ver IDEAS.md).
- "OPEN IN ABLETON" del mockup no es posible desde una web (ninguna página puede abrir una app de escritorio); en su lugar hay un botón "Copiar ruta".
- Se conserva toda la funcionalidad: alias/etiquetas/favorito (ahora en la pestaña INFO), ignorar repetidos, ocultar no encontrados, ocultar tomas archivadas, reproducir con parada y barra de progreso.
- Confirmado por el usuario con su biblioteca real.

## Notas de la sesión de hoy

- Repositorio de GitHub: **privado**.
- Fixtures reales copiados desde `C:\Users\carlos\Desktop\PRUEBA ABLETON MANAGER` (se ignoraron las copias dentro de carpetas `Backup`, como pide el SPEC). El sistema de seguridad bloqueó subirlos a GitHub (archivos personales), así que **solo existen en este ordenador**: `tests/fixtures/*.als` está en `.gitignore`. Ver [tests/fixtures/README.md](../tests/fixtures/README.md).
- T1-T15 completos y probados por el usuario en su Chrome real, incluida la biblioteca completa.
- Pendiente para después: muchos proyectos tienen cientos de samples huérfanos en `Samples/Recorded` (borrados del arreglo pero no del disco). Anotado en [IDEAS.md](../IDEAS.md).
