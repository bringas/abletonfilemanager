import type { ProjectRecord } from './db'
import { resolverSegmentos } from './resolvePath'
import type { AudioFileEntry } from './scanFolder'

/**
 * Archivos de audio que ningún proyecto de toda la biblioteca referencia
 * (ni en su carril principal, ni en tomas archivadas, ni como export
 * suelto): sobran. Ojo, "ningún proyecto" es literal — muchos proyectos
 * comparten carpetas de sesión entre sí (rutas con ".." hacia otro
 * proyecto), así que un archivo no se descarta por no usarse en el suyo
 * propio, solo si no lo usa nadie en toda la biblioteca.
 */
export function encontrarArchivosSobrantes(
  projects: ProjectRecord[],
  audioIndex: AudioFileEntry[],
): AudioFileEntry[] {
  const usados = archivosUsados(projects)
  return audioIndex.filter((archivo) => !usados.has(archivo.path))
}

/** Las rutas (relativas a la carpeta raíz) de todos los audios que algún proyecto referencia. */
export function archivosUsados(projects: ProjectRecord[]): Set<string> {
  const usados = new Set<string>()
  for (const project of projects) {
    if (!project.info) continue
    const carpetaProyecto = project.path.split('/').slice(0, -1)
    for (const clip of project.info.audioClips) {
      if (!clip.relativePath) continue
      usados.add(resolverSegmentos(carpetaProyecto, clip.relativePath).join('/'))
    }
  }
  return usados
}

export interface GrupoDeSobrantes {
  /** Carpeta de primer nivel donde están estos archivos. */
  carpeta: string
  archivos: AudioFileEntry[]
  tamano: number
}

/**
 * Agrupa los archivos sobrantes por carpeta de primer nivel, de más pesada
 * a menos, y dentro de cada grupo del más pesado al más ligero — para
 * poder mostrar de un vistazo dónde está el grueso del espacio a ganar.
 */
export function agruparSobrantesPorCarpeta(archivos: AudioFileEntry[]): GrupoDeSobrantes[] {
  const porCarpeta = new Map<string, AudioFileEntry[]>()
  for (const archivo of archivos) {
    const carpeta = archivo.path.split('/')[0] ?? archivo.path
    const lista = porCarpeta.get(carpeta) ?? []
    lista.push(archivo)
    porCarpeta.set(carpeta, lista)
  }

  return Array.from(porCarpeta.entries())
    .map(([carpeta, archivosDeLaCarpeta]) => ({
      carpeta,
      archivos: [...archivosDeLaCarpeta].sort((a, b) => b.size - a.size),
      tamano: archivosDeLaCarpeta.reduce((suma, a) => suma + a.size, 0),
    }))
    .sort((a, b) => b.tamano - a.tamano)
}
