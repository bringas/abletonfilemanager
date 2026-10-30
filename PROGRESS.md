# Progreso de ProjectRescue

Última actualización: 30 oct 2026.

- [x] **T1.** Crear el proyecto (Vite, React, TypeScript, Tailwind), Git, CLAUDE.md, PROGRESS.md e IDEAS.md
- [x] **T2.** Subir a GitHub y publicar la página vacía en Vercel — https://github.com/bringas/abletonfilemanager y https://abletonfilemanager.vercel.app/
- [x] **T3.** Lector: función que recibe los bytes de un `.als` y devuelve versión de Live, BPM y pistas, con tests sobre los cinco fixtures (3 sintéticos + 5 proyectos reales del usuario, 3 de Live 9.7.1 y 2 de Live 11.3.13)
- [x] **T4.** Página mínima: elegir carpeta y listar los `.als` encontrados con su BPM (probado por el usuario en su Chrome real: funciona)
- [x] **T5.** Encontrar la primera grabación de un proyecto y reproducirla con un botón (probado por el usuario en su Chrome real tras el arreglo de rutas con `..`: funciona. El formato viejo de Live 9/10 sigue sin soportarse, es T6)
- [x] **T6.** Extraer clips de audio y rutas en formato Live 11-12 y Live 9-10, con tests
- [~] **T7.** Escaneo de la carpeta completa con barra de progreso, ignorando `Backup` y archivos `._` (código listo y con tests; falta que el usuario lo pruebe en su Chrome real)
- [~] **T8.** Guardar el catálogo en IndexedDB con Dexie: al recargar la página, sigue ahí (código listo, incluye "Reconectar carpeta"; falta probarlo en Chrome real porque necesita de verdad cerrar/recargar la pestaña)
- [~] **T9.** Índice de audios, búsqueda por nombre y tamaño, y estados de preescucha (código listo y con tests; falta probar en Chrome real con tus proyectos, sobre todo que el estado "con audio" salga bien)

## Notas de la sesión de hoy

- Repositorio de GitHub: **privado**.
- Fixtures reales copiados desde `C:\Users\carlos\Desktop\PRUEBA ABLETON MANAGER` (se ignoraron las copias dentro de carpetas `Backup`, como pide el SPEC). El sistema de seguridad bloqueó subirlos a GitHub (archivos personales), así que **solo existen en este ordenador**: `tests/fixtures/*.als` está en `.gitignore`. Ver [tests/fixtures/README.md](../tests/fixtures/README.md).
- T1-T6 completos y probados. T7-T9 tienen el código y los tests listos, pendientes de que el usuario los pruebe en su Chrome real con su carpeta de proyectos (hace falta probar: escaneo completo con progreso, recargar la página y reconectar, y que el estado de cada proyecto se vea bien).
