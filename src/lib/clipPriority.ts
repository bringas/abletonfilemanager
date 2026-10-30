import type { AudioClipInfo } from './alsReader'
import type { AudioFileEntry } from './scanFolder'

/** Nombre de "pista" que le ponemos a un export/bounce que no está en la sesión. */
export const PISTA_EXPORTADO = '(archivo exportado, no está en la sesión)'

export type CategoriaClip = 'master' | 'grabado' | 'procesado' | 'libreria'

const ORDEN_PRIORIDAD: Record<CategoriaClip, number> = {
  master: 0,
  grabado: 1,
  procesado: 2,
  libreria: 3,
}

// Nombre de pista o de archivo que sugiere la mezcla completa del proyecto.
export const PATRON_MASTER = /master|m[aá]ster|mezcla|mix|bounce|export|mixdown|premaster/i

/**
 * Categoriza un clip para decidir cuál suena primero: una mezcla/export
 * representa mejor la idea completa que una grabación suelta, así que va
 * primero; luego lo grabado por el usuario, luego lo procesado, y al final
 * los samples de librería (suenan igual en muchos proyectos).
 */
export function categorizarClip(clip: AudioClipInfo): CategoriaClip {
  const nombreArchivo = clip.relativePath?.split(/[/\\]/).pop() ?? ''
  if (PATRON_MASTER.test(clip.track) || PATRON_MASTER.test(nombreArchivo)) return 'master'

  const ruta = clip.relativePath ?? ''
  if (/(^|\/)Samples\/Recorded(\/|$)/i.test(ruta)) return 'grabado'
  if (/(^|\/)Samples\/Processed(\/|$)/i.test(ruta)) return 'procesado'
  return 'libreria'
}

/**
 * Busca, dentro de la propia carpeta del proyecto, archivos de audio con
 * nombre de master/bounce/export que no están referenciados en el .als (por
 * ejemplo, porque se exportó desde Ableton y nunca se volvió a importar a la
 * sesión). Se tratan como clips más, con máxima prioridad.
 */
export function encontrarExportacionesSueltas(
  indiceAudios: AudioFileEntry[],
  carpetaProyecto: string[],
): AudioClipInfo[] {
  const prefijo = carpetaProyecto.length > 0 ? `${carpetaProyecto.join('/')}/` : ''

  return indiceAudios
    .filter((archivo) => archivo.path.startsWith(prefijo) && PATRON_MASTER.test(archivo.name))
    .map((archivo) => ({
      track: PISTA_EXPORTADO,
      relativePath: archivo.path.slice(prefijo.length),
      originalFileSize: archivo.size,
      durationBeats: null,
    }))
}

/**
 * Elige el clip que debería sonar primero: el de mejor categoría y, dentro
 * de la misma categoría, el más largo. Ignora los clips sin ruta (no se
 * podrían reproducir).
 */
export function elegirMejorClip(clips: AudioClipInfo[]): AudioClipInfo | null {
  const candidatos = clips.filter((clip) => clip.relativePath)
  if (candidatos.length === 0) return null

  return candidatos.reduce((mejor, actual) => {
    const prioridadMejor = ORDEN_PRIORIDAD[categorizarClip(mejor)]
    const prioridadActual = ORDEN_PRIORIDAD[categorizarClip(actual)]

    if (prioridadActual !== prioridadMejor) {
      return prioridadActual < prioridadMejor ? actual : mejor
    }

    const duracionMejor = mejor.durationBeats ?? 0
    const duracionActual = actual.durationBeats ?? 0
    return duracionActual > duracionMejor ? actual : mejor
  })
}
