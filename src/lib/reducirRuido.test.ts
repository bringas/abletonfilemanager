import { describe, expect, it } from 'vitest'
import type { AudioClipInfo } from './alsReader'
import { reducirClipsPorPista } from './reducirRuido'
import type { AudioFileEntry } from './scanFolder'

function clip(nombre: string, durationBeats: number | null): AudioClipInfo {
  return {
    track: 'Voz',
    relativePath: `Samples/Recorded/${nombre}`,
    originalFileSize: null,
    durationBeats,
  }
}

function archivo(nombre: string, lastModified: number): AudioFileEntry {
  return {
    handle: {} as FileSystemFileHandle,
    path: `proyecto/Samples/Recorded/${nombre}`,
    name: nombre,
    size: 0,
    lastModified,
  }
}

describe('reducirClipsPorPista', () => {
  it('no toca una pista con pocos clips', () => {
    const clips = [clip('a.wav', 4), clip('b.wav', 8), clip('c.wav', 2)]
    expect(reducirClipsPorPista(clips, [], ['proyecto'])).toEqual(clips)
  })

  it('con muchos clips, se queda solo con el más reciente y el más largo', () => {
    const clips = Array.from({ length: 10 }, (_, i) => clip(`take${i}.wav`, i))
    // "take9" es el más largo (durationBeats=9) y además el más reciente.
    const indice = clips.map((_, i) => archivo(`take${i}.wav`, i))

    const resultado = reducirClipsPorPista(clips, indice, ['proyecto'])

    expect(resultado).toHaveLength(1)
    expect(resultado[0].relativePath).toBe('Samples/Recorded/take9.wav')
  })

  it('si el más reciente y el más largo son distintos, devuelve los dos', () => {
    const clips = [
      clip('corto-reciente.wav', 1),
      clip('largo-viejo.wav', 50),
      ...Array.from({ length: 8 }, (_, i) => clip(`relleno${i}.wav`, 2)),
    ]
    const indice = [
      archivo('corto-reciente.wav', 1000),
      archivo('largo-viejo.wav', 10),
      ...Array.from({ length: 8 }, (_, i) => archivo(`relleno${i}.wav`, 100)),
    ]

    const resultado = reducirClipsPorPista(clips, indice, ['proyecto'])
    const nombres = resultado.map((c) => c.relativePath)

    expect(nombres).toContain('Samples/Recorded/corto-reciente.wav')
    expect(nombres).toContain('Samples/Recorded/largo-viejo.wav')
    expect(resultado).toHaveLength(2)
  })

  it('cada pista se reduce por separado', () => {
    const muchosDeVoz = Array.from({ length: 10 }, (_, i) => clip(`voz${i}.wav`, i))
    const pocosDeBajo: AudioClipInfo[] = [{ ...clip('bajo.wav', 4), track: 'Bajo' }]

    const resultado = reducirClipsPorPista([...muchosDeVoz, ...pocosDeBajo], [], ['proyecto'])

    expect(resultado.filter((c) => c.track === 'Bajo')).toHaveLength(1)
    expect(resultado.filter((c) => c.track === 'Voz').length).toBeLessThanOrEqual(2)
  })
})
