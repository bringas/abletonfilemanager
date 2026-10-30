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
  /**
   * Dónde empieza y termina, dentro del archivo de audio, el trozo que usa
   * este clip (en "beats warpeados", la misma unidad que `marcasDeTempo`).
   * Varios clips distintos pueden compartir un mismo archivo largo usando
   * cada uno un trozo distinto; sin esto, solo se podría reproducir desde
   * el principio del archivo. Si falta alguno, no se puede calcular.
   */
  inicioBeats?: number
  finBeats?: number
  /**
   * Las marcas de tempo (beat ↔ segundo real) que usa Ableton para "warpear"
   * este clip. Con al menos dos, se puede convertir `inicioBeats`/`finBeats`
   * a segundos reales dentro del archivo (ver `src/lib/warpTiming.ts`).
   */
  marcasDeTempo?: MarcaDeTempo[]
}

export interface MarcaDeTempo {
  segundos: number
  beats: number
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
      const tramo = readTramoEnBeats(clipEl)
      const marcasDeTempo = readMarcasDeTempo(clipEl)

      clips.push({
        track: trackName,
        relativePath: readRelativePath(fileRef),
        originalFileSize: readOriginalFileSize(fileRef),
        durationBeats: readDurationBeats(clipEl),
        ...(esArchivado ? { principal: false } : {}),
        ...(tramo ? { inicioBeats: tramo.inicio, finBeats: tramo.fin } : {}),
        ...(marcasDeTempo.length > 0 ? { marcasDeTempo } : {}),
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

/**
 * El trozo del archivo que usa el clip, en beats "warpeados": no es la
 * posición en el arreglo (eso es `CurrentStart`/`CurrentEnd`), sino la
 * región dentro del propio archivo de audio. `HiddenLoopStart`/`End` es la
 * región real que suena, aunque el bucle visible (`LoopStart`/`End`) esté
 * desactivado.
 */
function readTramoEnBeats(clipEl: Element): { inicio: number; fin: number } | null {
  const loop = clipEl.querySelector(':scope > Loop')
  const inicio = loop?.querySelector(':scope > HiddenLoopStart')?.getAttribute('Value')
  const fin = loop?.querySelector(':scope > HiddenLoopEnd')?.getAttribute('Value')
  if (!inicio || !fin) return null

  const inicioNum = Number.parseFloat(inicio)
  const finNum = Number.parseFloat(fin)
  if (!Number.isFinite(inicioNum) || !Number.isFinite(finNum) || finNum <= inicioNum) return null
  return { inicio: inicioNum, fin: finNum }
}

/**
 * Las marcas de tempo del clip (beat ↔ segundo real del archivo), la misma
 * información que usa Ableton para "warpear" el audio al tempo del
 * proyecto. Con dos o más se puede convertir cualquier beat a un segundo
 * real dentro del archivo (ver `beatsASegundos` en `warpTiming.ts`).
 */
function readMarcasDeTempo(clipEl: Element): MarcaDeTempo[] {
  return Array.from(clipEl.querySelectorAll(':scope > WarpMarkers > WarpMarker'))
    .map((marcador) => ({
      segundos: Number.parseFloat(marcador.getAttribute('SecTime') ?? ''),
      beats: Number.parseFloat(marcador.getAttribute('BeatTime') ?? ''),
    }))
    .filter((marca) => Number.isFinite(marca.segundos) && Number.isFinite(marca.beats))
}
