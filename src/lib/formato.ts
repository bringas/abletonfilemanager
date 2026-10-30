/** Bytes a "12.3 MB" o "1.2 GB" (cambia de unidad a partir de 1024 MB). */
export function formatoTamano(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

/**
 * Duración de un clip en minutos:segundos, a partir de su duración en beats
 * y el BPM del proyecto (no tenemos la duración en segundos directamente).
 */
export function formatoDuracion(durationBeats: number | null, bpm: number | null): string {
  if (durationBeats == null || !bpm) return '—'
  return formatoSegundos((durationBeats / bpm) * 60)
}

/** Una cantidad de segundos (ya reales, no en beats) a minutos:segundos. */
export function formatoSegundos(segundos: number | null): string {
  if (segundos == null || !Number.isFinite(segundos)) return '—'
  const segundosTotales = Math.round(segundos)
  const minutos = Math.floor(segundosTotales / 60)
  const resto = segundosTotales % 60
  return `${minutos}:${resto.toString().padStart(2, '0')}`
}

/** Fecha corta en español, p.ej. "12 mar 2024". */
export function formatoFecha(timestamp: number | Date | null | undefined): string {
  if (!timestamp) return '—'
  const fecha = timestamp instanceof Date ? timestamp : new Date(timestamp)
  return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}
