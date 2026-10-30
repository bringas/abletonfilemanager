export interface AudioClipInfo {
  track: string
  /** Ruta relativa a la carpeta del proyecto. Null si no se pudo determinar. */
  relativePath: string | null
  /** Tamaño del archivo original en bytes. Live 9/10 no lo trae; queda en null. */
  originalFileSize: number | null
  /**
   * Duración del clip en beats (CurrentEnd - CurrentStart), para comparar qué
   * clip es "más largo". No es una unidad de tiempo real, pero sirve para
   * comparar clips dentro del mismo proyecto (mismo tempo).
   */
  durationBeats: number | null
  /**
   * false si el clip está dentro de un "take lane" (toma archivada por
   * grabación repetida) o de un clip slot de Session View: Ableton no lo
   * reproduce al abrir el proyecto, solo si lo activas a mano. Si no está
   * presente (undefined), el clip está en el carril principal de la pista,
   * que es lo que Ableton reproduce de verdad.
   */
  principal?: boolean
  /**
   * false si este clip queda oculto por defecto (toma archivada de más, o
   * sobrante tras reducir el ruido de una pista con muchos clips). Lo calcula
   * `reducirClipsPorPista`; no viene así directamente del .als.
   */
  mostrarPorDefecto?: boolean
}

export interface AlsProjectInfo {
  liveVersion: string
  bpm: number | null
  tracks: string[]
  audioClips: AudioClipInfo[]
}

const TRACK_TAGS = ['AudioTrack', 'MidiTrack', 'GroupTrack', 'ReturnTrack']

/**
 * Lee los bytes de un archivo .als (un XML comprimido en gzip) y devuelve
 * la versión de Live, el BPM, las pistas y los clips de audio referenciados.
 */
export async function parseAlsProject(bytes: Uint8Array): Promise<AlsProjectInfo> {
  const xmlText = await decompressToText(bytes)
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')

  if (doc.querySelector('parsererror')) {
    throw new Error('El archivo .als no es un XML válido')
  }

  return {
    liveVersion: readLiveVersion(doc),
    bpm: readBpm(doc),
    tracks: readTrackNames(doc),
    audioClips: readAudioClips(doc),
  }
}

async function decompressToText(bytes: Uint8Array): Promise<string> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const decompressed = source.pipeThrough(
    new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  )

  const chunks: Uint8Array[] = []
  for await (const chunk of decompressed as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return new TextDecoder('utf-8').decode(merged)
}

function readLiveVersion(doc: Document): string {
  return doc.documentElement.getAttribute('Creator') ?? ''
}

function readBpm(doc: Document): number | null {
  // Live 9-11 usa MasterTrack, Live 12 usa MainTrack.
  const mainOrMaster = doc.querySelector('MasterTrack, MainTrack')
  const manual = mainOrMaster?.querySelector('DeviceChain > Mixer > Tempo > Manual')
  const value = manual?.getAttribute('Value')
  return value ? Number.parseFloat(value) : null
}

function readTrackNames(doc: Document): string[] {
  const tracksRoot = doc.querySelector('Tracks')
  if (!tracksRoot) return []

  return Array.from(tracksRoot.children)
    .filter((el) => TRACK_TAGS.includes(el.tagName))
    .map((trackEl) => trackEl.querySelector('Name > EffectiveName')?.getAttribute('Value') ?? '')
}

function readAudioClips(doc: Document): AudioClipInfo[] {
  const tracksRoot = doc.querySelector('Tracks')
  if (!tracksRoot) return []

  const clips: AudioClipInfo[] = []

  for (const trackEl of Array.from(tracksRoot.children)) {
    if (!TRACK_TAGS.includes(trackEl.tagName)) continue
    const trackName = trackEl.querySelector('Name > EffectiveName')?.getAttribute('Value') ?? ''

    for (const clipEl of Array.from(trackEl.querySelectorAll('AudioClip'))) {
      const fileRef = clipEl.querySelector('SampleRef > FileRef')
      if (!fileRef) continue

      // Si el clip está dentro de un "take lane" (tomas archivadas) o de un
      // clip slot de Session View, Ableton no lo reproduce por defecto.
      const esArchivado = Boolean(clipEl.closest('TakeLane, ClipSlot'))

      clips.push({
        track: trackName,
        relativePath: readRelativePath(fileRef),
        originalFileSize: readOriginalFileSize(fileRef),
        durationBeats: readDurationBeats(clipEl),
        ...(esArchivado ? { principal: false } : {}),
      })
    }
  }

  return clips
}

/**
 * Live 11 y 12 (formato fácil): <RelativePath Value="Samples/Recorded/x.wav" />
 * Live 9 y 10 (formato viejo): <RelativePath><RelativePathElement Dir="Samples" />
 * <RelativePathElement Dir="Recorded" /></RelativePath> más <Name Value="x.wav" />
 * como hermano de RelativePath. El bloque <Data> hexadecimal se ignora.
 */
function readRelativePath(fileRef: Element): string | null {
  const relativePathEl = fileRef.querySelector(':scope > RelativePath')
  if (!relativePathEl) return null

  const valorDirecto = relativePathEl.getAttribute('Value')
  if (valorDirecto) return valorDirecto

  const carpetas = Array.from(relativePathEl.querySelectorAll('RelativePathElement'))
    .map((el) => el.getAttribute('Dir'))
    .filter((dir): dir is string => Boolean(dir))
  const nombreArchivo = fileRef.querySelector(':scope > Name')?.getAttribute('Value')

  if (carpetas.length === 0 && !nombreArchivo) return null
  return [...carpetas, nombreArchivo].filter(Boolean).join('/')
}

/**
 * Live deja a veces `OriginalFileSize Value="0"` (lo hemos visto en tomas
 * archivadas en carriles de tomas): no es un tamaño real —ningún archivo
 * pesa 0 bytes—, así que lo tratamos igual que si no estuviera.
 */
function readOriginalFileSize(fileRef: Element): number | null {
  const value = fileRef.querySelector(':scope > OriginalFileSize')?.getAttribute('Value')
  if (!value) return null
  const numero = Number.parseInt(value, 10)
  return numero > 0 ? numero : null
}

function readDurationBeats(clipEl: Element): number | null {
  const start = clipEl.querySelector(':scope > CurrentStart')?.getAttribute('Value')
  const end = clipEl.querySelector(':scope > CurrentEnd')?.getAttribute('Value')
  if (!start || !end) return null

  const duracion = Number.parseFloat(end) - Number.parseFloat(start)
  return Number.isFinite(duracion) ? duracion : null
}
