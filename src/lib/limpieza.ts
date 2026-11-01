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

/**
 * Como `archivosUsados`, pero solo contando los clips del carril principal
 * (lo que Ableton reproduce de verdad): las tomas archivadas en "take
 * lanes" no cuentan aquí.
 */
export function archivosUsadosPrincipalmente(projects: ProjectRecord[]): Set<string> {
  const usados = new Set<string>()
  for (const project of projects) {
    if (!project.info) continue
    const carpetaProyecto = project.path.split('/').slice(0, -1)
    for (const clip of project.info.audioClips) {
      if (!clip.relativePath || clip.principal === false) continue
      usados.add(resolverSegmentos(carpetaProyecto, clip.relativePath).join('/'))
    }
  }
  return usados
}

/**
 * Archivos que sí referencia algún proyecto (no son huérfanos), pero solo
 * desde tomas archivadas: ninguna pista los usa de verdad. A diferencia de
 * los sobrantes, alguien podría querer recuperarlos algún día (son tomas
 * descartadas, no basura), así que se tratan como una categoría aparte.
 */
export function encontrarArchivosSinUsar(projects: ProjectRecord[], audioIndex: AudioFileEntry[]): AudioFileEntry[] {
  const usadosTotal = archivosUsados(projects)
  const usadosPrincipalmente = archivosUsadosPrincipalmente(projects)
  return audioIndex.filter((archivo) => usadosTotal.has(archivo.path) && !usadosPrincipalmente.has(archivo.path))
}

/**
 * De entre todas las carpetas que contienen al menos un audio, cuáles se
 * quedarían sin ninguno si se quitaran los archivos de `excluidos` (p. ej.
 * los sobrantes, y si el usuario también lo pide, los que no se usan). Esas
 * carpetas no se crean en la copia optimizada: no tiene sentido una carpeta
 * vacía.
 */
export function encontrarCarpetasSinAudios(audioIndex: AudioFileEntry[], excluidos: Set<string>): string[] {
  const totalPorCarpeta = new Map<string, number>()
  const excluidosPorCarpeta = new Map<string, number>()

  for (const archivo of audioIndex) {
    const segmentos = archivo.path.split('/').slice(0, -1)
    let acumulada = ''
    for (const segmento of segmentos) {
      acumulada = acumulada ? `${acumulada}/${segmento}` : segmento
      totalPorCarpeta.set(acumulada, (totalPorCarpeta.get(acumulada) ?? 0) + 1)
      if (excluidos.has(archivo.path)) {
        excluidosPorCarpeta.set(acumulada, (excluidosPorCarpeta.get(acumulada) ?? 0) + 1)
      }
    }
  }

  const vacias: string[] = []
  for (const [carpeta, total] of totalPorCarpeta) {
    if (total === (excluidosPorCarpeta.get(carpeta) ?? 0)) vacias.push(carpeta)
  }
  return vacias.sort()
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
