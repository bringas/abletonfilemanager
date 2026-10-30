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

## Notas de la sesión de hoy

- Repositorio de GitHub: **privado**.
- Fixtures reales copiados desde `C:\Users\carlos\Desktop\PRUEBA ABLETON MANAGER` (se ignoraron las copias dentro de carpetas `Backup`, como pide el SPEC). El sistema de seguridad bloqueó subirlos a GitHub (archivos personales), así que **solo existen en este ordenador**: `tests/fixtures/*.als` está en `.gitignore`. Ver [tests/fixtures/README.md](../tests/fixtures/README.md).
- T1-T15 completos y probados por el usuario en su Chrome real, incluida la biblioteca completa.
- Pendiente para después: muchos proyectos tienen cientos de samples huérfanos en `Samples/Recorded` (borrados del arreglo pero no del disco). Anotado en [IDEAS.md](../IDEAS.md).
