# Progreso de ProjectRescue

Última actualización: 30 oct 2026.

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
5. [~] **Ruido dentro de una misma pista** (código y tests listos; falta probar en Chrome real): algunas pistas tienen cientos o miles de tomas cortas grabadas. Ahora, si una pista tiene más de 5 clips, nos quedamos solo con el más reciente (por fecha del archivo) y el más largo — tanto en la ficha como al elegir qué suena. El umbral (5) es un valor por defecto, se puede ajustar
6. [~] Ocultar por defecto en la ficha los audios "no encontrados" (con una casilla para mostrarlos si hace falta) — falta probar en Chrome real
7. [~] Se descubrió la causa real de los proyectos con "cientos de clips por pista": Ableton guarda las tomas repetidas en "take lanes" (carriles de tomas), que **no suenan por defecto**, solo el carril principal de la pista. Ahora el lector de `.als` detecta esto (campo `principal` en cada clip) y, por pista, solo se muestra y se puede reproducir por defecto lo que está en el carril principal. Si una pista no tiene nada ahí (todo quedó en tomas archivadas), esa pista no tiene preview por defecto — no se adivina una "mejor estimación". El resto queda disponible solo tras marcar "Mostrar también las tomas archivadas". Esto sustituye y mejora el punto 7 anterior (que solo miraba los export sueltos) — falta probar en Chrome real con un proyecto de los pesados (700+ clips)

## Cambio de criterio: reproducir el archivo entero (30 oct 2026)

El usuario cambió de idea sobre T11: ya no quiere saltar el silencio inicial ni cortar a los 15 segundos, sino reproducir la grabación encontrada entera, desde el principio. Quitado `src/lib/silenceSkip.ts` (ya no se usa) y la barra de progreso ahora se calcula contra la duración real del archivo (`audioEl.duration`), no contra 15s fijos. Actualizado también docs/SPEC.md.

## Arreglo importante: audio equivocado al reproducir (30 oct 2026)

El usuario reportó que en algunos clips sonaba un instrumento distinto al que se ve en Ableton (ej. sonaba un bajo en una pista de guitarra). Causa encontrada:

1. Cuando varios archivos de la carpeta del proyecto tienen el mismo nombre genérico (pasa porque el usuario reutiliza/copia carpetas de sesión para varias canciones), la búsqueda por nombre se quedaba con el primero que encontraba si no podía confirmar por tamaño.
2. Live a veces guarda `OriginalFileSize Value="0"` en el `.als` (no es un tamaño real), y la app lo trataba como un tamaño válido, así que la comprobación por tamaño no servía de nada en esos casos.

Arreglado en dos sitios: `src/lib/alsReader.ts` (un tamaño 0 se trata como "no lo sabemos", no como un tamaño real) y `src/lib/scanFolder.ts` (`buscarEnIndice`: si hay varios archivos con el mismo nombre y ninguno coincide en tamaño, ya no adivina — dice "no encontrado" en vez de arriesgarse a reproducir el archivo equivocado). Como consecuencia, es normal que ahora veas más clips como "no encontrado" que antes: antes podían estar "encontrados" pero sonando mal. Falta confirmar en Chrome real que ya no se cuela ningún audio equivocado.

## Rediseño visual (brutalista/post-punk, 3 columnas)

- [~] Pantalla nueva de 3 columnas: árbol de carpetas + estadísticas (izquierda), lista de proyectos de la carpeta elegida (centro), ficha del proyecto seleccionado con pestañas PISTAS/INFO (derecha). Tipografía monoespaciada, sin bordes redondeados ni degradados.
- [~] Cambiado a tema claro (fondo blanco roto, tipografía negra) según el segundo mockup del usuario; antes era tema oscuro. Misma estructura, solo cambió la paleta de colores.
- El árbol de carpetas se calcula a partir de las rutas ya escaneadas (`src/lib/folderTree.ts`), no cambia cómo se escanea la carpeta.
- Las formas de onda son decorativas (no es el audio real, ver IDEAS.md).
- "OPEN IN ABLETON" del mockup no es posible desde una web (ninguna página puede abrir una app de escritorio); en su lugar hay un botón "Copiar ruta".
- Se conserva toda la funcionalidad: alias/etiquetas/favorito (ahora en la pestaña INFO), ignorar repetidos, ocultar no encontrados, ocultar tomas archivadas, reproducir con parada y barra de progreso.
- Falta probar en Chrome real con la biblioteca completa.

## Notas de la sesión de hoy

- Repositorio de GitHub: **privado**.
- Fixtures reales copiados desde `C:\Users\carlos\Desktop\PRUEBA ABLETON MANAGER` (se ignoraron las copias dentro de carpetas `Backup`, como pide el SPEC). El sistema de seguridad bloqueó subirlos a GitHub (archivos personales), así que **solo existen en este ordenador**: `tests/fixtures/*.als` está en `.gitignore`. Ver [tests/fixtures/README.md](../tests/fixtures/README.md).
- T1-T15 completos y probados por el usuario en su Chrome real, incluida la biblioteca completa.
- Pendiente para después: muchos proyectos tienen cientos de samples huérfanos en `Samples/Recorded` (borrados del arreglo pero no del disco). Anotado en [IDEAS.md](../IDEAS.md).
