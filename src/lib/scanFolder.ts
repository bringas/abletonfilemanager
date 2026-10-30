export interface FoundAls {
  handle: FileSystemFileHandle
  path: string
}

export interface AudioFileEntry {
  handle: FileSystemFileHandle
  path: string
  name: string
  size: number
  lastModified: number
}

export interface ScanResult {
  alsFiles: FoundAls[]
  audioFiles: AudioFileEntry[]
}

const AUDIO_EXTENSIONS = ['.wav', '.aif', '.aiff', '.mp3', '.flac', '.ogg', '.m4a']

/**
 * Las carpetas "Backup" son copias automáticas que guarda Live de cada
 * proyecto, y los archivos que empiezan por "._" son metadatos que crea
 * macOS en discos externos. Ninguno de los dos es un proyecto real.
 */
export function debeIgnorarse(name: string, kind: 'file' | 'directory'): boolean {
  if (name.startsWith('._')) return true
  if (kind === 'directory' && name === 'Backup') return true
  return false
}

function esArchivoDeAudio(name: string): boolean {
  const lower = name.toLowerCase()
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Recorre la carpeta entera una sola vez y devuelve, por separado, los
 * .als encontrados y un índice de todos los demás archivos de audio
 * (nombre + tamaño + ruta). Ese índice sirve para encontrar una grabación
 * cuando su ruta relativa guardada en el .als ya no existe.
 */
export async function recorrerCarpeta(
  dirHandle: FileSystemDirectoryHandle,
  path = '',
): Promise<ScanResult> {
  const alsFiles: FoundAls[] = []
  const audioFiles: AudioFileEntry[] = []

  for await (const [name, handle] of dirHandle.entries()) {
    if (debeIgnorarse(name, handle.kind)) continue
    const entryPath = path ? `${path}/${name}` : name

    if (handle.kind === 'directory') {
      const sub = await recorrerCarpeta(handle, entryPath)
      alsFiles.push(...sub.alsFiles)
      audioFiles.push(...sub.audioFiles)
    } else if (name.toLowerCase().endsWith('.als')) {
      alsFiles.push({ handle, path: entryPath })
    } else if (esArchivoDeAudio(name)) {
      const file = await handle.getFile()
      audioFiles.push({ handle, path: entryPath, name, size: file.size, lastModified: file.lastModified })
    }
  }

  return { alsFiles, audioFiles }
}

/** Filtra el índice de audios a los que están dentro de una carpeta (o sus subcarpetas). */
export function audiosDentroDe(indiceAudios: AudioFileEntry[], carpeta: string[]): AudioFileEntry[] {
  if (carpeta.length === 0) return indiceAudios
  const prefijo = `${carpeta.join('/')}/`
  return indiceAudios.filter((archivo) => archivo.path.startsWith(prefijo))
}

/**
 * Busca un archivo en el índice de audios por nombre, confirmando con el
 * tamaño cuando lo tenemos (Live 11/12). Si no hay tamaño (Live 9/10) o
 * ningún tamaño coincide, se queda con la primera coincidencia por nombre.
 */
export function buscarEnIndice(
  indice: AudioFileEntry[],
  nombreArchivo: string,
  tamanoEsperado: number | null,
): AudioFileEntry | null {
  const candidatos = indice.filter((f) => f.name === nombreArchivo)
  if (candidatos.length === 0) return null

  if (tamanoEsperado != null) {
    const coincidencia = candidatos.find((f) => f.size === tamanoEsperado)
    if (coincidencia) return coincidencia
  }

  return candidatos[0]
}
