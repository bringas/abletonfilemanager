# Progreso de ProjectRescue

Última actualización: 30 oct 2026.

- [x] **T1.** Crear el proyecto (Vite, React, TypeScript, Tailwind), Git, CLAUDE.md, PROGRESS.md e IDEAS.md
- [x] **T2.** Subir a GitHub y publicar la página vacía en Vercel — https://github.com/bringas/abletonfilemanager y https://abletonfilemanager.vercel.app/
- [x] **T3.** Lector: función que recibe los bytes de un `.als` y devuelve versión de Live, BPM y pistas, con tests sobre los cinco fixtures (3 sintéticos + 5 proyectos reales del usuario, 3 de Live 9.7.1 y 2 de Live 11.3.13)
- [x] **T4.** Página mínima: elegir carpeta y listar los `.als` encontrados con su BPM (probado por el usuario en su Chrome real: funciona)
- [~] **T5.** Encontrar la primera grabación de un proyecto y reproducirla con un botón (el usuario probó una versión anterior y funcionaba; después arreglé un bug real que encontré con sus fixtures — rutas con `..` cuando el audio está en la carpeta de otro proyecto — así que falta volver a probar. El formato viejo de Live 9/10 sigue sin soportarse, es T6)
- [ ] **T6.** Extraer clips de audio y rutas en formato Live 11-12 y Live 9-10, con tests
- [ ] **T7.** Escaneo de la carpeta completa con barra de progreso, ignorando `Backup` y archivos `._`
- [ ] **T8.** Guardar el catálogo en IndexedDB con Dexie: al recargar la página, sigue ahí
- [ ] **T9.** Índice de audios, búsqueda por nombre y tamaño, y estados de preescucha

## Notas de la sesión de hoy

- Repositorio de GitHub: **privado**.
- Fixtures reales copiados desde `C:\Users\carlos\Desktop\PRUEBA ABLETON MANAGER` (se ignoraron las copias dentro de carpetas `Backup`, como pide el SPEC). El sistema de seguridad bloqueó subirlos a GitHub (archivos personales), así que **solo existen en este ordenador**: `tests/fixtures/*.als` está en `.gitignore`. Ver [tests/fixtures/README.md](../tests/fixtures/README.md).
- Pendiente: que el usuario vuelva a probar el botón de reproducir tras el arreglo de rutas con `..`.
