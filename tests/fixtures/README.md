# Fixtures de test

- `synthetic-live9.als`, `synthetic-live11.als`, `synthetic-live12.als`: XML hecho a mano y comprimido con gzip, **no son proyectos reales**. Están en Git. Prueban la estructura del lector (`src/lib/alsReader.ts`), incluido el caso de Live 12 (`MainTrack`) que el usuario no tiene todavía.
- `idea frsh cheers.als`, `barrera de coral 3.als`, `idea berto 2.als` (Live 9.7.1) y `camoeli2.als`, `la religiosidad.als` (Live 11.3.13): proyectos **reales** del usuario, copiados desde `C:\Users\carlos\Desktop\PRUEBA ABLETON MANAGER`. **Solo existen en este ordenador** (`tests/fixtures/*.als` está en `.gitignore`, nunca se suben a GitHub). Los tests que los usan se saltan solos si no están presentes. Si hace falta recrearlos, hay que volver a copiarlos a mano a esta carpeta.
