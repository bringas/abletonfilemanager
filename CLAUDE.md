# ProjectRescue — notas para Claude Code

Este repo es ProjectRescue. El documento de referencia es [docs/SPEC.md](docs/SPEC.md); léelo antes de tocar nada que no conozcas. El estado de las tareas vive en [PROGRESS.md](PROGRESS.md), y las ideas aparcadas para después del MVP en [IDEAS.md](IDEAS.md).

## Principios del proyecto (no negociables)

- Es una web estática. Sin backend, sin cuentas, sin base de datos en la nube.
- Nunca se sube ni se modifica ningún archivo del usuario. Solo lectura.
- Todo el procesamiento (leer `.als`, buscar audios, reproducir) ocurre en el navegador.

## Comandos

- `npm run dev` — levanta el servidor local de desarrollo.
- `npm run build` — compila la app para producción.
- `npm run test` — corre los tests (Vitest).
- `npm run lint` — revisa el código con oxlint.

## Convenciones

- TypeScript en todo `src/`. Evitar `any`.
- Estilos con clases de Tailwind directamente en el JSX; nada de CSS aparte salvo que haga falta.
- Las funciones que leen o interpretan archivos `.als` van en `src/lib/` y deben tener tests con fixtures reales en `tests/fixtures/`.
- El usuario es un principiante absoluto en programación: explicar siempre en el chat qué hace cada cambio y cada comando, sin jerga.
- No añadir nada que no pida la tarea del día (ver PROGRESS.md).
