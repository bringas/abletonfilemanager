import type { ProjectRecord, UserMetaRecord } from './db'

/** Busca por nombre de archivo (la ruta), alias, etiquetas o nombre de pista. */
export function coincideBusqueda(
  project: ProjectRecord,
  consulta: string,
  meta?: UserMetaRecord,
): boolean {
  const texto = consulta.trim().toLowerCase()
  if (!texto) return true

  if (project.path.toLowerCase().includes(texto)) return true
  if (meta?.alias?.toLowerCase().includes(texto)) return true
  if (meta?.etiquetas?.some((etiqueta) => etiqueta.toLowerCase().includes(texto))) return true
  return (project.info?.tracks ?? []).some((pista) => pista.toLowerCase().includes(texto))
}
