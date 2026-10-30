import type { AudioClipInfo } from './alsReader'
import { audiosDentroDe, type AudioFileEntry } from './scanFolder'

/** Más de esta cantidad de clips en una misma pista se considera "ruido" (tomas sueltas). */
const UMBRAL_RUIDO = 5

/**
 * Cuando una pista tiene muchas tomas grabadas (algunos proyectos tienen
 * cientos o miles), nos quedamos solo con la más reciente (la que
 * probablemente te quedaste) y la más larga (probablemente la toma
 * completa, no un fragmento). El resto se descarta, tanto de la ficha como
 * de qué suena primero.
 */
export function reducirClipsPorPista(
  clips: AudioClipInfo[],
  indiceAudios: AudioFileEntry[],
  carpetaProyecto: string[],
): AudioClipInfo[] {
  const indiceDelProyecto = audiosDentroDe(indiceAudios, carpetaProyecto)

  const porPista = new Map<string, AudioClipInfo[]>()
  for (const clip of clips) {
    const lista = porPista.get(clip.track) ?? []
    lista.push(clip)
    porPista.set(clip.track, lista)
  }

  const resultado: AudioClipInfo[] = []
  for (const clipsDePista of porPista.values()) {
    if (clipsDePista.length <= UMBRAL_RUIDO) {
      resultado.push(...clipsDePista)
      continue
    }

    const masLargo = clipsDePista.reduce((mejor, actual) =>
      (actual.durationBeats ?? 0) > (mejor.durationBeats ?? 0) ? actual : mejor,
    )
    const masReciente = clipsDePista.reduce((mejor, actual) =>
      fechaDeClip(actual, indiceDelProyecto) > fechaDeClip(mejor, indiceDelProyecto) ? actual : mejor,
    )

    resultado.push(masReciente)
    if (masLargo !== masReciente) resultado.push(masLargo)
  }

  return resultado
}

function fechaDeClip(clip: AudioClipInfo, indiceDelProyecto: AudioFileEntry[]): number {
  const nombre = clip.relativePath?.split(/[/\\]/).pop()
  if (!nombre) return 0
  return indiceDelProyecto.find((archivo) => archivo.name === nombre)?.lastModified ?? 0
}
