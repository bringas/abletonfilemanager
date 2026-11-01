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
