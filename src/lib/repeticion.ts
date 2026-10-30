import type { AudioClipInfo } from './alsReader'
import type { ProjectRecord } from './db'

/** Identifica un archivo de audio por nombre + tamaño, para contarlo entre proyectos. */
export function claveDeClip(clip: AudioClipInfo): string | null {
  const nombre = clip.relativePath?.split(/[/\\]/).pop()
  if (!nombre) return null
  return `${nombre.toLowerCase()}|${clip.originalFileSize ?? '?'}`
}

/**
 * Cuenta en cuántos proyectos distintos aparece cada archivo (por nombre +
 * tamaño). Útil para detectar samples reutilizados entre sesiones (p. ej. si
 * siempre partes de la misma jam como plantilla).
 */
export function contarRepeticiones(projects: ProjectRecord[]): Map<string, number> {
  const conteo = new Map<string, number>()

  for (const project of projects) {
    if (!project.info) continue

    const clavesDelProyecto = new Set(
      project.info.audioClips.map(claveDeClip).filter((clave): clave is string => clave !== null),
    )
    for (const clave of clavesDelProyecto) {
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1)
    }
  }

  return conteo
}

export function vecesRepetido(clip: AudioClipInfo, repeticiones: Map<string, number>): number {
  const clave = claveDeClip(clip)
  return clave ? (repeticiones.get(clave) ?? 0) : 0
}

/**
 * Para elegir qué suena primero: si se pide ignorar lo repetido, quita los
 * clips que aparecen en demasiados proyectos. Si eso deja la lista vacía,
 * no filtra (mejor que suene algo a que no suene nada).
 */
export function filtrarRepetidosSiProcede(
  clips: AudioClipInfo[],
  repeticiones: Map<string, number>,
  umbral: number,
  activo: boolean,
): AudioClipInfo[] {
  if (!activo) return clips
  const filtrados = clips.filter((clip) => vecesRepetido(clip, repeticiones) < umbral)
  return filtrados.length > 0 ? filtrados : clips
}
