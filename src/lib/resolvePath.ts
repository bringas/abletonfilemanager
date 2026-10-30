import type { AudioClipInfo } from './alsReader'
import { buscarEnIndice, type AudioFileEntry } from './scanFolder'

/**
 * Combina la ruta (como lista de carpetas) de la carpeta de un proyecto con
 * una ruta relativa que puede incluir "..", y devuelve la ruta final también
 * como lista de nombres, contada desde la carpeta raíz que eligió el usuario.
 */
export function resolverSegmentos(carpetaProyecto: string[], relativePath: string): string[] {
  const segmentos = [...carpetaProyecto]
  for (const parte of relativePath.split(/[/\\]/).filter(Boolean)) {
    if (parte === '.') continue
    if (parte === '..') segmentos.pop()
    else segmentos.push(parte)
  }
  return segmentos
}

/** Baja desde la carpeta raíz siguiendo una lista de nombres hasta llegar al archivo. */
export async function resolverArchivo(
  raiz: FileSystemDirectoryHandle,
  segmentos: string[],
): Promise<FileSystemFileHandle | null> {
  if (segmentos.length === 0) return null

  try {
    let carpeta = raiz
    for (const nombre of segmentos.slice(0, -1)) {
      carpeta = await carpeta.getDirectoryHandle(nombre)
    }
    return await carpeta.getFileHandle(segmentos[segmentos.length - 1])
  } catch {
    return null
  }
}

/**
 * Encuentra el archivo de un clip de audio: primero por su ruta relativa
 * (siguiendo incluso ".." hacia otro proyecto), y si eso falla, buscando por
 * nombre (y tamaño, cuando lo sabemos) en el índice de audios — pero **solo
 * dentro de la propia carpeta del proyecto** (ver `audiosDelProyecto`).
 */
export async function resolverClip(
  raiz: FileSystemDirectoryHandle,
  carpetaProyecto: string[],
  clip: AudioClipInfo,
  indiceAudios: AudioFileEntry[],
): Promise<FileSystemFileHandle | null> {
  if (!clip.relativePath) return null

  const segmentos = resolverSegmentos(carpetaProyecto, clip.relativePath)
  const porRuta = await resolverArchivo(raiz, segmentos)
  if (porRuta) return porRuta

  const nombreArchivo = segmentos[segmentos.length - 1]
  const porIndice = buscarEnIndice(audiosDelProyecto(indiceAudios, carpetaProyecto), nombreArchivo, clip.originalFileSize)
  return porIndice?.handle ?? null
}

/**
 * Filtra el índice de audios a solo los que están dentro de la carpeta del
 * proyecto (o sus subcarpetas). Sin esto, un nombre de archivo genérico y
 * repetido (p. ej. "1-Audio.wav", típico si no renombras las pistas) podría
 * encontrar por error el archivo de OTRO proyecto con el mismo nombre.
 */
function audiosDelProyecto(indiceAudios: AudioFileEntry[], carpetaProyecto: string[]): AudioFileEntry[] {
  if (carpetaProyecto.length === 0) return indiceAudios
  const prefijo = `${carpetaProyecto.join('/')}/`
  return indiceAudios.filter((archivo) => archivo.path.startsWith(prefijo))
}
