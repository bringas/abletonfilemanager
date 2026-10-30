import type { ProjectRecord } from './db'

/** Busca por nombre de archivo (la ruta) o por nombre de alguna pista. */
export function coincideBusqueda(project: ProjectRecord, consulta: string): boolean {
  const texto = consulta.trim().toLowerCase()
  if (!texto) return true

  if (project.path.toLowerCase().includes(texto)) return true
  return (project.info?.tracks ?? []).some((pista) => pista.toLowerCase().includes(texto))
}
