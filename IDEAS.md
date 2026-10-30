# Ideas para después del MVP

Sacado de [docs/SPEC.md](docs/SPEC.md). No tocar nada de esto hasta que el MVP (T1-T9) esté terminado.

## Si sobra tiempo (prioridad sobre "fuera del MVP")

- Varias carpetas raíz (por ejemplo, la de samples)
- Forma de onda en miniatura
- Exportar e importar el catálogo como copia de seguridad
- Modo de sesión única para Safari y Firefox

## Fuera del MVP

- Reproducir MIDI, instrumentos VST o la mezcla completa
- Modificar, mover o renombrar archivos
- Abrir el proyecto en Live desde la web
- Cuentas, pagos y sincronización entre dispositivos
- Versión móvil y otros DAW

## Decisiones pendientes

- Nombre definitivo y dominio
- Analítica de visitas, si la hay: nunca nombres de archivo ni rutas
- Monetización, con la app ya publicada

## Otras notas sueltas

- Pistas congeladas (Freeze) podrían dejar oír partes MIDI procesadas; investigar cuando toque el martes del plan original (T6/T7).
- Si las grabaciones del usuario son AIFF, puede hacer falta la librería `audio-decode` porque Chrome no garantiza decodificar AIFF de forma nativa.
- Reemparejar alias tras mover o renombrar un proyecto (por nombre y tamaño) es para después del MVP.
- Algunos proyectos tienen cientos de samples grabados en `Samples/Recorded` de los que el 99% ya no se usan (se borraron del arreglo en Live pero el archivo se queda en la carpeta). Hoy esto no afecta a qué suena primero (solo miramos los clips que el .als referencia de verdad), pero si en el futuro se muestra "todas las grabaciones del proyecto" (como dice el recorrido del usuario en el SPEC), haría falta una forma de distinguir samples huérfanos de los que sí están en uso.
