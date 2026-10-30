import type { AudioClipInfo } from './alsReader'

export type CategoriaClip = 'master' | 'grabado' | 'procesado' | 'libreria'

const ORDEN_PRIORIDAD: Record<CategoriaClip, number> = {
  master: 0,
  grabado: 1,
  procesado: 2,
  libreria: 3,
}

// Nombre de pista que sugiere la mezcla completa del proyecto.
const PATRON_MASTER = /master|mix|bounce|export/i

/**
 * Categoriza un clip para decidir cuál suena primero: una mezcla/export
 * representa mejor la idea completa que una grabación suelta, así que va
 * primero; luego lo grabado por el usuario, luego lo procesado, y al final
 * los samples de librería (suenan igual en muchos proyectos).
 */
export function categorizarClip(clip: AudioClipInfo): CategoriaClip {
  if (PATRON_MASTER.test(clip.track)) return 'master'

  const ruta = clip.relativePath ?? ''
  if (/(^|\/)Samples\/Recorded(\/|$)/i.test(ruta)) return 'grabado'
  if (/(^|\/)Samples\/Processed(\/|$)/i.test(ruta)) return 'procesado'
  return 'libreria'
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
