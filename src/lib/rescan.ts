import type { ProjectRecord } from './db'

/**
 * En un reescaneo de cambios, un proyecto se reutiliza (no se vuelve a leer
 * ni a resolver sus audios) solo si ya lo teníamos guardado y su fecha de
 * modificación no cambió. Si es nuevo, cambió, o estamos haciendo un
 * escaneo completo (no de cambios), se vuelve a leer.
 */
export function debeReutilizarProyecto(
  existente: ProjectRecord | undefined,
  lastModified: number | undefined,
  esReescaneoDeCambios: boolean,
): boolean {
  if (!esReescaneoDeCambios || !existente) return false
  return existente.lastModified === lastModified
}
