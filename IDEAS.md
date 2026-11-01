# Ideas para después del MVP

Sacado de [docs/SPEC.md](docs/SPEC.md). No tocar nada de esto hasta que el MVP (T1-T9) esté terminado.

## Si sobra tiempo (prioridad sobre "fuera del MVP")

- Varias carpetas raíz (por ejemplo, la de samples)
- Forma de onda real (decodificando el audio): hoy la ficha dibuja una forma de onda decorativa (no es el audio real, `src/lib/waveformVisual.ts`) para no ralentizar proyectos con muchos clips
- Exportar e importar el catálogo como copia de seguridad
- Modo de sesión única para Safari y Firefox

## Fuera del MVP

- Reproducir MIDI o instrumentos VST (la "mezcla completa" de todas las pistas con audio sí se construyó, sin plugins ni MIDI)
- Modificar, mover, renombrar o borrar archivos del usuario (el módulo de limpieza solo lee el original y escribe una copia aparte en otra carpeta; borrar el original lo hace el usuario, fuera de la web)
- Abrir el proyecto en Live desde la web
- Cuentas, pagos y sincronización entre dispositivos
- Versión móvil y otros DAW

## Decisiones pendientes

- Nombre definitivo y dominio
- Analítica de visitas, si la hay: nunca nombres de archivo ni rutas
- Monetización, con la app ya publicada

## Otras notas sueltas

- Pistas congeladas (Freeze) podrían dejar oír partes MIDI procesadas. Pendiente de investigar (T15): el usuario no tenía a mano un proyecto con pistas congeladas; retomar cuando aparezca uno.
- Si las grabaciones del usuario son AIFF, puede hacer falta la librería `audio-decode` porque Chrome no garantiza decodificar AIFF de forma nativa.
- Reemparejar alias tras mover o renombrar un proyecto (por nombre y tamaño) es para después del MVP.
- ~~Algunos proyectos tienen cientos de samples huérfanos en `Samples/Recorded`~~ — resuelto: módulo de "Limpieza" (`src/lib/limpieza.ts`), comprueba toda la biblioteca a la vez antes de señalar un archivo como sobrante.
- Fase 2 de la limpieza (pendiente, a diseñar con el usuario): reorganizar la copia según etiquetas/favoritos en vez de mantener la estructura de carpetas actual — "qué estructura tiene sentido" es una conversación propia, no una decisión técnica.
