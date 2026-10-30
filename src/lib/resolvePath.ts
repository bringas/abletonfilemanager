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
