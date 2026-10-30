import type { ProjectRecord } from './db'

export interface FolderNode {
  nombre: string
  /** Segmentos completos desde la raíz, p.ej. ["Ideas", "Jams"]. */
  ruta: string[]
  hijos: FolderNode[]
  /** Proyectos en esta carpeta y en todas sus subcarpetas. */
  numeroDeProyectos: number
}

/**
 * Construye un árbol de carpetas a partir de la ruta de cada proyecto
 * (la ruta de un .als es relativa a la carpeta raíz elegida, con "/" como
 * separador). No cambia cómo se escanea la carpeta: es solo para navegar.
 */
export function construirArbolDeCarpetas(projects: ProjectRecord[]): FolderNode {
  const raiz: FolderNode = { nombre: '', ruta: [], hijos: [], numeroDeProyectos: 0 }

  for (const project of projects) {
    const segmentos = project.path.split('/').slice(0, -1)
    raiz.numeroDeProyectos++

    let actual = raiz
    const rutaAcumulada: string[] = []
    for (const segmento of segmentos) {
      rutaAcumulada.push(segmento)
      let hijo = actual.hijos.find((h) => h.nombre === segmento)
      if (!hijo) {
        hijo = { nombre: segmento, ruta: [...rutaAcumulada], hijos: [], numeroDeProyectos: 0 }
        actual.hijos.push(hijo)
      }
      hijo.numeroDeProyectos++
      actual = hijo
    }
  }

  ordenarHijos(raiz)
  return raiz
}

function ordenarHijos(nodo: FolderNode): void {
  nodo.hijos.sort((a, b) => a.nombre.localeCompare(b.nombre))
  for (const hijo of nodo.hijos) ordenarHijos(hijo)
}

/** Proyectos dentro de una carpeta (y sus subcarpetas). Vacío = todos. */
export function proyectosEnCarpeta(projects: ProjectRecord[], carpeta: string[]): ProjectRecord[] {
  if (carpeta.length === 0) return projects
  const prefijo = `${carpeta.join('/')}/`
  return projects.filter((p) => p.path.startsWith(prefijo))
}

export function claveDeCarpeta(ruta: string[]): string {
  return ruta.join('/')
}
