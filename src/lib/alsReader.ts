export interface AlsProjectInfo {
  liveVersion: string
  bpm: number | null
  tracks: string[]
}

const TRACK_TAGS = ['AudioTrack', 'MidiTrack', 'GroupTrack', 'ReturnTrack']

/**
 * Lee los bytes de un archivo .als (un XML comprimido en gzip) y devuelve
 * la versión de Live, el BPM y los nombres de las pistas.
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
  }
}

async function decompressToText(bytes: Uint8Array): Promise<string> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const decompressed = source.pipeThrough(new DecompressionStream('gzip'))

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
