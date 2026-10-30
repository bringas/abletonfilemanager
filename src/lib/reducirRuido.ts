import type { AudioClipInfo } from './alsReader'
import { audiosDentroDe, type AudioFileEntry } from './scanFolder'

/** Más de esta cantidad de clips en un grupo se considera "ruido" (tomas sueltas). */
const UMBRAL_RUIDO = 5

/**
 * Decide, pista por pista, qué clips se muestran por defecto (en la ficha y
 * para elegir qué suena) y cuáles quedan ocultos detrás del interruptor
 * "mostrar otros archivos". No borra nada: todo sigue en el resultado, solo
 * marcado con `mostrarPorDefecto`.
 *
 * Primero mira si la pista tiene clips en su carril principal (lo que
 * Ableton reproduce de verdad al abrir el proyecto). Si los tiene, esos son
 * los que se muestran, y toda toma archivada en un "take lane" queda oculta.
 * Si no tiene ninguno (todo quedó en tomas archivadas, sin "comp" elegido),
 * usamos esas tomas como mejor estimación.
 *
 * Dentro del grupo que se muestra, y también dentro del que queda oculto, si
 * hay más de `UMBRAL_RUIDO` clips nos quedamos solo con el más reciente (por
 * fecha del archivo) y el más largo; el resto se descarta para no acumular
 * miles de clips por resolver.
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
    const principales = clipsDePista.filter((clip) => clip.principal !== false)
    const secundarios = clipsDePista.filter((clip) => clip.principal === false)

    const grupoMostrado = principales.length > 0 ? principales : secundarios
    const grupoOculto = principales.length > 0 ? secundarios : []

    resultado.push(...reducirGrupo(grupoMostrado, indiceDelProyecto, true))
    resultado.push(...reducirGrupo(grupoOculto, indiceDelProyecto, false))
  }

  return resultado
}

function reducirGrupo(
  clips: AudioClipInfo[],
  indiceDelProyecto: AudioFileEntry[],
  mostrarPorDefecto: boolean,
): AudioClipInfo[] {
  if (clips.length === 0) return []
  if (clips.length <= UMBRAL_RUIDO) {
    return clips.map((clip) => ({ ...clip, mostrarPorDefecto }))
  }

  const masLargo = clips.reduce((mejor, actual) =>
    (actual.durationBeats ?? 0) > (mejor.durationBeats ?? 0) ? actual : mejor,
  )
  const masReciente = clips.reduce((mejor, actual) =>
    fechaDeClip(actual, indiceDelProyecto) > fechaDeClip(mejor, indiceDelProyecto) ? actual : mejor,
  )

  const elegidos = masLargo === masReciente ? [masReciente] : [masReciente, masLargo]
  return elegidos.map((clip) => ({ ...clip, mostrarPorDefecto }))
}

function fechaDeClip(clip: AudioClipInfo, indiceDelProyecto: AudioFileEntry[]): number {
  const nombre = clip.relativePath?.split(/[/\\]/).pop()
  if (!nombre) return 0
  return indiceDelProyecto.find((archivo) => archivo.name === nombre)?.lastModified ?? 0
}
