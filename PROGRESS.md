# Progreso de ProjectRescue

Última actualización: 30 oct 2026.

- [x] **T1.** Crear el proyecto (Vite, React, TypeScript, Tailwind), Git, CLAUDE.md, PROGRESS.md e IDEAS.md
- [ ] **T2.** Subir a GitHub y publicar la página vacía en Vercel
- [~] **T3.** Lector: función que recibe los bytes de un `.als` y devuelve versión de Live, BPM y pistas, con tests sobre los cinco fixtures (código y tests listos con 3 fixtures *sintéticos*; faltan los 5 `.als` reales del usuario)
- [~] **T4.** Página mínima: elegir carpeta y listar los `.als` encontrados con su BPM (código listo; el navegador integrado de esta sesión no puede abrir el diálogo nativo de carpetas, falta que el usuario lo pruebe en su Chrome/Edge real)
- [~] **T5.** Encontrar la primera grabación de un proyecto y reproducirla con un botón (código listo, mismo motivo que T4; solo soporta el formato de ruta "fácil" de Live 11/12 por ahora)
- [ ] **T6.** Extraer clips de audio y rutas en formato Live 11-12 y Live 9-10, con tests
- [ ] **T7.** Escaneo de la carpeta completa con barra de progreso, ignorando `Backup` y archivos `._`
- [ ] **T8.** Guardar el catálogo en IndexedDB con Dexie: al recargar la página, sigue ahí
- [ ] **T9.** Índice de audios, búsqueda por nombre y tamaño, y estados de preescucha

## Notas de la sesión de hoy

- Repositorio de GitHub: **privado** (confirmado por el usuario, por los nombres de pista/proyecto que aparecerán en los fixtures de test).
- Pendiente: el usuario debe pasar 5 archivos `.als` propios (idealmente uno de Live 9 o 10) para usarlos como fixtures de T3.
