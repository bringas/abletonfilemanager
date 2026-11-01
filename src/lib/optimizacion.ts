import type { ProjectRecord, UserMetaRecord } from './db'
import { resolverSegmentos } from './resolvePath'

export const CARPETA_FAVORITOS = '★ Favoritos'
export const CARPETA_SIN_ETIQUETA = 'Sin etiqueta'

export interface GrupoOptimizacion {
  /** Nombre de la carpeta de primer nivel (hija directa de la raíz) tal y como está ahora. */
  nombreActual: string
  /**
   * Dónde se propone colocarla, como lista de segmentos desde la raíz.
   * Si `fija` es true, es siempre `[nombreActual]` (no se mueve).
   */
  destino: string[]
  /**
   * Si es true, esta carpeta se deja donde está: algún proyecto de dentro
   * comparte archivos con otra carpeta de primer nivel (o al revés), y
   * moverlas por separado dejaría esa referencia rota.
   */
  fija: boolean
  numeroDeProyectos: number
}

/**
 * Decide, para cada carpeta de primer nivel de la biblioteca (donde viven
 * uno o varios proyectos), si se puede reorganizar según las etiquetas y
 * favoritos del usuario sin romper nada, y a dónde. Nunca toca la
 * estructura DENTRO de un proyecto (eso son las referencias que Ableton
 * necesita para encontrar sus audios): la unidad que se mueve siempre es
 * una carpeta de primer nivel entera, con todo su contenido intacto.
 */
export function planificarOptimizacion(
  projects: ProjectRecord[],
  metaPorPath: Record<string, UserMetaRecord>,
): GrupoOptimizacion[] {
  const porCarpeta = new Map<string, ProjectRecord[]>()
  for (const project of projects) {
    const segmentos = project.path.split('/')
    if (segmentos.length < 2) continue // proyecto suelto en la raíz, sin carpeta de primer nivel
    const primerNivel = segmentos[0]
    const lista = porCarpeta.get(primerNivel) ?? []
    lista.push(project)
    porCarpeta.set(primerNivel, lista)
  }

  const fijas = carpetasQueComparten(projects)

  const grupos: GrupoOptimizacion[] = []
  for (const [nombreActual, proyectosDeLaCarpeta] of porCarpeta) {
    if (fijas.has(nombreActual)) {
      grupos.push({ nombreActual, destino: [nombreActual], fija: true, numeroDeProyectos: proyectosDeLaCarpeta.length })
      continue
    }

    const algunoFavorito = proyectosDeLaCarpeta.some((p) => metaPorPath[p.path]?.favorito)
    const primeraEtiqueta = proyectosDeLaCarpeta
      .map((p) => metaPorPath[p.path]?.etiquetas?.[0])
      .find((etiqueta): etiqueta is string => Boolean(etiqueta))
    const carpetaDestino = algunoFavorito ? CARPETA_FAVORITOS : (primeraEtiqueta ?? CARPETA_SIN_ETIQUETA)

    grupos.push({
      nombreActual,
      destino: [carpetaDestino, nombreActual],
      fija: false,
      numeroDeProyectos: proyectosDeLaCarpeta.length,
    })
  }

  return grupos.sort((a, b) => a.nombreActual.localeCompare(b.nombreActual))
}

/**
 * Carpetas de primer nivel que no se pueden mover por separado: algún clip
 * de un proyecto de dentro referencia (con "..") un archivo que vive en
 * otra carpeta de primer nivel distinta.
 */
function carpetasQueComparten(projects: ProjectRecord[]): Set<string> {
  const fijas = new Set<string>()
  for (const project of projects) {
    const segmentos = project.path.split('/')
    if (segmentos.length < 2) continue
    const primerNivel = segmentos[0]
    const carpetaProyecto = segmentos.slice(0, -1)

    for (const clip of project.info?.audioClips ?? []) {
      if (!clip.relativePath) continue
      const resuelto = resolverSegmentos(carpetaProyecto, clip.relativePath)
      if (resuelto.length === 0) continue
      if (resuelto[0] !== primerNivel) {
        fijas.add(primerNivel)
        fijas.add(resuelto[0])
      }
    }
  }
  return fijas
}
